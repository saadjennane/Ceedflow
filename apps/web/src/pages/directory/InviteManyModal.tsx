/**
 * Inviter une liste, étalée sur des jours.
 *
 * The spreading is the point of this window. A sending domain with no
 * reputation that writes four hundred letters on its first morning is classed
 * as spam, and from then on the jury convocations and the results go to the
 * same place. A few days once, against a whole season — so the default spreads
 * itself and the operator has to decide to go faster, rather than having to
 * know to go slower.
 */
import { useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import type { RecordRow } from './DirectoryPage';

/** Why somebody on the list hears nothing. */
const WHY: Record<string, string> = {
  no_email: 'no address on file',
  claimed: 'already signed in with their own password',
  disabled: 'their account is switched off',
};

/** Above this, a send is spread rather than fired in one morning. */
const AT_ONCE = 50;

export function InviteManyModal({
  people,
  onClose,
  onDone,
}: {
  people: RecordRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  /* Worked out here only to say what will happen; the server resolves it
     again when it writes, because this list is a promise and a promise
     computed on the screen is one that drifts. */
  const reachable = people.filter((p) => p.email.trim() && p.account?.state !== 'claimed' && p.account?.state !== 'disabled');
  const left = people.filter((p) => !reachable.includes(p));

  const [spread, setSpread] = useState(reachable.length > AT_ONCE);
  const [perDay, setPerDay] = useState(AT_ONCE);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const days = spread ? Math.ceil(reachable.length / Math.max(perDay, 1)) : 1;

  const go = async () => {
    setBusy(true);
    try {
      const out = await api.post<{ written: number; days: number }>('/api/records/invite-many', {
        recordIds: reachable.map((p) => p.id),
        perDay: spread ? perDay : null,
      });
      toast(
        out.days > 1
          ? `${out.written} invitations written, going out over ${out.days} days.`
          : `${out.written} invitations written.`,
      );
      onDone();
      onClose();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Invite ${reachable.length} ${reachable.length === 1 ? 'person' : 'people'}`}
      subtitle={
        left.length
          ? `${left.length} of the ${people.length} picked cannot be invited.`
          : 'Each one gets an account and a password that works.'
      }
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !reachable.length} onClick={() => void go()}>
            <Icon name="send" size={14} />
            {days > 1 ? `Invite ${reachable.length} over ${days} days` : `Invite ${reachable.length}`}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {reachable.length > AT_ONCE && (
          <div className="callout">
            <Icon name="alert" size={15} />
            <div>
              <strong>{reachable.length} at once is a lot for a young sending domain.</strong> Writing to everybody on
              one morning is how a domain is classed as spam — and from then on the jury convocations and the results
              go to the same place.
            </div>
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} />
          <span>
            <strong>Spread it over days</strong>
            <div className="faint" style={{ fontSize: 12 }}>
              The first batch goes now; the rest wait their turn in the queue.
            </div>
          </span>
        </label>

        {spread && (
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <input
              className="input num"
              type="number"
              min={1}
              max={2000}
              style={{ width: 90 }}
              aria-label="How many a day"
              value={perDay}
              onChange={(e) => setPerDay(Math.max(1, Number(e.target.value) || 1))}
            />
            <span className="faint" style={{ fontSize: 12.5 }}>
              a day — {days} day{days === 1 ? '' : 's'} in all
            </span>
          </div>
        )}

        {/* Named, not counted: a number says there is a problem, a name says
            whose record to go and open. */}
        {left.length > 0 && (
          <details>
            <summary className="faint" style={{ fontSize: 12.5, cursor: 'pointer' }}>
              {left.length} will hear nothing
            </summary>
            <div className="rows" style={{ marginTop: 6 }}>
              {left.map((p) => (
                <div className="rowcard row" key={p.id} style={{ padding: '6px 10px', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
                  <span className="badge warn">
                    {WHY[!p.email.trim() ? 'no_email' : (p.account?.state ?? 'no_email')] ?? 'cannot be invited'}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}
