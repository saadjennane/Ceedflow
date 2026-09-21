import { type Me } from '@ceed/shared';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import '../../ui/builder.css';

/**
 * Signing in and opening an account, on one page with two modes. An account is
 * a way into one directory record — the profile a member fills in is that
 * record, not a second copy of the same person.
 */
export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /**
   * Where the person was heading before they were asked to sign in. Absent when
   * they came here on their own — the destination then follows from who they
   * turn out to be.
   */
  const next = params.get('next') || null;
  /** Carried across the sign-in ↔ sign-up link so the destination survives it. */
  const carry = next ? `?next=${encodeURIComponent(next)}` : '';

  const set = (partial: Partial<typeof form>) => setForm((f) => ({ ...f, ...partial }));

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      const me = await api.post<Me>(signup ? '/api/auth/signup' : '/api/auth/login', form);
      // Two doors, one form. A provisional password opens neither until it has
      // been replaced, so it goes to the one screen that can do that.
      const home = me.account.mustChangePassword ? '/me' : me.account.staffRole ? '/' : '/me';
      navigate(next ?? home, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ _: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const ready = signup
    ? form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.password.length >= 8
    : form.email.trim() && form.password;

  return (
    <div className="public">
      <div className="public-card" style={{ maxWidth: 460 }}>
        <div className="public-top" />
        <div className="public-body stack" style={{ gap: 14 }}>
          <h1>{signup ? 'Create your account' : 'Sign in'}</h1>
          <p className="public-intro">
            {next?.startsWith('/apply')
              ? 'One step before the form: an account is what lets you pick it up again and follow where your application stands.'
              : signup
                ? 'One account for you, and the organisation pages you look after.'
                : 'Welcome back.'}
          </p>

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> {errors._}
            </div>
          )}

          {signup && (
            <div className="grid-2">
              <Field label="First name" value={form.firstName} error={errors.firstName} onChange={(v) => set({ firstName: v })} />
              <Field label="Last name" value={form.lastName} error={errors.lastName} onChange={(v) => set({ lastName: v })} />
            </div>
          )}

          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            error={errors.email}
            onChange={(v) => set({ email: v })}
          />
          <Field
            label="Password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={form.password}
            error={errors.password}
            hint={signup ? 'At least 8 characters.' : undefined}
            onChange={(v) => set({ password: v })}
            onEnter={() => ready && submit()}
          />

          <button className="btn primary" disabled={busy || !ready} onClick={submit}>
            {busy ? 'One moment…' : signup ? 'Create my account' : 'Sign in'}
          </button>

          <p className="faint" style={{ margin: 0, fontSize: 12.5, textAlign: 'center' }}>
            {signup ? (
              <>
                Already have an account?{' '}
                <Link to={`/login${carry}`}>Sign in</Link>
              </>
            ) : (
              <>
                No account yet?{' '}
                <Link to={`/signup${carry}`}>Create one</Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onEnter,
  type,
  autoComplete,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  type?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className={error ? 'input bad' : 'input'}
        type={type ?? 'text'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      {error ? (
        <div style={{ color: 'var(--stop)', fontSize: 12 }}>{error}</div>
      ) : hint ? (
        <div className="hint">{hint}</div>
      ) : null}
    </div>
  );
}
