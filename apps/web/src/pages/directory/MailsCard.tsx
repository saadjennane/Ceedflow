/**
 * Ce qui a été écrit à cette fiche, et ce qu'il en est advenu.
 *
 * The page somebody opens when a founder says "I received nothing": every
 * letter to their addresses, in their name or about their candidacies — sent,
 * delivered, held, blocked by the test space, bounced — and why. Passwords a
 * letter carried are never shown.
 */
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

interface Letter {
  id: string;
  kind: string;
  to: string;
  subject: string;
  body: string;
  state: 'queued' | 'held' | 'sent' | 'failed' | 'bounced';
  error: string;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

/** What became of a letter, in a word, a colour and a sentence. */
function fate(l: Letter): { label: string; tone: string; why: string } {
  if (l.state === 'sent' && l.deliveredAt) {
    return { label: 'Delivered', tone: 'badge ok', why: 'Accepted by the receiving server. If it is not in the inbox, look in spam or quarantine.' };
  }
  if (l.state === 'sent') return { label: 'Sent', tone: 'badge info', why: 'Handed to the mail provider; no delivery receipt yet.' };
  if (l.state === 'queued') return { label: 'Waiting', tone: 'badge', why: 'In the queue — it leaves within a minute, or at its scheduled time.' };
  if (l.state === 'held' && l.error.startsWith('Blocked')) {
    return { label: 'Blocked — test space', tone: 'badge warn', why: 'A test programme writes only to test addresses (colleagues’ aliases).' };
  }
  if (l.state === 'held') {
    return { label: 'Held', tone: 'badge warn', why: l.error || 'Not sent: sending is off here, or this address unsubscribed or bounced before.' };
  }
  if (l.state === 'bounced') return { label: 'Bounced', tone: 'badge stop', why: l.error || 'The receiving server refused it.' };
  return { label: 'Failed', tone: 'badge stop', why: l.error || 'The mail provider refused it.' };
}

export function MailsCard({ recordId }: { recordId: string }) {
  const letters = useAsync(() => api.get<Letter[]>(`/api/records/${recordId}/letters`), `letters:${recordId}`);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows = letters.data ?? [];
  const shown = all ? rows : rows.slice(0, 8);

  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row">
        <div className="eyebrow" style={{ flex: 1 }}>Mails</div>
        {rows.length > 0 && <span className="badge num">{rows.length}</span>}
      </div>
      {letters.error ? (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{letters.error}</p>
      ) : !letters.data ? (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Loading…</p>
      ) : !rows.length ? (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Nothing has been written to them yet.</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {shown.map((l) => {
            const f = fate(l);
            return (
              <div key={l.id} className="stack" style={{ gap: 3 }}>
                <button
                  type="button"
                  className="linkish"
                  style={{ textAlign: 'left', fontSize: 12.5, display: 'block' }}
                  aria-expanded={open === l.id}
                  onClick={() => setOpen(open === l.id ? null : l.id)}
                >
                  <strong>{l.subject || '(no subject)'}</strong>
                </button>
                <div className="row wrap" style={{ gap: 6, fontSize: 11.5 }}>
                  <span className={f.tone} title={f.why}>{f.label}</span>
                  <span className="faint">{formatDate(l.createdAt.slice(0, 10))} · {l.to}</span>
                </div>
                {open === l.id && (
                  <>
                    <span className="faint" style={{ fontSize: 11.5 }}>{f.why}</span>
                    <pre className="letter" style={{ margin: 0, fontSize: 12 }}>{l.body}</pre>
                  </>
                )}
              </div>
            );
          })}
          {rows.length > 8 && (
            <button type="button" className="linkish" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
