/**
 * Absent jusqu'à une date : l'équipe le voit sur l'accueil, et c'est tout.
 * La date passée, on redevient présent sans rien faire.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useToast } from '../ui/Overlays';

export function AwaySetting() {
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ until: string | null; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    void api.get<{ until: string | null; note: string }>('/api/me/away').then((a) => {
      setSaved(a);
      if (a.until && a.until >= today) {
        setUntil(a.until);
        setNote(a.note);
      }
    });
  }, [today]);

  const save = async (next: { until: string | null; note: string }) => {
    setBusy(true);
    try {
      const r = await api.put<{ until: string | null; note: string }>('/api/me/away', next);
      setSaved(r);
      if (!r.until) {
        setUntil('');
        setNote('');
      }
      toast(r.until ? `Away until ${formatDate(r.until)}.` : 'You are back.');
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const away = Boolean(saved?.until && saved.until >= today);
  return (
    <section className="card card-pad stack" style={{ maxWidth: 880, gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 16, margin: 0 }}>Away</h2>
        <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
          {away ? `The team sees you away until ${formatDate(saved!.until!)}.` : 'The team sees on the home page who is away, and until when.'}
        </p>
      </div>
      <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Until</label>
          <input className="input" type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label>A word for the team</label>
          <input className="input" maxLength={120} placeholder="Back on Monday" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn primary" disabled={busy || !until} onClick={() => void save({ until, note })}>
          {away ? 'Update' : 'Set away'}
        </button>
        {away && (
          <button className="btn ghost" disabled={busy} onClick={() => void save({ until: null, note: '' })}>
            I’m back
          </button>
        )}
      </div>
    </section>
  );
}
