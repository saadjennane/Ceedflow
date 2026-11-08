/**
 * Une réunion de l'historique : son compte rendu, ce que l'IA y a lu, et ses
 * tâches — proposées, ajoutées ou écartées. Les mêmes cartes que le backlog.
 */
import { type MeetingOptions, type MeetingSuggestion, type MeetingView } from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, useToast } from '../../ui/Overlays';
import { ProposalCard } from './ProposalCard';

export function MeetingResultPage() {
  const { meetingId = '' } = useParams();
  const view = useAsync(() => api.get<MeetingView>(`/api/meeting-assistant/meetings/${meetingId}`), `meeting:${meetingId}`);
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const m = view.data;
  useEffect(() => {
    if (m?.status !== 'pending') return;
    const t = setInterval(() => view.reload(), 2500);
    return () => clearInterval(t);
  }, [m?.status, view]);

  const run = async (fn: () => Promise<unknown>, said?: string) => {
    setBusy(true);
    try {
      await fn();
      if (said) toast(said);
      view.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const accept = (s: MeetingSuggestion) =>
    run(async () => {
      const out = await api.post<{ created: unknown[]; failed: { error: string }[] }>(`/api/meeting-assistant/meetings/${meetingId}/create`, { ids: [s.id] });
      if (out.failed.length) throw new Error(out.failed[0]!.error);
    }, 'Added to Tasks.');

  if (view.error) return <div className="page"><div className="callout warn">{view.error}</div></div>;
  if (!m || !options.data) return <div className="page faint">Loading…</div>;
  const { canWrite, members, editions, me } = options.data;
  const waiting = m.suggestions.filter((s) => s.status === 'proposed' || s.status === 'failed');
  const created = m.suggestions.filter((s) => s.status === 'created');
  const dismissed = m.suggestions.filter((s) => s.status === 'dismissed');
  const card = (s: MeetingSuggestion) => (
    <ProposalCard
      key={s.id}
      s={s}
      members={members}
      editions={editions}
      me={me}
      canWrite={canWrite}
      busy={busy}
      onPatch={(body) => run(() => api.patch(`/api/meeting-assistant/suggestions/${s.id}`, body))}
      onAccept={() => accept(s)}
      onDismiss={() => run(() => api.patch(`/api/meeting-assistant/suggestions/${s.id}`, { status: 'dismissed' }))}
    />
  );

  return (
    <>
      <header className="topbar">
        <Link className="btn ghost sm" to="/tasks?tab=meetings">
          <Icon name="chevronLeft" size={13} /> Meeting History
        </Link>
        <div className="spacer" />
        {canWrite && m.status !== 'pending' && (
          <button className="btn sm" disabled={busy} onClick={() => run(() => api.post(`/api/meeting-assistant/meetings/${meetingId}/analyse`), 'Analysing again — the tasks already added stay.')}>
            <Icon name="refresh" size={13} /> Analyze again
          </button>
        )}
        {canWrite && (
          <button className="btn ghost icon sm" aria-label="Delete this meeting" title="Delete" onClick={() => setRemoving(true)}>
            <Icon name="trash" size={13} />
          </button>
        )}
      </header>

      <div className="page stack" style={{ gap: 14, maxWidth: 1000 }}>
        <section className="stack" style={{ gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>{m.title || 'Meeting notes'}</h2>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {formatDate(m.meetingOn)} · imported by {m.createdByName || '—'}
            {m.analysedAt && ` · analysed ${formatDate(m.analysedAt)}`}
          </span>
          {m.summary && <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{m.summary}</p>}
          <button className="linkish" style={{ alignSelf: 'flex-start', fontSize: 12.5 }} onClick={() => setShowNotes(!showNotes)}>
            {showNotes ? 'Hide the notes' : 'Show the notes'}
          </button>
          {showNotes && <div className="card card-pad" style={{ whiteSpace: 'pre-wrap', fontSize: 13, overflowWrap: 'anywhere' }}>{m.content}</div>}
        </section>

        {m.status === 'pending' && <div className="callout"><Icon name="refresh" size={15} /> <div>Analysing the meeting… this takes up to a minute.</div></div>}
        {m.status === 'failed' && (
          <div className="callout warn"><Icon name="alert" size={15} /> <div>The analysis failed — {m.error} The notes are kept: run it again.</div></div>
        )}

        {m.status === 'done' && (
          <>
            <section className="prop-group">
              <div className="prop-group-head">
                <strong>Waiting</strong>
                <span className="faint" style={{ fontSize: 12 }}>{waiting.length}</span>
                <div className="spacer" />
                {canWrite && (
                  <button className="btn ghost sm" disabled={busy} onClick={() => run(() => api.post(`/api/meeting-assistant/meetings/${meetingId}/suggestions`))}>
                    <Icon name="plus" size={12} /> Add a task
                  </button>
                )}
              </div>
              {waiting.length ? waiting.map(card) : <span className="faint" style={{ fontSize: 13 }}>Nothing waiting.</span>}
            </section>
            {created.length > 0 && (
              <section className="prop-group">
                <div className="prop-group-head"><strong>Added to Tasks</strong> <span className="faint" style={{ fontSize: 12 }}>{created.length}</span></div>
                {created.map(card)}
              </section>
            )}
            {dismissed.length > 0 && (
              <section className="prop-group">
                <div className="prop-group-head"><strong>Dismissed</strong> <span className="faint" style={{ fontSize: 12 }}>{dismissed.length}</span></div>
                {dismissed.map((s) => (
                  <div key={s.id} className="row" style={{ gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>{card(s)}</div>
                    {canWrite && (
                      <button className="btn ghost sm" disabled={busy} onClick={() => run(() => api.patch(`/api/meeting-assistant/suggestions/${s.id}`, { status: 'proposed' }))}>
                        Restore
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title={`Delete “${m.title || 'Meeting notes'}”?`}
          body={`Its notes and the proposals still waiting go.${created.length ? ` The ${created.length} task${created.length === 1 ? '' : 's'} already added stay in Tasks.` : ''}`}
          confirmLabel="Delete"
          destructive
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            try {
              await api.del(`/api/meeting-assistant/meetings/${meetingId}`);
              toast('Deleted.');
              navigate('/tasks?tab=meetings');
            } catch (err) {
              toast((err as Error).message, true);
            }
          }}
        />
      )}
    </>
  );
}
