import { EDITION_STATUSES, type Candidate, type EditionDetail } from '@ceed/shared';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatRange } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { DateField, NumberField, TextField } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../ui/Overlays';
import { BuilderCanvas } from './builder/BuilderCanvas';
import { CandidatesTab } from './candidates/CandidatesTab';
import '../ui/builder.css';
import '../ui/programs.css';

type Tab = 'builder' | 'candidates';

/** The edition's tabs, in the order the prototype settled on. Unbuilt ones stay visible and inert. */
const TABS: { key: string; label: string; built: boolean }[] = [
  { key: 'overview', label: 'Overview', built: false },
  { key: 'builder', label: 'Builder', built: true },
  { key: 'candidates', label: 'Candidates', built: true },
  { key: 'cohort', label: 'Cohort', built: false },
  { key: 'activities', label: 'Activities', built: false },
  { key: 'deliverables', label: 'Deliverables', built: false },
  { key: 'team', label: 'Team', built: false },
  { key: 'reports', label: 'Reports', built: false },
  { key: 'public', label: 'Public Page', built: false },
  { key: 'settings', label: 'Settings', built: false },
];

export function EditionPage() {
  const { editionId = '' } = useParams();
  const edition = useAsync(() => api.get<EditionDetail>(`/api/editions/${editionId}`), editionId);
  // The open tab and track live in the URL, so a link points at what you were looking at.
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'candidates' ? 'candidates' : 'builder';
  const trackId = params.get('track');
  const setTab = (next: Tab) =>
    setParams((p) => {
      if (next === 'builder') p.delete('tab');
      else p.set('tab', next);
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

  const candidates = useAsync(
    () =>
      track ? api.get<Candidate[]>(`/api/editions/${editionId}/candidates?trackId=${track.id}`) : Promise.resolve([]),
    `${editionId}:${track?.id ?? ''}`,
  );

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
          {detail.seats > 0 && (
            <>
              {' · '}
              <span className="num">{detail.seats}</span> seats
            </>
          )}
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
        {TABS.map((t) =>
          t.built ? (
            <button
              key={t.key}
              role="tab"
              className={tab === t.key ? 'tab on' : 'tab'}
              onClick={() => setTab(t.key as Tab)}
            >
              {t.label}
              {t.key === 'candidates' && candidates.data?.length ? (
                <span className="tab-count num">{candidates.data.length}</span>
              ) : null}
            </button>
          ) : (
            <span key={t.key} className="tab off" title="Not built yet">
              {t.label}
            </span>
          ),
        )}
      </nav>

      {tab === 'builder' ? (
        <BuilderCanvas
          edition={detail}
          track={track}
          onSelectTrack={setTrackId}
          onChanged={refresh}
          onPublish={() => setStatus('Published')}
        />
      ) : (
        <div className="page">
          <TrackBar edition={detail} currentTrackId={track.id} onSelect={setTrackId} onChanged={refresh} />
          <CandidatesTab edition={detail} track={track} candidates={candidates.data ?? []} onChanged={refresh} />
        </div>
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
}: {
  edition: EditionDetail;
  currentTrackId: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
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
    seats: edition.seats,
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
      <div className="grid-2">
        <TextField label="City" value={draft.city} onChange={(v) => set({ city: v })} />
        <NumberField label="Seats" value={draft.seats} onChange={(v) => set({ seats: v })} min={0} />
      </div>
    </Modal>
  );
}
