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
  returns: { itemId: string; value: unknown; returnedAt: string | null }[];
}

const given = (value: unknown) =>
  !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));

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
        const done = need.filter((i) => given(ask.returns.find((r) => r.itemId === i.id)?.value)).length;

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

            {ask.config.intro && (
              <div className="callout">
                <Icon name="file" size={15} />
                <div>{ask.config.intro}</div>
              </div>
            )}

            <div className="stack" style={{ gap: 14 }}>
              {ask.config.items.map((item) => {
                const mine = ask.returns.find((r) => r.itemId === item.id);
                return (
                  <div key={item.id}>
                    <FormFieldInput
                      field={item}
                      value={mine?.value ?? null}
                      onChange={(v) => void save(ask.block.id, item.id, v)}
                    />
                    {/* Said back, because the thing people want to know after
                        sending a document is whether it arrived. */}
                    {mine?.returnedAt && (
                      <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
                        <Icon name="check" size={12} /> Received {formatDate(mine.returnedAt.slice(0, 10))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              Each answer is kept as you give it — there is nothing to send at the end.
            </p>
          </section>
        );
      })}
    </>
  );
}
