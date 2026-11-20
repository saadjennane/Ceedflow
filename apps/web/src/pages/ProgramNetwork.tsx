/**
 * Où un programme est proposé dans le réseau CEED.
 *
 * Proposer n'est pas publier : chaque centre choisi reçoit une demande, et ne
 * l'affiche dans son catalogue qu'après l'avoir acceptée. Cette carte dit à
 * qui on propose, et ce que chacun a répondu.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Overlays';

type Visibility = 'center' | 'selected' | 'all';
type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

interface Distribution {
  visibility: Visibility;
  targets: { centerId: string; name: string; status: OfferStatus; decidedAt: string | null }[];
}

interface NetworkCenter {
  id: string;
  name: string;
  country: string;
  mine: boolean;
}

const OPTIONS: { key: Visibility; label: string; hint: string }[] = [
  { key: 'center', label: 'My centre only', hint: 'Shown in this centre’s catalogue, nowhere else.' },
  { key: 'selected', label: 'Selected centres', hint: 'Proposed to the centres you pick. Each one decides.' },
  { key: 'all', label: 'Every centre', hint: 'Proposed to the whole network. Each centre still decides.' },
];

export const OFFER_WORD: Record<OfferStatus, { label: string; tone: string }> = {
  pending: { label: 'Waiting', tone: 'badge warn' },
  accepted: { label: 'Published', tone: 'badge ok' },
  rejected: { label: 'Declined', tone: 'badge stop' },
  withdrawn: { label: 'Taken down', tone: 'badge' },
};

export function ProgramNetwork({ programId, mayEdit }: { programId: string; mayEdit: boolean }) {
  const distribution = useAsync(() => api.get<Distribution>(`/api/programs/${programId}/distribution`), `dist:${programId}`);
  const centers = useAsync(() => api.get<NetworkCenter[]>('/api/network/centers'), 'network-centers');
  const [visibility, setVisibility] = useState<Visibility>('center');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!distribution.data) return;
    setVisibility(distribution.data.visibility);
    setPicked(distribution.data.targets.map((t) => t.centerId));
  }, [distribution.data]);

  const others = (centers.data ?? []).filter((c) => !c.mine);
  if (!distribution.data || !centers.data) return null;
  /* Un réseau d'un seul centre : rien à proposer à personne, la carte se tait. */
  if (!others.length && distribution.data.visibility === 'center') return null;

  const saved = distribution.data;
  const changed =
    visibility !== saved.visibility ||
    (visibility === 'selected' && [...picked].sort().join() !== saved.targets.map((t) => t.centerId).sort().join());

  const save = async () => {
    setBusy(true);
    try {
      distribution.set(await api.put<Distribution>(`/api/programs/${programId}/distribution`, { visibility, centerIds: picked }));
      toast(visibility === 'center' ? 'Shown in this centre only.' : 'Proposed — each centre decides whether to publish it.');
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 15, margin: 0 }}>Visibility in the CEED network</h2>
        <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
          Proposing is not publishing: a centre shows this programme only once it has accepted it, and may take it down.
        </p>
      </div>
      <div className="net-vis">
        {OPTIONS.map((o) => (
          <label key={o.key} className={visibility === o.key ? 'net-vis-option on' : 'net-vis-option'}>
            <input type="radio" name={`vis-${programId}`} checked={visibility === o.key} disabled={!mayEdit} onChange={() => setVisibility(o.key)} />
            <span>
              <b>{o.label}</b>
              <small>{o.hint}</small>
            </span>
          </label>
        ))}
      </div>

      {visibility === 'selected' && (
        <div className="row wrap" style={{ gap: 6 }}>
          {others.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button
                key={c.id}
                className={on ? 'track on' : 'track'}
                disabled={!mayEdit}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
              >
                {on && <Icon name="check" size={12} />} {c.name}
              </button>
            );
          })}
        </div>
      )}

      {mayEdit && changed && (
        <div className="row">
          <div className="spacer" />
          <button className="btn primary sm" disabled={busy || (visibility === 'selected' && !picked.length)} onClick={() => void save()}>
            {busy ? 'Saving…' : visibility === 'center' ? 'Keep it in my centre' : 'Propose'}
          </button>
        </div>
      )}

      {saved.targets.length > 0 && (
        <div className="rows">
          {saved.targets.map((t) => (
            <div key={t.centerId} className="rowcard row" style={{ padding: '8px 12px', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t.name}</span>
              <span className={OFFER_WORD[t.status].tone}>{OFFER_WORD[t.status].label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
