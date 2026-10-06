/**
 * Dire à chaque audience ce qui a été décidé d'elle.
 *
 * One send per audience, and never all three at once. A waiting list exists
 * precisely because the decision is not closed, and telling a startup it is
 * refused when the committee may fish it out next week is worse than the leak
 * that sending everybody together would avoid.
 *
 * Three audiences and their counts used to sit on the page as a card, two
 * hundred and fifty pixels above the table where the work actually happens,
 * saying "none told" for days on end. They are now behind one button, next to
 * the others — and what cannot wait behind a button stays on the page: a
 * refusal nobody has sent in twelve days, and a startup told something that is
 * no longer true. Nothing at rest, a line when there is something to say.
 */
import { type Block } from '@ceed/shared';
import { type ReactNode, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Overlays';
import { NotifyDialog } from './NotifyDialog';

interface Audience {
  kind: string;
  label: string;
  count: number;
  reachable: number;
  told: number;
  lastToldAt?: string | null;
}

interface Payload {
  audiences: Audience[];
  /** Named startups whose decision moved after they were written to. */
  contradicted?: { candidateId: string; orgName: string; told: string; now: string }[];
}

/** Whole days since a letter went out, for saying how long the others waited. */
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** How far behind an audience has to fall before it is worth a line. */
const LATE_DAYS = 2;

/**
 * L'acte d'écrire, en trois morceaux posés à trois endroits.
 *
 * One piece of state, and a page that needs it in three places: the button
 * belongs in the header beside Export, the warnings belong with the other
 * warnings, and the windows belong at the end. Returning nodes rather than
 * rendering one block is what lets the caller put each where it reads best,
 * without the three of them passing the same list around.
 */
export function useAnnouncing({
  block,
  at,
  label,
  bodyOf,
  variablesOf,
  onSent,
}: {
  block: Block;
  /** Which brick's audiences these are: it names the two endpoints. */
  at: string;
  /** What this brick calls the act — announcing, informing, calling for. */
  label: string;
  /** The template for one audience, from this block's own config. */
  bodyOf: (kind: string) => string;
  variablesOf: (kind: string) => readonly { name: string; label: string; what: string }[];
  onSent?: () => void;
}): { button: ReactNode; warning: ReactNode; windows: ReactNode } {
  const view = useAsync(() => api.get<Payload>(`/api/blocks/${block.id}/${at}/audiences`), `${block.id}:${at}`);
  const [picking, setPicking] = useState(false);
  const [telling, setTelling] = useState<Audience | null>(null);

  const audiences = view.data?.audiences ?? [];
  const contradicted = view.data?.contradicted ?? [];
  const nothing = { button: null, warning: null, windows: null };
  if (!audiences.length) return nothing;

  const waiting = audiences.reduce((n, a) => n + a.reachable, 0);
  const open = audiences.filter((a) => a.reachable > 0);

  /* The oldest letter already out. An audience still silent is measured
     against it — "24 have heard nothing for 12 days" only means anything
     beside an audience that has. */
  const earliest = audiences
    .map((a) => a.lastToldAt ?? null)
    .filter((x): x is string => Boolean(x))
    .sort()[0];
  const late = earliest
    ? audiences.filter((a) => !a.told && a.reachable > 0 && daysSince(earliest) >= LATE_DAYS)
    : [];
  const days = earliest ? daysSince(earliest) : 0;

  /* One audience left to write to is not a choice to make: the picker would be
     a list of one, and a click to get past it. */
  const start = () => (open.length === 1 ? setTelling(open[0]!) : setPicking(true));

  const button = (
    <button className="btn" onClick={start}>
      <Icon name="send" size={13} /> {label}
      {waiting > 0 ? ` (${waiting})` : ''}
    </button>
  );

  const warning = (
    <>
      {/* Nobody would think to look for this, and the people it happens to are
          the ones left waiting without a word. */}
      {late.length > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>
              {late.map((a) => `${a.reachable} ${a.label.toLowerCase()}`).join(' and ')} have heard nothing for {days}{' '}
              days.
            </strong>{' '}
            The others were written to on {formatDate(earliest!.slice(0, 10))}.
          </div>
        </div>
      )}

      {/* Told one thing, and the decision has moved since. The person it
          happened to will phone about it, and nobody would think to look. */}
      {contradicted.length > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>
              {contradicted.length === 1
                ? 'One startup was told something that is no longer true.'
                : `${contradicted.length} startups were told something that is no longer true.`}
            </strong>{' '}
            {contradicted
              .slice(0, 4)
              .map((c) => `${c.orgName} — told ${c.told.toLowerCase()}, now ${c.now.toLowerCase()}`)
              .join(' · ')}
            {contradicted.length > 4 ? ' …' : ''}. Writing to them again is how they find out.
          </div>
        </div>
      )}
    </>
  );

  const windows = (
    <>
      {picking && (
        <Modal
          title={label}
          subtitle="One audience at a time — what is said to one is not said to the others."
          wide
          onClose={() => setPicking(false)}
        >
          <div className="rows">
            {audiences.map((a) => {
              const left = a.count - a.told;
              const silent = !a.told && earliest && days >= LATE_DAYS;
              const row = (
                <>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.label}</span>
                  <span className="badge num">{a.count}</span>
                  <span className="faint" style={{ fontSize: 12.5, minWidth: 190, textAlign: 'right' }}>
                    {a.told === a.count && a.count > 0 ? (
                      `all told${a.lastToldAt ? ` on ${formatDate(a.lastToldAt.slice(0, 10))}` : ''}`
                    ) : a.told > 0 ? (
                      `${a.told} told, ${left} not`
                    ) : (
                      <span className={silent ? 'warnline' : undefined}>
                        none told{silent ? ` · ${days} days` : ''}
                      </span>
                    )}
                  </span>
                </>
              );
              /* A row nobody can be written to is still worth reading — it is
                 the record of what was said — but it is not a button. */
              return a.reachable > 0 ? (
                <button
                  className="rowcard row"
                  key={a.kind}
                  style={{ padding: '10px 12px', gap: 10, width: '100%', textAlign: 'left' }}
                  onClick={() => {
                    setPicking(false);
                    setTelling(a);
                  }}
                >
                  {row}
                  <span className="btn sm">
                    <Icon name="send" size={13} /> {a.reachable}
                  </span>
                </button>
              ) : (
                <div className="rowcard row" key={a.kind} style={{ padding: '10px 12px', gap: 10 }}>
                  {row}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {telling && (
        <NotifyDialog
          block={block}
          kind={telling.kind}
          /* A selection has no door of its own; writing to an audience is what
             settles it, and the caller shows this block either way. */
          status="live"
          rosterPath={`/api/blocks/${block.id}/${at}/roster`}
          notifyPath={`/api/blocks/${block.id}/${at}/notify`}
          title={telling.label}
          body={bodyOf(telling.kind)}
          variables={variablesOf(telling.kind)}
          /* Only where there was a step before it: a single audience went
             straight here, and a back arrow would lead to a list of one. */
          onBack={
            open.length > 1
              ? () => {
                  setTelling(null);
                  setPicking(true);
                }
              : undefined
          }
          onDone={() => {
            view.reload();
            onSent?.();
          }}
          onClose={() => setTelling(null)}
        />
      )}
    </>
  );

  return { button, warning, windows };
}
