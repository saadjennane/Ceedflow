/**
 * Extraire des tâches d'un compte rendu, depuis la page Tasks : on colle le
 * texte, l'IA lit le reste — titre, date, programmes, responsables.
 */
import { type MeetingRow } from '@ceed/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';

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
      navigate(`/tasks/meetings/${made.id}`);
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

/** Les comptes rendus déjà analysés, avec ce qu'ils ont donné. */
export function MeetingHistory() {
  const history = useAsync(() => api.get<MeetingRow[]>('/api/meeting-assistant/meetings'), 'meeting-history');
  if (history.error) return <div className="empty">{history.error}</div>;
  if (!history.data) return <div className="faint">Loading…</div>;
  if (!history.data.length) return <div className="empty">No meeting notes analysed yet — use AI Extract Tasks.</div>;
  return (
    <div className="rows">
      {history.data.map((m) => (
        <Link key={m.id} to={`/tasks/meetings/${m.id}`} className="rowcard card-pad row wrap" style={{ gap: 10, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>{m.title || 'Meeting notes'}</strong>
            <div className="faint" style={{ fontSize: 12 }}>
              {formatDate(m.meetingOn)} · by {m.createdByName || '—'}
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
  );
}
