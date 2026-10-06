import { itemComplete, itemUnfinished, longDate, type DeliverableConfig } from '@ceed/shared';
import { useState } from 'react';
import { useLang } from '../../lib/lang';
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
export function OwedItems({
  candidateId,
  orgName,
  given,
  readOnly = false,
  startOpen = false,
}: {
  candidateId: string;
  orgName: string;
  /** Already fetched — how CEED looks at somebody else's page without being them. */
  given?: Owed[];
  readOnly?: boolean;
  /* Déplié d'emblée là où la liste est la page : sur l'onglet « À faire » d'un
     programme, le pli serait un clic pour arriver là où l'on est déjà. */
  startOpen?: boolean;
}) {
  const owed = useAsync(
    async () => given ?? api.get<Owed[]>(`/api/me/deliverables/${candidateId}`),
    `${candidateId}:${given ? 'given' : 'mine'}`,
  );
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
          readOnly={readOnly}
          startOpen={startOpen}
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
  startOpen = false,
  readOnly = false,
}: {
  ask: Owed;
  orgName: string;
  onSave: (itemId: string, value: unknown) => void;
  /** Open from the start, for the preview that exists to show the form. */
  startOpen?: boolean;
  /** Looked at rather than filled in: CEED reading somebody else's page. */
  readOnly?: boolean;
}) {
  const [showing, setShowing] = useState(startOpen);
  const { t } = useLang();
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

  /* Ce qu'on leur demande de faire, en une phrase.
     A founder opens this page to answer one question — have I something to do
     — and the answer has to be the first line, in their own language. The form
     is one click under it rather than unrolled: three programmes with three
     lists would otherwise be a page nobody reads to the end. */
  const left = need.length - sent;
  const closing = ask.config.closesAt ? longDate(ask.config.closesAt) : '';

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <button
        className="row"
        style={{ gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0 }}
        aria-expanded={showing}
        onClick={() => setShowing((x) => !x)}
      >
        <Icon name={showing ? 'chevronDown' : 'chevronRight'} size={15} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>
            {back.length > 0
              ? t('owed.back')
              : left > 0
                ? t('owed.fill')
                : read === need.length
                  ? t('owed.done')
                  : t('owed.reading')}
          </h3>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
            {[ask.block.name, left > 0 && closing ? `${t('owed.before')} ${closing}` : null]
              .filter(Boolean)
              .join(' · ')}
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
      </button>

      {showing && (
        <>

      {/* Shut: what was sent stays readable, and nothing invites a change the
          server would refuse. */}
      {!ask.open && (
        <div className="callout">
          <Icon name="file" size={15} />
          <div>{t('owed.closed')}</div>
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
              {t('owed.oneBack')}
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
                readOnly={readOnly || !ask.open}
                onChange={(v) => onSave(item.id, v)}
              />
              {/* Said back, because the thing people want to know after sending
                  a document is what became of it. */}
              {mine?.state === 'rejected' ? (
                <div className="callout warn" style={{ marginTop: 5 }}>
                  <Icon name="alert" size={14} />
                  <div style={{ fontSize: 12.5 }}>
                    <strong>{t('owed.again')}</strong> {mine.reason}
                  </div>
                </div>
              ) : mine?.state === 'accepted' ? (
                <div style={{ fontSize: 12, marginTop: 3, color: 'var(--ok)' }}>
                  <Icon name="check" size={12} /> {t('owed.accepted')}
                </div>
              ) : mine?.returnedAt ? (
                <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
                  {t('owed.waiting')} {formatDate(mine.returnedAt.slice(0, 10))} {t('owed.unread')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {ask.open && !readOnly && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          {t('owed.kept')}
        </p>
      )}
        </>
      )}
    </section>
  );
}
