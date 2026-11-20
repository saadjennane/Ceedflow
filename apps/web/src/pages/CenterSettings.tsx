/**
 * Le centre où l'on travaille : sa présentation, et la signature de ses lettres.
 *
 * Ses administrateurs le règlent ici ; son nom, son pays et son statut sont
 * l'affaire de CEED Global.
 */
import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useToast } from '../ui/Overlays';

interface Center {
  id: string;
  name: string;
  country: string;
  city: string;
  description: string;
  mailName: string;
  replyTo: string;
}

export function CenterSettings({ mayManage }: { mayManage: boolean }) {
  const center = useAsync(() => api.get<Center>('/api/center'), 'center-own');
  const [description, setDescription] = useState('');
  const [mailName, setMailName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!center.data) return;
    setDescription(center.data.description);
    setMailName(center.data.mailName);
    setReplyTo(center.data.replyTo);
  }, [center.data]);

  if (center.error) return <div className="empty">{center.error}</div>;
  if (!center.data) return <div className="empty" style={{ padding: 30 }} />;
  const c = center.data;
  const changed = description !== c.description || mailName !== c.mailName || replyTo !== c.replyTo;

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      center.set(await api.patch<Center>('/api/center', { description, mailName, replyTo }));
      toast('Saved.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" style={{ padding: 18, gap: 14, maxWidth: 720 }}>
      <div>
        <h3 style={{ fontSize: 17 }}>{c.name}</h3>
        <p className="faint" style={{ margin: '2px 0 0', fontSize: 13 }}>
          {[c.city, c.country].filter(Boolean).join(', ') || 'No place yet'} · its name and country are set by CEED Global.
        </p>
      </div>
      <div className="field">
        <label>Description</label>
        <textarea className="textarea" rows={3} value={description} disabled={!mayManage} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Letters signed by</label>
          <input className="input" value={mailName} disabled={!mayManage} placeholder={c.name} onChange={(e) => setMailName(e.target.value)} />
          <div className="help">The name before the platform’s address. Empty: the platform’s own.</div>
        </div>
        <div className="field">
          <label>Replies go to</label>
          <input className="input" type="email" value={replyTo} disabled={!mayManage} placeholder="contact@…" onChange={(e) => setReplyTo(e.target.value)} />
          {errors.replyTo ? <div className="err">{errors.replyTo}</div> : <div className="help">Where a startup’s answer lands. Empty: the platform’s.</div>}
        </div>
      </div>
      {mayManage && (
        <div className="row">
          <div className="spacer" />
          <button className="btn primary" disabled={!changed || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </section>
  );
}
