import { EDITION_STATUSES, type BlockType, type Candidate, type EditionDetail } from '@ceed/shared';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatRange } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { DateField, TextField } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../ui/Overlays';
import { BlockDrawer } from './builder/BlockDrawer';
import { BuilderCanvas } from './builder/BuilderCanvas';
import { CandidatesTab } from './candidates/CandidatesTab';
import { WorkTab } from './work/WorkTab';
import '../ui/builder.css';
import '../ui/programs.css';

type Tab = 'builder' | 'startups' | 'outreach' | 'committees' | 'review';

/**
 * The builder composes the workflow; these run it. A work tab only appears when
 * the track holds a block of its kind, so the bar reads out what the edition does.
 */
const WORK_TABS: { key: Tab; label: string; types: BlockType[] }[] = [
  { key: 'outreach', label: 'Outreach', types: ['sourcing'] },
  { key: 'committees', label: 'Committees', types: ['committee'] },
  // Measuring and cutting are one moment of the funnel, so they are one screen.
  { key: 'review', label: 'Review', types: ['evaluation', 'selection'] },
];

/** Still to build. They stay visible and inert so the shape of the product reads. */
const LATER_TABS = ['Activities', 'Deliverables', 'Reports', 'Settings'];

export function EditionPage() {
  const { editionId = '' } = useParams();
  const edition = useAsync(() => api.get<EditionDetail>(`/api/editions/${editionId}`), editionId);
  // The open tab and track live in the URL, so a link points at what you were looking at.
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') ?? 'builder';
  const trackId = params.get('track');
  // Two different things, so two parameters: which block the tab is working on,
  // and which block's Setup drawer is open over it.
  const openBlockId = params.get('block');
  const setupId = params.get('setup');
  const setOpenBlockId = (next: string | null) =>
    setParams(
      (p) => {
        if (next) p.set('block', next);
        else p.delete('block');
        return p;
      },
      { replace: true },
    );
  const setSetupId = (next: string | null) =>
    setParams(
      (p) => {
        if (next) p.set('setup', next);
        else p.delete('setup');
        return p;
      },
      { replace: true },
    );
  /** Sends you to where a block's work happens, closing any drawer on the way. */
  const goToWork = (next: string, blockId: string) =>
    setParams((p) => {
      p.set('tab', next);
      p.set('block', blockId);
      p.delete('setup');
      return p;
    });
  const setTab = (next: Tab) =>
    setParams((p) => {
      if (next === 'builder') p.delete('tab');
      else p.set('tab', next);
      p.delete('block');
      p.delete('btab');
      return p;
    });
  const setTrackId = (next: string) =>
    setParams((p) => {
      p.set('track', next);
      return p;
    });

  const [editing, setEditing] = useState(false);
  const toast = useToast();

  const detail = edition.data;
  const tracks = detail?.tracks ?? [];
  const track = useMemo(() => tracks.find((t) => t.id === trackId) ?? tracks[0] ?? null, [tracks, trackId]);

  // Every candidate of the edition: the cohort spans tracks even though the
  // funnel does not, so the table filters rather than the fetch.
  const candidates = useAsync(() => api.get<Candidate[]>(`/api/editions/${editionId}/candidates`), editionId);

  const refresh = useCallback(() => {
    edition.reload();
    candidates.reload();
  }, [edition, candidates]);

  if (edition.error) return <div className="page"><div className="empty">{edition.error}</div></div>;
  if (!detail || !track) return <div className="page"><div className="empty">Loading…</div></div>;

  const setStatus = async (status: string) => {
    await api.patch(`/api/editions/${detail.id}`, { status });
    edition.reload();
    toast(`Edition marked ${status.toLowerCase()}.`);
  };

  const cohortSize = candidates.data?.filter((c) => c.status === 'Selected').length ?? 0;
  const setupBlock = track.phases.flatMap((p) => p.blocks).find((b) => b.id === setupId) ?? null;
  const present = new Set(track.phases.flatMap((p) => p.blocks.map((b) => b.type)));
  const workTabs = WORK_TABS.filter((t) => t.types.some((type) => present.has(type)));
  const tab: Tab = (['startups', ...workTabs.map((t) => t.key)] as string[]).includes(asked)
    ? (asked as Tab)
    : 'builder';

  return (
    <>
      <header className="topbar">
        <div className="crumbs">
          <Link to="/">Programs</Link>
          <Icon name="chevronRight" size={13} />
          <Link to={`/programs/${detail.program.id}`}>{detail.program.name}</Link>
          <Icon name="chevronRight" size={13} />
        </div>
        <h1>{detail.name}</h1>
        <select
          className="status-select"
          value={detail.status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Edition status"
        >
          {EDITION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <span className="ed-meta">
          {formatRange(detail.startsOn, detail.endsOn)}
          {detail.city && <> · {detail.city}</>}
          {cohortSize > 0 && (
            <>
              {' · '}
              <span className="num">{cohortSize}</span> in the cohort
            </>
          )}
        </span>
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="edit" size={14} /> Edit
        </button>
      </header>

      <nav className="tabbar" role="tablist" aria-label="Edition">
        <span className="tab off" title="Not built yet">
          Overview
        </span>
        <button role="tab" className={tab === 'builder' ? 'tab on' : 'tab'} onClick={() => setTab('builder')}>
          Builder
        </button>
        <button role="tab" className={tab === 'startups' ? 'tab on' : 'tab'} onClick={() => setTab('startups')}>
          Startups
        </button>
        {workTabs.map((t) => (
          <button key={t.key} role="tab" className={tab === t.key ? 'tab on' : 'tab'} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        {LATER_TABS.map((label) => (
          <span key={label} className="tab off" title="Not built yet">
            {label}
          </span>
        ))}
      </nav>

      {tab === 'builder' ? (
        <BuilderCanvas
          edition={detail}
          track={track}
          onOpenBlock={setSetupId}
          onSelectTrack={setTrackId}
          onChanged={refresh}
          onPublish={() => setStatus('Published')}
        />
      ) : (
        <div className="page">
          <TrackBar
            edition={detail}
            currentTrackId={track.id}
            onSelect={setTrackId}
            onChanged={refresh}
            manage={false}
          />
          {tab === 'startups' ? (
            <CandidatesTab edition={detail} track={track} candidates={candidates.data ?? []} onChanged={refresh} />
          ) : (
            <WorkTab
              tab={tab}
              track={track}
              currentBlockId={openBlockId}
              onSelectBlock={setOpenBlockId}
              onChanged={refresh}
              onOpenSetup={setSetupId}
              onOpenWork={goToWork}
            />
          )}
        </div>
      )}

      {setupBlock && (
        <BlockDrawer
          block={setupBlock}
          track={track}
          candidates={candidates.data ?? []}
          currentTab={tab}
          onClose={() => setSetupId(null)}
          onChanged={refresh}
          onOpenBlock={setSetupId}
          onOpenWork={goToWork}
        />
      )}

      {editing && (
        <EditEditionModal
          edition={detail}
          onClose={() => setEditing(false)}
          onSaved={() => {
            edition.reload();
            toast('Edition updated.');
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Track bar — tracks are created, renamed and deleted from the bar    */
/* itself; nothing is decided when the edition is created.             */
/* ------------------------------------------------------------------ */

export function TrackBar({
  edition,
  currentTrackId,
  onSelect,
  onChanged,
  manage = true,
}: {
  edition: EditionDetail;
  currentTrackId: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
  /** Tracks are created, renamed and deleted in the builder. Elsewhere this only switches. */
  manage?: boolean;
}) {
  const [editor, setEditor] = useState<null | 'add' | 'rename'>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  const tracks = edition.tracks;
  const current = tracks.find((t) => t.id === currentTrackId) ?? tracks[0];
  const extra = tracks.length - 1;

  const commit = async () => {
    const value = name.trim();
    if (!value || !editor) return setEditor(null);
    if (editor === 'add') {
      const created = await api.post<{ id: string }>(`/api/editions/${edition.id}/tracks`, { name: value });
      onChanged();
      onSelect(created.id);
      toast('Track added.');
    } else {
      await api.patch(`/api/tracks/${current.id}`, { name: value });
      onChanged();
      toast('Track renamed.');
    }
    setName('');
    setEditor(null);
  };

  // One track is not a choice; showing a bar for it is noise.
  if (!manage && tracks.length < 2) return null;

  if (!manage) {
    return (
      <div className="track-bar">
        <span className="track-label">Track</span>
        {tracks.map((t) => (
          <button key={t.id} className={t.id === current.id ? 'track on' : 'track'} onClick={() => onSelect(t.id)}>
            {t.name}
          </button>
        ))}
        <div className="spacer" />
        <span className="track-hint">Tracks are set up in the builder</span>
      </div>
    );
  }

  return (
    <>
      <div className="track-bar">
        <span className="track-label">Track</span>
        {tracks.map((t) => (
          <button key={t.id} className={t.id === current.id ? 'track on' : 'track'} onClick={() => onSelect(t.id)}>
            {t.name}
          </button>
        ))}

        {editor ? (
          <span className="track-inline">
            <input
              autoFocus
              value={name}
              placeholder="Track name"
              aria-label="Track name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditor(null);
              }}
            />
            <button className="btn primary sm" onClick={commit}>
              {editor === 'rename' ? 'Rename' : 'Add'}
            </button>
            <button className="btn ghost icon sm" onClick={() => setEditor(null)} aria-label="Cancel">
              <Icon name="x" size={13} />
            </button>
          </span>
        ) : (
          <button
            className="track-add"
            onClick={() => {
              setName('');
              setEditor('add');
            }}
            title="Add a track to this edition"
          >
            + Add Track
          </button>
        )}

        <div className="spacer" />
        <span className="track-hint">
          {extra > 0
            ? `${extra} track${extra > 1 ? 's' : ''} in this edition`
            : 'One common workflow — add a track to split it by theme'}
        </span>
        <button
          className="btn ghost sm"
          onClick={() => {
            setName(current.name);
            setEditor('rename');
          }}
        >
          Rename
        </button>
        {!current.isDefault && (
          <button className="btn ghost danger sm" onClick={() => setConfirm(true)}>
            Delete
          </button>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={`Delete ${current.name}?`}
          body="Its phases, blocks and candidates go with it."
          confirmLabel="Delete track"
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/tracks/${current.id}`);
            onSelect(edition.tracks.find((t) => t.isDefault)?.id ?? '');
            onChanged();
            toast('Track deleted.');
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function EditEditionModal({
  edition,
  onClose,
  onSaved,
}: {
  edition: EditionDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: edition.name,
    startsOn: edition.startsOn,
    endsOn: edition.endsOn,
    city: edition.city,
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Modal
      title="Edit edition"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !draft.name.trim()}
            onClick={async () => {
              setSaving(true);
              await api.patch(`/api/editions/${edition.id}`, draft);
              setSaving(false);
              onSaved();
              onClose();
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <TextField label="Edition name" value={draft.name} onChange={(v) => set({ name: v })} />
      <div className="grid-2">
        <DateField label="Starts on" value={draft.startsOn} onChange={(v) => set({ startsOn: v })} />
        <DateField label="Ends on" value={draft.endsOn} onChange={(v) => set({ endsOn: v })} />
      </div>
      <TextField label="City" value={draft.city} onChange={(v) => set({ city: v })} />
    </Modal>
  );
}
