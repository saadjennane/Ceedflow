import { type DeliverableConfig } from '@ceed/shared';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FormFieldInput } from '../../ui/FormField';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';

interface Owed {
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
      {owed.data.map((ask) => {
        const need = ask.config.items.filter((i) => i.required);
        const mineOf = (id: string) => ask.returns.find((r) => r.itemId === id);
        // Accepted, not merely sent: what they want to know is whether they
        // are done, and a document waiting to be read is not done.
        const done = need.filter((i) => mineOf(i.id)?.state === 'accepted').length;
        const back = ask.returns.filter((r) => r.state === 'rejected');

        return (
          <section className="card card-pad stack" key={ask.block.id} style={{ gap: 12 }}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 15, margin: 0 }}>{ask.block.name}</h3>
                <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                  What CEED needs from {orgName}
                </p>
              </div>
              <span className={done === need.length ? 'badge ok num' : 'badge num'}>
                {done}/{need.length}
              </span>
            </div>

            {/* Shut: what was sent stays readable, and nothing invites a
                change the server would refuse. */}
            {!ask.open && (
              <div className="callout">
                <Icon name="file" size={15} />
                <div>
                  This list is closed. What you sent is below — talk to CEED if something still has to change.
                </div>
              </div>
            )}

            {ask.config.intro && (
              <div className="callout">
                <Icon name="file" size={15} />
                <div>{ask.config.intro}</div>
              </div>
            )}

            {/* Said once at the top as well as on each item: somebody coming
                back to this page wants to know whether anything is waiting on
                them before reading the whole list. */}
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
                    <FormFieldInput
                      field={item}
                      value={mine?.value ?? null}
                      readOnly={!ask.open}
                      onChange={(v) => void save(ask.block.id, item.id, v)}
                    />
                    {/* Said back, because the thing people want to know after
                        sending a document is what became of it. */}
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
      })}
    </>
  );
}
