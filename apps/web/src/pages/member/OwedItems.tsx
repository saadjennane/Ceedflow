import { itemComplete, itemUnfinished, type DeliverableConfig } from '@ceed/shared';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { DeliverableItemInput } from '../../ui/DeliverableItemInput';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';

export interface Owed {
  block: { id: string; name: string };
  config: DeliverableConfig;
  open: boolean;
  returns: {
    itemId: string;
    value: unknown;
    state: 'received' | 'accepted' | 'rejected';
    reason: string;
    returnedAt: string | null;
  }[];
}

/**
 * What a startup still owes, on its own page.
 *
 * Saved item by item as each one is answered rather than behind a Submit at
 * the bottom. A due diligence is gathered over days — a document found this
 * morning, a figure asked of an accountant next week — and a form that only
 * counts when it is whole would have everybody waiting on their slowest piece.
 */
export function OwedItems({ candidateId, orgName }: { candidateId: string; orgName: string }) {
  const owed = useAsync(() => api.get<Owed[]>(`/api/me/deliverables/${candidateId}`), candidateId);
  const toast = useToast();

  if (!owed.data?.length) return null;

  const save = async (blockId: string, itemId: string, value: unknown) => {
    try {
      const next = await api.post<Owed[]>(`/api/me/deliverables/${candidateId}`, { blockId, itemId, value });
      owed.set(next);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <>
      {owed.data.map((ask) => (
        <OwedList
          key={ask.block.id}
          ask={ask}
          orgName={orgName}
          onSave={(itemId, value) => void save(ask.block.id, itemId, value)}
        />
      ))}
    </>
  );
}

/**
 * One block's list, as the startup reads it.
 *
 * Its own component so the setup screen can show exactly this — the order of
 * the items, their labels, the instruction above them — against a config that
 * has not been saved yet. A preview that redrew the page in its own words
 * would be a preview of nothing.
 */
export function OwedList({
  ask,
  orgName,
  onSave,
}: {
  ask: Owed;
  orgName: string;
  onSave: (itemId: string, value: unknown) => void;
}) {
  const need = ask.config.items.filter((i) => i.required);
  const mineOf = (id: string) => ask.returns.find((r) => r.itemId === id);
  /* What they have sent, over what is asked. That is the only number they can
     act on: a document waiting to be read is not their problem, and showing it
     as missing asked them to send something they had already sent. Whether
     CEED has read it is the colour. */
  const sent = need.filter((i) => itemComplete(i, mineOf(i.id)?.value)).length;
  const read = need.filter((i) => mineOf(i.id)?.state === 'accepted').length;
  /* Said in words rather than left to the count: three associés of whom one
     has no CIN is not "two associés", and a tally there would read as one. */
  const unfinished = ask.config.items
    .map((item) => ({ item, left: itemUnfinished(item, mineOf(item.id)?.value) }))
    .filter((x) => x.left > 0);
  const back = ask.returns.filter((r) => r.state === 'rejected');

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>{ask.block.name}</h3>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
            What CEED needs from {orgName}
          </p>
        </div>
        <span
          className={read === need.length && need.length > 0 ? 'badge ok num' : 'badge num'}
          title={
            sent < need.length
              ? `${need.length - sent} still to send`
              : read === need.length
                ? 'Everything in, and read'
                : 'Everything in — CEED is reading it'
          }
        >
          {sent}/{need.length}
        </span>
      </div>

      {/* Shut: what was sent stays readable, and nothing invites a change the
          server would refuse. */}
      {!ask.open && (
        <div className="callout">
          <Icon name="file" size={15} />
          <div>This list is closed. What you sent is below — talk to CEED if something still has to change.</div>
        </div>
      )}

      {ask.config.intro && (
        <div className="callout">
          <Icon name="file" size={15} />
          <div>{ask.config.intro}</div>
        </div>
      )}

      {/* Said once at the top as well as on each item: somebody coming back to
          this page wants to know whether anything is waiting on them before
          reading the whole list. */}
      {/* Said in words, because a count there would read as a tally of
          associés rather than as one associé missing a field. */}
      {unfinished.length > 0 && (
        <div className="callout">
          <Icon name="alert" size={15} />
          <div>
            <strong>Something is half filled in.</strong>{' '}
            {unfinished
              .map((x) => `${x.item.label} — ${x.left} ${x.left === 1 ? 'entry is' : 'entries are'} missing a field`)
              .join(' · ')}
            .
          </div>
        </div>
      )}

      {back.length > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>
              {back.length === 1 ? 'One thing has to be sent again.' : `${back.length} things have to be sent again.`}
            </strong>{' '}
            What to fix is written under each one.
          </div>
        </div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        {ask.config.items.map((item) => {
          const mine = mineOf(item.id);
          return (
            <div key={item.id}>
              <DeliverableItemInput
                item={item}
                value={mine?.value ?? null}
                readOnly={!ask.open}
                onChange={(v) => onSave(item.id, v)}
              />
              {/* Said back, because the thing people want to know after sending
                  a document is what became of it. */}
              {mine?.state === 'rejected' ? (
                <div className="callout warn" style={{ marginTop: 5 }}>
                  <Icon name="alert" size={14} />
                  <div style={{ fontSize: 12.5 }}>
                    <strong>To send again.</strong> {mine.reason}
                  </div>
                </div>
              ) : mine?.state === 'accepted' ? (
                <div style={{ fontSize: 12, marginTop: 3, color: 'var(--ok)' }}>
                  <Icon name="check" size={12} /> Accepted
                </div>
              ) : mine?.returnedAt ? (
                <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
                  Sent {formatDate(mine.returnedAt.slice(0, 10))} — waiting to be read
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {ask.open && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Each answer is kept as you give it — there is nothing to send at the end.
        </p>
      )}
    </section>
  );
}
