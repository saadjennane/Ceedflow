import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';

/**
 * One of the two ways in: people register themselves. The person is who fills
 * this in, so they always exist; the organisation only when they name one,
 * because a mentor arrives without a startup behind them. There is no password
 * here — this is a registration form, not an account, and it says so.
 */
export function JoinPage() {
  const [form, setForm] = useState({
    contactName: '',
    contactEmail: '',
    contactRole: 'Founder & CEO',
    contactCity: '',
    contactBio: '',
    name: '',
    email: '',
    website: '',
    city: '',
    bio: '',
  });
  const [known, setKnown] = useState<{ name: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ name: string; org: string | null; joined: boolean } | null>(null);

  const set = (partial: Partial<typeof form>) => setForm((f) => ({ ...f, ...partial }));

  /** Says early that CEED already knows this organisation, so nobody creates a twin. */
  const checkName = async (name: string) => {
    if (!name.trim()) return setKnown(null);
    const { found } = await api.get<{ found: { name: string } | null }>(
      `/api/public/join/check?name=${encodeURIComponent(name)}`,
    );
    setKnown(found);
  };

  const submit = async () => {
    setSending(true);
    setErrors({});
    try {
      const result = await api.post<{
        contact: { name: string };
        record: { name: string } | null;
        joined: boolean;
      }>('/api/public/join', form);
      setDone({ name: result.contact.name, org: result.record?.name ?? null, joined: result.joined });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ _: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="public">
        <div className="public-card">
          <div className="public-top" />
          <div className="public-body">
            <span className="badge ok">
              <Icon name="check" size={13} /> Registered
            </span>
            <h1>{done.name}</h1>
            <p className="public-intro">
              {done.org
                ? done.joined
                  ? `CEED already knew ${done.org} — you are now attached to it rather than to a second record.`
                  : `You and ${done.org} are in the directory, and linked.`
                : 'You are in the directory. Name an organisation any time and we will attach you to it.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" />
        <div className="public-body stack" style={{ gap: 14 }}>
          <h1>Join the CEED network</h1>
          <p className="public-intro">
            Tell us who you are, and which organisation you belong to if you have one. It is what lets CEED reach you
            about programmes, and what follows you from one edition to the next.
          </p>

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> {errors._}
            </div>
          )}

          <h3 className="section-title">You</h3>
          <div className="grid-2">
            <Text label="Your name" required value={form.contactName} error={errors.contactName} onChange={(v) => set({ contactName: v })} />
            <Text label="Your email" required type="email" value={form.contactEmail} error={errors.contactEmail} onChange={(v) => set({ contactEmail: v })} />
          </div>
          <div className="grid-2">
            <Text label="Your role" value={form.contactRole} onChange={(v) => set({ contactRole: v })} />
            <Text label="City" value={form.contactCity} onChange={(v) => set({ contactCity: v })} />
          </div>

          <h3 className="section-title">Your organisation</h3>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            Leave this empty if you are joining on your own — a mentor, an investor, someone between two ventures.
          </p>
          <Text label="Name" value={form.name} onChange={(v) => set({ name: v })} onBlur={() => checkName(form.name)} />

          {known && (
            <div className="callout">
              <Icon name="alert" size={15} />
              <div>
                <strong>We already know {known.name}.</strong> You will be attached to the record that exists rather
                than to a second one.
              </div>
            </div>
          )}

          {form.name.trim() && (
            <>
              <div className="grid-2">
                <Text label="Organisation email" value={form.email} onChange={(v) => set({ email: v })} type="email" />
                <Text label="City" value={form.city} onChange={(v) => set({ city: v })} />
              </div>
              <Text label="Website" value={form.website} onChange={(v) => set({ website: v })} />
              <div className="field">
                <label>What it does</label>
                <textarea className="textarea" rows={3} value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
              </div>
            </>
          )}

          <div className="row">
            <div className="spacer" />
            <button
              className="btn primary"
              disabled={sending || !form.contactName.trim() || !form.contactEmail.trim()}
              onClick={submit}
            >
              {sending ? 'Sending…' : 'Join'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  onBlur,
  required,
  type,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  required?: boolean;
  type?: string;
  error?: string;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {required && <span style={{ color: 'var(--stop)' }}> *</span>}
      </label>
      <input
        className={error ? 'input bad' : 'input'}
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error && (
        <div className="faint" style={{ color: 'var(--stop)', fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
