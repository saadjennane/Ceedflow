/**
 * Extraire des tâches d'un compte rendu, depuis la page Tasks : on colle le
 * texte, l'IA lit le reste — titre, date, programmes, responsables.
 */
import { type MeetingBacklog, type MeetingOptions, type MeetingRow, type MeetingSuggestion } from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../ui/Overlays';
import { ProposalCard } from './ProposalCard';

export function ExtractTasksModal({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const analyse = async () => {
    setBusy(true);
    setError('');
    try {
      const made = await api.post<{ id: string }>('/api/meeting-assistant/meetings', { content });
      onClose();
      navigate(`/tasks?tab=backlog&from=${made.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields?.content) setError(err.fields.content);
      toast((err as Error).message, true);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="AI Extract Tasks"
      subtitle="Paste the meeting notes. The AI proposes the tasks; nothing is created until you confirm."
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <div className="spacer" />
          <button className="btn primary" disabled={busy || content.trim().length < 20} onClick={analyse}>
            <Icon name="send" size={13} /> {busy ? 'Sending…' : 'Analyze'}
          </button>
        </>
      }
    >
      <textarea
        className="textarea"
        rows={16}
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Collez le compte rendu — structuré ou en notes libres, en français ou en anglais."
        aria-label="Meeting notes"
      />
      {error && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{error}</div>}
    </Modal>
  );
}

/** Les comptes rendus déjà analysés, avec ce qu'ils ont donné — et de quoi en retirer un. */
export function MeetingHistory({ canWrite }: { canWrite: boolean }) {
  const history = useAsync(() => api.get<MeetingRow[]>('/api/meeting-assistant/meetings'), 'meeting-history');
  const [removing, setRemoving] = useState<MeetingRow | null>(null);
  const toast = useToast();
  if (history.error) return <div className="empty">{history.error}</div>;
  if (!history.data) return <div className="faint">Loading…</div>;
  if (!history.data.length) return <div className="empty">No meeting notes analysed yet — use AI Extract Tasks.</div>;
  return (
    <>
      <div className="rows">
        {history.data.map((m) => (
          <div key={m.id} className="rowcard card-pad row wrap" style={{ gap: 10 }}>
            <Link to={`/tasks/meetings/${m.id}`} style={{ flex: 1, minWidth: 200, textDecoration: 'none', color: 'inherit' }}>
              <strong>{m.title || 'Meeting notes'}</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                {formatDate(m.meetingOn)} · by {m.createdByName || '—'}
                {m.analysedAt && ` · analysed ${formatDate(m.analysedAt)}`}
              </div>
            </Link>
            {m.status === 'pending' && <span className="badge info">Analysing…</span>}
            {m.status === 'failed' && <span className="badge stop">Analysis failed</span>}
            {m.status === 'done' && (
              <span className="faint" style={{ fontSize: 12.5 }}>
                {m.proposed} found · <strong>{m.created}</strong> created
              </span>
            )}
            {canWrite && (
              <button className="btn ghost icon sm" aria-label={`Delete ${m.title || 'these notes'}`} title="Delete" onClick={() => setRemoving(m)}>
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          title={`Delete “${removing.title || 'Meeting notes'}”?`}
          body={`Its notes and the proposals still waiting go.${removing.created ? ` The ${removing.created} task${removing.created === 1 ? '' : 's'} already created stay in Tasks.` : ''}`}
          confirmLabel="Delete"
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.del(`/api/meeting-assistant/meetings/${removing.id}`);
              toast('Deleted.');
              setRemoving(null);
              history.reload();
            } catch (err) {
              toast((err as Error).message, true);
            }
          }}
        />
      )}
    </>
  );
}

/**
 * Le backlog : les tâches proposées qui attendent une décision, toutes
 * réunions confondues. ✓ en ajoute une à Tasks, ✕ l'écarte ; « Add all ready »
 * ajoute d'un coup toutes celles qui ont un responsable.
 */
export function MeetingBacklogView({ onCreated, from }: { onCreated: () => void; from: string }) {
  const backlog = useAsync(() => api.get<MeetingBacklog>('/api/meeting-assistant/backlog'), 'meeting-backlog');
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const [tell, setTell] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  /* Une analyse en cours : la liste se remet à jour d'elle-même. */
  const analysing = backlog.data?.analysing.some((a) => a.status === 'pending');
  useEffect(() => {
    if (!analysing) return;
    const t = setInterval(() => backlog.reload(), 2500);
    return () => clearInterval(t);
  }, [analysing, backlog]);

  const create = async (ids: string[]) => {
    setBusy(true);
    try {
      const out = await api.post<{ created: unknown[]; failed: { id: string; error: string }[]; told: number }>(
        '/api/meeting-assistant/backlog/create',
        { ids, tell },
      );
      const n = out.created.length;
      toast(
        out.failed.length
          ? `${n} added to Tasks. ${out.failed.length} could not be: ${out.failed[0]!.error}`
          : `${n} task${n === 1 ? '' : 's'} added to Tasks${out.told ? ` — ${out.told} announced by email` : ''}.`,
        out.failed.length > 0,
      );
      backlog.reload();
      onCreated();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const patch = async (s: MeetingSuggestion, body: Record<string, unknown>) => {
    try {
      await api.patch(`/api/meeting-assistant/suggestions/${s.id}`, body);
      backlog.reload();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  if (backlog.error) return <div className="empty">{backlog.error}</div>;
  if (!backlog.data || !options.data) return <div className="faint">Loading…</div>;
  const { items } = backlog.data;
  const canWrite = options.data.canWrite;
  /* Prêtes : un responsable, un intitulé — et pas un doublon possible, qui reste à trancher à la main. */
  const ready = items.filter((s) => s.assigneeId && s.title.trim() && !s.duplicate);
  const groups = [...new Map(items.map((s) => [s.meetingId, { id: s.meetingId, title: s.meetingTitle, on: s.meetingOn }])).values()];

  return (
    <div className="stack" style={{ gap: 14 }}>
      {backlog.data.analysing.map((a) => (
        <div key={a.id} className={a.status === 'failed' ? 'callout warn' : 'callout'}>
          <Icon name={a.status === 'failed' ? 'alert' : 'refresh'} size={15} />
          <div style={{ flex: 1 }}>
            {a.status === 'pending'
              ? `Analysing ${a.id === from ? 'your notes' : a.title || 'meeting notes'}… the proposals appear here in a minute.`
              : `The analysis of ${a.title || 'meeting notes'} failed — ${a.error}`}
          </div>
          {a.status === 'failed' && <Link className="btn sm" to={`/tasks/meetings/${a.id}`}>Open</Link>}
        </div>
      ))}

      {canWrite && items.length > 0 && (
        <div className="row wrap" style={{ gap: 10 }}>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {items.length} waiting · {ready.length} ready
            {items.length > ready.length ? ` · ${items.length - ready.length} to settle by hand (no one assigned, or a possible duplicate)` : ''}
          </span>
          <div className="spacer" />
          <label className="check" style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
            <span>Email each person — one letter listing their tasks</span>
          </label>
          <button className="btn primary sm" disabled={busy || !ready.length} onClick={() => create(ready.map((s) => s.id))}>
            <Icon name="check" size={13} /> Add all ready ({ready.length})
          </button>
        </div>
      )}

      {!items.length && !backlog.data.analysing.length && (
        <div className="empty">Nothing waiting. Use AI Extract Tasks to turn meeting notes into tasks.</div>
      )}

      {groups.map((g) => (
        <section key={g.id} className="prop-group">
          <div className="prop-group-head">
            <Link to={`/tasks/meetings/${g.id}`}><strong>{g.title || 'Meeting notes'}</strong></Link>
            <span className="faint" style={{ fontSize: 12 }}>{formatDate(g.on)}</span>
          </div>
          {items.filter((s) => s.meetingId === g.id).map((s) => (
            <ProposalCard
              key={s.id}
              s={s}
              members={options.data!.members}
              editions={options.data!.editions}
              me={options.data!.me}
              canWrite={canWrite}
              busy={busy}
              onPatch={(body) => patch(s, body)}
              onAccept={() => create([s.id])}
              onDismiss={() => patch(s, { status: 'dismissed' })}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
