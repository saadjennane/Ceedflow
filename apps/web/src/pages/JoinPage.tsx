import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';

/**
 * The third way in: the organisation opens its own page. It lands Claimed —
 * and if CEED had already imported it, this takes the existing page over rather
 * than creating a second one.
 */
export function JoinPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    website: '',
    city: '',
    bio: '',
    contactName: '',
    contactEmail: '',
    contactRole: 'Founder & CEO',
  });
  const [known, setKnown] = useState<{ name: string; ownership: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ name: string; claimed: boolean } | null>(null);

  const set = (partial: Partial<typeof form>) => setForm((f) => ({ ...f, ...partial }));

  /** Says early that CEED already knows this organisation, so nobody creates a twin. */
  const checkName = async (name: string) => {
    if (!name.trim()) return setKnown(null);
    const { found } = await api.get<{ found: { name: string; ownership: string } | null }>(
      `/api/public/join/check?name=${encodeURIComponent(name)}`,
    );
    setKnown(found);
  };

  const submit = async () => {
    setSending(true);
    setErrors({});
    try {
      const result = await api.post<{ record: { name: string }; claimed: boolean }>('/api/public/join', form);
      setDone({ name: result.record.name, claimed: Boolean(known) });
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
              <Icon name="check" size={13} /> Page claimed
            </span>
            <h1>{done.name}</h1>
            <p className="public-intro">
              {done.claimed
                ? 'CEED already knew you — the page that existed is now yours. Nothing was duplicated.'
                : 'Your page is open. You can apply to any programme that is taking applications.'}
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
          <h1>Open your page</h1>
          <p className="public-intro">
            One page for your organisation, kept by you. It is what lets you apply to programmes, and it stays yours
            from one edition to the next.
          </p>

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> {errors._}
            </div>
          )}

          <h3 className="section-title">Your organisation</h3>
          <Text label="Name" required value={form.name} error={errors.name} onChange={(v) => set({ name: v })} onBlur={() => checkName(form.name)} />

          {known && (
            <div className={known.ownership === 'Claimed' ? 'callout warn' : 'callout'}>
              <Icon name="alert" size={15} />
              <div>
                {known.ownership === 'Claimed' ? (
                  <>
                    <strong>{known.name} already has an account.</strong> Ask whoever holds it to invite you rather than
                    opening a second page.
                  </>
                ) : (
                  <>
                    <strong>We already know {known.name}.</strong> Going on hands you that page — your history comes with
                    it, and nothing is duplicated.
                  </>
                )}
              </div>
            </div>
          )}

          <div className="grid-2">
            <Text label="Organisation email" required value={form.email} error={errors.email} onChange={(v) => set({ email: v })} type="email" />
            <Text label="City" value={form.city} onChange={(v) => set({ city: v })} />
          </div>
          <Text label="Website" value={form.website} onChange={(v) => set({ website: v })} />
          <div className="field">
            <label>What you do</label>
            <textarea className="textarea" rows={3} value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
          </div>

          <h3 className="section-title">You</h3>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            An organisation is held by at least one person — this is who we write to.
          </p>
          <div className="grid-2">
            <Text label="Your name" required value={form.contactName} error={errors.contactName} onChange={(v) => set({ contactName: v })} />
            <Text label="Your email" required type="email" value={form.contactEmail} error={errors.contactEmail} onChange={(v) => set({ contactEmail: v })} />
          </div>
          <Text label="Your role" value={form.contactRole} onChange={(v) => set({ contactRole: v })} />

          <div className="row">
            <div className="spacer" />
            <button
              className="btn primary"
              disabled={sending || known?.ownership === 'Claimed'}
              onClick={submit}
            >
              {sending ? 'Opening…' : 'Open my page'}
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
