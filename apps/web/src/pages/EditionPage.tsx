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

export function EditionPage() {
  const { editionId = '' } = useParams();
  const edition = useAsync(() => api.get<EditionDetail>(`/api/editions/${editionId}`), editionId);
  // The open tab and track live in the URL, so a link points at what you were looking at.
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'candidates' ? 'candidates' : 'builder';
  const trackId = params.get('track');
  const setTab = (next: Tab) =>
    setParams((p) => {
      next === 'builder' ? p.delete('tab') : p.set('tab', next);
      return p;
    });
  const setTrackId = (next: string) =>
    setParams((p) => {
      p.set('track', next);
      return p;
    });
  const [editing, setEditing] = useState(false);
  const [addingTrack, setAddingTrack] = useState(false);
  const [trackName, setTrackName] = useState('');
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

  return (
    <>
      <header className="topbar">
        <div className="crumbs">
          <Link to="/">Programmes</Link>
          <Icon name="chevronRight" size={13} />
          <Link to={`/programs/${detail.program.id}`}>{detail.program.name}</Link>
          <Icon name="chevronRight" size={13} />
        </div>
        <h1>{detail.name}</h1>
        <select className="status-select" value={detail.status} onChange={(e) => setStatus(e.target.value)} aria-label="Edition status">
          {EDITION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="faint" style={{ fontSize: 12.5 }}>
          {formatRange(detail.startsOn, detail.endsOn)}
          {detail.city && ` · ${detail.city}`}
        </span>
        <div className="spacer" />
        <div className="seg" role="tablist">
          <button role="tab" className={tab === 'builder' ? 'on' : ''} onClick={() => setTab('builder')}>
            Builder
          </button>
          <button role="tab" className={tab === 'candidates' ? 'on' : ''} onClick={() => setTab('candidates')}>
            Candidates
            {candidates.data?.length ? <span className="num"> · {candidates.data.length}</span> : null}
          </button>
        </div>
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="edit" size={14} /> Edit
        </button>
      </header>

      <div className="track-bar">
        {tracks.map((t) => (
          <button key={t.id} className={t.id === track.id ? 'track on' : 'track'} onClick={() => setTrackId(t.id)}>
            {t.name}
            {t.isDefault && <span className="faint" style={{ fontWeight: 400 }}> · default</span>}
          </button>
        ))}
        <button className="track add" onClick={() => setAddingTrack(true)} title="Add a track">
          <Icon name="plus" size={14} /> Track
        </button>
        <div className="spacer" />
        <TrackMenu track={track} onChanged={refresh} />
      </div>

      {tab === 'builder' ? (
        <BuilderCanvas track={track} candidates={candidates.data ?? []} onChanged={refresh} />
      ) : (
        <CandidatesTab edition={detail} track={track} candidates={candidates.data ?? []} onChanged={refresh} />
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

      {addingTrack && (
        <Modal
          title="New track"
          subtitle="A track is a parallel path inside the same edition: its own phases, its own candidates."
          onClose={() => setAddingTrack(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setAddingTrack(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!trackName.trim()}
                onClick={async () => {
                  await api.post(`/api/editions/${detail.id}/tracks`, { name: trackName.trim() });
                  setTrackName('');
                  setAddingTrack(false);
                  refresh();
                  toast('Track added.');
                }}
              >
                Add track
              </button>
            </>
          }
        >
          <TextField label="Track name" value={trackName} onChange={setTrackName} placeholder="Deeptech" />
        </Modal>
      )}
    </>
  );
}

function TrackMenu({ track, onChanged }: { track: { id: string; name: string; isDefault: boolean }; onChanged: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(track.name);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  return (
    <>
      <button
        className="btn ghost sm"
        onClick={() => {
          setName(track.name);
          setRenaming(true);
        }}
      >
        <Icon name="edit" size={13} /> Rename track
      </button>
      {!track.isDefault && (
        <button className="btn ghost sm" onClick={() => setConfirm(true)}>
          <Icon name="trash" size={13} />
        </button>
      )}

      {renaming && (
        <Modal
          title="Rename track"
          onClose={() => setRenaming(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!name.trim()}
                onClick={async () => {
                  await api.patch(`/api/tracks/${track.id}`, { name: name.trim() });
                  setRenaming(false);
                  onChanged();
                  toast('Track renamed.');
                }}
              >
                Save
              </button>
            </>
          }
        >
          <TextField label="Track name" value={name} onChange={setName} />
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={`Delete ${track.name}?`}
          body="Its phases, blocks and candidates go with it."
          confirmLabel="Delete track"
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/tracks/${track.id}`);
            onChanged();
            toast('Track deleted.');
          }}
        />
      )}
    </>
  );
}

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
