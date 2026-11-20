/**
 * Les programmes que le réseau propose à ce centre.
 *
 * Rien n'entre dans le catalogue du centre sans son accord : ce qui attend une
 * réponse d'abord, puis ce qui est publié — qu'on peut retirer —, puis ce qui
 * a été refusé ou retiré, qu'on peut toujours publier. Le programme reste
 * celui du centre qui l'organise : ici, on décide seulement de le montrer.
 */
import { isWorkspaceAdmin } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { formatDate, formatRange } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import { OFFER_WORD } from '../ProgramNetwork';
import '../../ui/builder.css';
import '../../ui/directory.css';

interface Offer {
  programId: string;
  name: string;
  summary: string;
  type: string;
  partner: string;
  colour: string;
  fromCenter: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  proposedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  editions: { id: string; name: string; status: string; startsOn: string | null; endsOn: string | null; city: string }[];
}

const GROUPS = [
  { key: 'pending', title: 'Waiting for your answer', empty: 'Nothing waiting.' },
  { key: 'accepted', title: 'Published in your catalogue', empty: 'Nothing published from the network yet.' },
  { key: 'other', title: 'Declined or taken down', empty: '' },
] as const;

export function OffersPage() {
  const offers = useAsync(() => api.get<Offer[]>('/api/network/offers'), 'offers');
  const { me } = useAccount();
  const mayDecide = isWorkspaceAdmin(me?.account.staffRole ?? 'observer');
  const [looking, setLooking] = useState<Offer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const decide = async (o: Offer, decision: 'accepted' | 'rejected' | 'withdrawn') => {
    setBusy(o.programId);
    try {
      await api.post(`/api/network/offers/${o.programId}/decision`, { decision });
      toast(
        decision === 'accepted'
          ? `${o.name} is in your catalogue.`
          : decision === 'rejected'
            ? `${o.name} declined — it stays out of your catalogue.`
            : `${o.name} taken down. Its candidacies are untouched.`,
      );
      setLooking(null);
      offers.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const list = offers.data ?? [];
  const groupOf = (o: Offer) => (o.status === 'pending' ? 'pending' : o.status === 'accepted' ? 'accepted' : 'other');

  return (
    <>
      <header className="topbar">
        <h1>From the network</h1>
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 12.5 }}>
          Programmes other CEED centres propose. Nothing shows in your catalogue until you accept it.
        </span>
      </header>
      <div className="page stack" style={{ gap: 18 }}>
        {offers.error ? (
          <div className="empty">{offers.error}</div>
        ) : !offers.data ? (
          <div className="dir-loading" aria-busy="true"><span /><span /><span /></div>
        ) : !list.length ? (
          <div className="empty">
            <h3>No programme proposed yet</h3>
            <p>When another centre proposes one of its programmes to yours, it waits here for your answer.</p>
          </div>
        ) : (
          GROUPS.map((g) => {
            const here = list.filter((o) => groupOf(o) === g.key);
            if (!here.length && !g.empty) return null;
            return (
              <section key={g.key} className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                  <h3 className="section-title" style={{ margin: 0 }}>{g.title}</h3>
                  <span className="faint num" style={{ fontSize: 12.5 }}>{here.length}</span>
                </div>
                {here.length ? (
                  <div className="net-programs">
                    {here.map((o) => (
                      <div key={o.programId} className="net-program">
                        <span className="net-program-bar" style={{ background: o.colour }} />
                        <button className="net-program-main linkish" style={{ textAlign: 'left' }} onClick={() => setLooking(o)}>
                          <b>{o.name}</b>
                          <span className="faint">
                            By {o.fromCenter} · proposed {formatDate(o.proposedAt.slice(0, 10))}
                            {o.editions[0] ? ` · ${o.editions[0].name}` : ''}
                          </span>
                        </button>
                        <span className={OFFER_WORD[o.status].tone}>{OFFER_WORD[o.status].label}</span>
                        <Actions offer={o} mayDecide={mayDecide} busy={busy === o.programId} onDecide={decide} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="faint" style={{ margin: 0, fontSize: 13 }}>{g.empty}</p>
                )}
              </section>
            );
          })
        )}
      </div>

      {looking && (
        <Modal
          wide
          title={looking.name}
          subtitle={`Organised by ${looking.fromCenter} — read only. It stays theirs: they run it and its candidacies.`}
          onClose={() => setLooking(null)}
          footer={
            <>
              <span className={OFFER_WORD[looking.status].tone}>{OFFER_WORD[looking.status].label}</span>
              <div className="spacer" />
              <Actions offer={looking} mayDecide={mayDecide} busy={busy === looking.programId} onDecide={decide} />
            </>
          }
        >
          <div className="stack" style={{ gap: 14 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {looking.type && <span className="badge">{looking.type}</span>}
              {looking.partner && <span className="badge">with {looking.partner}</span>}
            </div>
            <p style={{ margin: 0 }} className={looking.summary ? '' : 'faint'}>
              {looking.summary || 'No description.'}
            </p>
            <div>
              <h4 style={{ margin: '0 0 6px', fontSize: 13.5 }}>Editions</h4>
              {looking.editions.length ? (
                <div className="rows">
                  {looking.editions.map((e) => (
                    <div key={e.id} className="rowcard row" style={{ padding: '8px 12px', gap: 10 }}>
                      <b style={{ flex: 1, fontSize: 13.5 }}>{e.name}</b>
                      <span className="faint" style={{ fontSize: 12.5 }}>
                        {formatRange(e.startsOn, e.endsOn)}
                        {e.city ? ` · ${e.city}` : ''}
                      </span>
                      <span className={e.status === 'Live' ? 'badge ok' : 'badge'}>{e.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="faint" style={{ margin: 0 }}>No published edition yet.</p>
              )}
            </div>
            {looking.decidedAt && (
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                Last answered {formatDate(looking.decidedAt.slice(0, 10))}
                {looking.decidedBy ? ` by ${looking.decidedBy}` : ''}.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function Actions({
  offer,
  mayDecide,
  busy,
  onDecide,
}: {
  offer: Offer;
  mayDecide: boolean;
  busy: boolean;
  onDecide: (o: Offer, d: 'accepted' | 'rejected' | 'withdrawn') => void;
}) {
  if (!mayDecide) return null;
  if (offer.status === 'pending') {
    return (
      <span className="row" style={{ gap: 6 }}>
        <button className="btn ghost sm" disabled={busy} onClick={() => onDecide(offer, 'rejected')}>Decline</button>
        <button className="btn primary sm" disabled={busy} onClick={() => onDecide(offer, 'accepted')}>
          <Icon name="check" size={13} /> Publish
        </button>
      </span>
    );
  }
  if (offer.status === 'accepted') {
    return (
      <button className="btn ghost sm" disabled={busy} onClick={() => onDecide(offer, 'withdrawn')} title="Out of your catalogue — the programme and its candidacies are untouched">
        Take down
      </button>
    );
  }
  return (
    <button className="btn sm" disabled={busy} onClick={() => onDecide(offer, 'accepted')}>
      Publish
    </button>
  );
}
