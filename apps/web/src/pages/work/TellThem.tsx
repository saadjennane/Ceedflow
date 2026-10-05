/**
 * Dire à chaque audience ce qui a été décidé d'elle.
 *
 * One send per audience, and never all three at once. A waiting list exists
 * precisely because the decision is not closed, and telling a startup it is
 * refused when the committee may fish it out next week is worse than the leak
 * that sending everybody together would avoid.
 *
 * What is not forbidden is made visible instead: once one audience has been
 * told and another has not, the gap is counted in days on the screen. Nobody
 * would think to look for it otherwise, and the people it happens to are the
 * ones left waiting without a word.
 */
import { type Block } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
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

export function TellThem({
  block,
  at,
  bodyOf,
  variablesOf,
  onSent,
}: {
  block: Block;
  /** Which brick's audiences these are: it names the two endpoints. */
  at: string;
  /** The template for one audience, from this block's own config. */
  bodyOf: (kind: string) => string;
  variablesOf: (kind: string) => readonly { name: string; label: string; what: string }[];
  onSent?: () => void;
}) {
  const view = useAsync(() => api.get<Payload>(`/api/blocks/${block.id}/${at}/audiences`), `${block.id}:${at}`);
  const [telling, setTelling] = useState<Audience | null>(null);

  if (!view.data?.audiences.length) return null;
  const { audiences } = view.data;
  const contradicted = view.data.contradicted ?? [];

  /* The oldest letter already out. An audience still silent is measured
     against it — "29 have heard nothing for 12 days" only means anything
     beside an audience that has. */
  const earliest = audiences
    .map((a) => a.lastToldAt ?? null)
    .filter((x): x is string => Boolean(x))
    .sort()[0];

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row">
        <div className="eyebrow" style={{ flex: 1 }}>
          Telling them
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          One audience at a time
        </span>
      </div>

      <div className="rows">
        {audiences.map((a) => {
          const left = a.count - a.told;
          const waiting = !a.told && earliest ? daysSince(earliest) : 0;
          return (
            <div className="rowcard row" key={a.kind} style={{ padding: '9px 12px', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.label}</span>
              <span className="badge num">{a.count}</span>
              <span className="faint" style={{ fontSize: 12.5, minWidth: 190, textAlign: 'right' }}>
                {a.told === a.count && a.count > 0 ? (
                  `all told${a.lastToldAt ? ` on ${formatDate(a.lastToldAt.slice(0, 10))}` : ''}`
                ) : a.told > 0 ? (
                  `${a.told} told, ${left} not`
                ) : (
                  <span className={waiting >= 2 ? 'warnline' : undefined}>
                    none told{waiting >= 2 ? ` · ${waiting} days` : ''}
                  </span>
                )}
              </span>
              {/* Nothing to press once everybody reachable has heard it. */}
              {a.reachable > 0 && (
                <button className="btn sm" onClick={() => setTelling(a)}>
                  <Icon name="send" size={13} /> Tell {a.reachable}
                </button>
              )}
            </div>
          );
        })}
      </div>

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

      {telling && (
        <NotifyDialog
          block={block}
          kind={telling.kind}
          /* A selection has no door of its own; announcing is what opens this,
             and the caller only shows this block once it is announced. */
          status="live"
          rosterPath={`/api/blocks/${block.id}/${at}/roster`}
          notifyPath={`/api/blocks/${block.id}/${at}/notify`}
          title={`Tell ${telling.label.toLowerCase()}`}
          body={bodyOf(telling.kind)}
          variables={variablesOf(telling.kind)}
          onDone={() => {
            view.reload();
            onSent?.();
          }}
          onClose={() => setTelling(null)}
        />
      )}
    </div>
  );
}
