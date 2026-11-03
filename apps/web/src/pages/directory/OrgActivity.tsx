/**
 * L'activité d'une organisation, en un fil : ses programmes, sa fiche, ses
 * mails, ses tâches — et les notes de l'équipe, qui n'existent que là. Une
 * note se corrige ou se retire par qui l'a écrite.
 */
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';

interface Item {
  id: string;
  at: string;
  kind: 'note' | 'programme' | 'sheet' | 'mail' | 'task';
  label: string;
  detail: string;
  by: string;
  noteId?: string;
  byId?: string | null;
}

const KINDS: { key: Item['kind']; label: string; icon: string }[] = [
  { key: 'note', label: 'Notes', icon: 'edit' },
  { key: 'programme', label: 'Programmes', icon: 'layers' },
  { key: 'sheet', label: 'Sheet', icon: 'form' },
  { key: 'mail', label: 'Mails', icon: 'send' },
  { key: 'task', label: 'Tasks', icon: 'check' },
];

export function OrgActivity({ recordId, limit }: { recordId: string; limit?: number }) {
  const feed = useAsync(() => api.get<Item[]>(`/api/records/${recordId}/activity`), `activity:${recordId}`);
  const { me } = useAccount();
  const [only, setOnly] = useState<Item['kind'] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const toast = useToast();

  const write = async () => {
    setBusy(true);
    try {
      await api.post(`/api/records/${recordId}/notes`, { body: draft });
      setDraft('');
      feed.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const change = async (noteId: string, body: string | null) => {
    try {
      if (body === null) await api.del(`/api/notes/${noteId}`);
      else await api.patch(`/api/notes/${noteId}`, { body });
      setEditing(null);
      feed.reload();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const items = (feed.data ?? []).filter((i) => !only || i.kind === only);
  const shown = limit ? items.slice(0, limit) : items;
  const icon = (k: Item['kind']) => KINDS.find((x) => x.key === k)?.icon ?? 'check';

  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      {!limit && (
        <>
          {/* Ce que l'équipe apprend ailleurs — un appel, une rencontre. Jamais montré à la startup. */}
          <div className="stack" style={{ gap: 6 }}>
            <textarea
              className="textarea"
              rows={2}
              value={draft}
              placeholder="A note for the team — a call, a meeting, what you learnt. The startup never sees it."
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn primary sm" style={{ alignSelf: 'flex-end' }} disabled={busy || !draft.trim()} onClick={write}>
              <Icon name="edit" size={12} /> Add the note
            </button>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={!only ? 'track on' : 'track'} onClick={() => setOnly(null)}>All</button>
            {KINDS.map((k) => (
              <button key={k.key} className={only === k.key ? 'track on' : 'track'} onClick={() => setOnly(k.key)}>
                {k.label} <span className="num">{(feed.data ?? []).filter((i) => i.kind === k.key).length}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {limit && <div className="eyebrow">Latest activity</div>}
      {feed.data && !shown.length && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Nothing yet.</p>}
      <ol className="timeline">
        {shown.map((i) => (
          <li key={i.id} className="timeline-item">
            <span className={i.kind === 'note' ? 'timeline-dot note' : 'timeline-dot'}>
              <Icon name={icon(i.kind)} size={12} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {editing?.id === i.noteId ? (
                <span className="stack" style={{ gap: 6 }}>
                  <textarea className="textarea" rows={2} value={editing!.body} onChange={(e) => setEditing({ id: editing!.id, body: e.target.value })} />
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn primary sm" onClick={() => change(editing!.id, editing!.body)}>Save</button>
                    <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                  </span>
                </span>
              ) : (
                <strong style={{ fontSize: 13, whiteSpace: i.kind === 'note' ? 'pre-wrap' : undefined }}>{i.label}</strong>
              )}
              <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                {[formatDate(i.at.slice(0, 10)), i.by, i.detail].filter(Boolean).join(' · ')}
              </span>
            </span>
            {i.noteId && i.byId && me?.record.id === i.byId && editing?.id !== i.noteId && (
              <span className="row" style={{ gap: 2 }}>
                <button className="btn ghost icon sm" aria-label="Edit the note" onClick={() => setEditing({ id: i.noteId!, body: i.label })}>
                  <Icon name="edit" size={12} />
                </button>
                <button className="btn ghost icon sm" aria-label="Remove the note" onClick={() => change(i.noteId!, null)}>
                  <Icon name="trash" size={12} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
