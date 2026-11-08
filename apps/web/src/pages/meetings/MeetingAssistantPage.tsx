/**
 * L'assistant de réunion : coller un compte rendu, l'analyser, et retrouver
 * les réunions déjà traitées.
 */
import { type MeetingOptions, type MeetingRow } from '@ceed/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';

const today = () => {
  /* Le jour de Casablanca, pas celui du serveur ni de l'UTC. */
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
};

export function MeetingAssistantPage() {
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const history = useAsync(() => api.get<MeetingRow[]>('/api/meeting-assistant/meetings'), 'meeting-history');
  const [title, setTitle] = useState('');
  const [meetingOn, setMeetingOn] = useState(today);
  const [editionId, setEditionId] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const analyse = async () => {
    setBusy(true);
    setErrors({});
    try {
      const made = await api.post<{ id: string }>('/api/meeting-assistant/meetings', { title, meetingOn, editionId: editionId || null, content });
      navigate(`/meetings/${made.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const canWrite = options.data?.canWrite ?? false;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>AI Meeting Assistant</h1>
          <span className="faint" style={{ fontSize: 12.5 }}>Turn meeting notes into actionable tasks.</span>
        </div>
      </header>

      <div className="page stack" style={{ gap: 16, maxWidth: 900 }}>
        {canWrite && (
          <section className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <div className="field" style={{ flex: '2 1 260px' }}>
                <label htmlFor="mtg-title">Meeting Title</label>
                <input id="mtg-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Réunion de coordination The Builders" />
                {errors.title && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.title}</div>}
              </div>
              <div className="field" style={{ flex: '1 1 150px' }}>
                <label htmlFor="mtg-date">Meeting Date</label>
                <input id="mtg-date" className="input" type="date" value={meetingOn} onChange={(e) => setMeetingOn(e.target.value)} />
              </div>
              <div className="field" style={{ flex: '2 1 220px' }}>
                <label htmlFor="mtg-edition">Related Program</label>
                <select id="mtg-edition" className="select" value={editionId} onChange={(e) => setEditionId(e.target.value)}>
                  <option value="">None</option>
                  {(options.data?.editions ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="mtg-notes">Meeting Notes</label>
              <textarea
                id="mtg-notes"
                className="textarea"
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Collez le compte rendu — structuré ou en notes libres, en français ou en anglais."
              />
              {errors.content && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.content}</div>}
            </div>
            <div className="row">
              <span className="faint" style={{ fontSize: 12, flex: 1 }}>The AI proposes; nothing is created until you confirm.</span>
              <button className="btn primary" disabled={busy || !title.trim() || content.trim().length < 20} onClick={analyse}>
                <Icon name="send" size={13} /> {busy ? 'Sending…' : 'Analyze Meeting'}
              </button>
            </div>
          </section>
        )}

        <section className="stack" style={{ gap: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Meeting History</h3>
          {!history.data ? (
            <div className="faint">Loading…</div>
          ) : !history.data.length ? (
            <div className="empty">No meeting analysed yet.</div>
          ) : (
            <div className="rows">
              {history.data.map((m) => (
                <Link key={m.id} to={`/meetings/${m.id}`} className="rowcard card-pad row wrap" style={{ gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <strong>{m.title}</strong>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {formatDate(m.meetingOn)}{m.editionName && ` · ${m.editionName}`} · by {m.createdByName || '—'}
                      {m.analysedAt && ` · analysed ${formatDate(m.analysedAt)}`}
                    </div>
                  </div>
                  {m.status === 'pending' && <span className="badge info">Analysing…</span>}
                  {m.status === 'failed' && <span className="badge stop">Analysis failed</span>}
                  {m.status === 'done' && (
                    <span className="faint" style={{ fontSize: 12.5 }}>
                      {m.proposed} found · <strong>{m.created}</strong> created
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
