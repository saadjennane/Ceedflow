import { MAX_UPLOAD_BYTES, type Eligibility, type FormField } from '@ceed/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAccount } from '../lib/account';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';
import '../ui/directory.css';

interface PublicPage {
  id: string;
  name: string;
  intro: string;
  fields: FormField[];
}

interface PublicForm {
  programName: string;
  editionName: string;
  colour: string;
  blockName: string;
  intro: string;
  eligibility: Eligibility;
  channels: string[];
  layout: 'single' | 'paged';
  pages: PublicPage[];
  opensAt: string | null;
  closesAt: string | null;
  state: 'open' | 'closed' | 'not_open';
}

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

export function ApplyPage() {
  const { token = '' } = useParams();
  const form = useAsync(() => api.get<PublicForm>(`/api/public/forms/${token}`), token);
  const { me, loading: checkingAccount } = useAccount();

  const [orgId, setOrgId] = useState<string>('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (form.loading || checkingAccount) {
    return (
      <div className="public">
        <div className="public-card">
          <div className="public-body">Loading…</div>
        </div>
      </div>
    );
  }

  if (form.error || !form.data) {
    return (
      <Shell>
        <h1>This form is not available</h1>
        <p className="public-intro">{form.error ?? 'The link may be wrong, or the call may have closed.'}</p>
      </Shell>
    );
  }

  const data = form.data;

  /* Applying is done signed in, so the form knows who is filling it. */
  if (!me) {
    return (
      <Shell colour={data.colour}>
        <h1>{data.programName}</h1>
        <p className="public-intro">{data.intro}</p>
        <div className="callout">
          <Icon name="alert" size={15} />
          <div>
            <strong>You apply with an account.</strong> It is what lets you pick up an unfinished form, see where your
            application stands, and apply again next year without retyping anything.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn primary" to={`/signup?next=${encodeURIComponent(`/apply/${token}`)}`}>
            Create an account
          </Link>
          <Link className="btn" to={`/login?next=${encodeURIComponent(`/apply/${token}`)}`}>
            I already have one
          </Link>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell colour={data.colour}>
        <span className="badge ok">
          <Icon name="check" size={13} /> Application received
        </span>
        <h1>{data.programName}</h1>
        <p className="public-intro">{done}</p>
        <Link className="btn" to="/me">
          Back to my space
        </Link>
      </Shell>
    );
  }

  /* An organisation applies, and you may only apply for one you belong to. */
  if (!me.organisations.length) {
    return (
      <Shell colour={data.colour}>
        <h1>{data.programName}</h1>
        <div className="callout">
          <Icon name="alert" size={15} />
          <div>
            <strong>An organisation applies, not a person.</strong> Create your organisation page first — it takes a
            minute, and it is yours from one edition to the next.
          </div>
        </div>
        <Link className="btn primary" to="/me">
          Create my organisation page
        </Link>
      </Shell>
    );
  }

  const applyingAs = orgId || me.organisations[0].record.id;
  const gate = data.eligibility.mode === 'gate';
  const allTicked = data.eligibility.criteria.every((c) => ticked.includes(c.id));
  const blockedByGate = gate && !allTicked;

  const hasEligibility = data.eligibility.criteria.length > 0;
  const paged = data.layout === 'paged' && data.pages.length > 0;
  // Step 0 is who is applying, plus the eligibility list when there is one.
  const steps = paged ? ['Before you start', ...data.pages.map((p) => p.name)] : [];
  const currentPage = paged ? (step === 0 ? null : data.pages[step - 1]) : null;
  const last = !paged || step === steps.length - 1;

  const setAnswer = (id: string, value: unknown) => {
    setValues((v) => ({ ...v, [id]: value }));
    setErrors((e) => {
      if (!e[`answers.${id}`]) return e;
      const { [`answers.${id}`]: _removed, ...rest } = e;
      return rest;
    });
  };

  const checkStep = (): Record<string, string> => {
    const found: Record<string, string> = {};
    const fields = paged ? (currentPage?.fields ?? []) : data.pages.flatMap((p) => p.fields);
    for (const field of fields) {
      if (field.required && isEmpty(values[field.id])) found[`answers.${field.id}`] = 'This answer is required.';
    }
    return found;
  };

  const next = () => {
    const found = checkStep();
    setErrors(found);
    if (Object.keys(found).length) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    const found = checkStep();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    try {
      const result = await api.post<{ confirmation: string }>(`/api/public/forms/${token}`, {
        orgId: applyingAs,
        acknowledged: ticked,
        answers: values,
      });
      setDone(result.confirmation);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        if (paged) {
          const bad = Object.keys(err.fields)
            .filter((k) => k.startsWith('answers.'))
            .map((k) => k.slice('answers.'.length));
          const at = data.pages.findIndex((p) => p.fields.some((f) => bad.includes(f.id)));
          if (at >= 0) setStep(at + 1);
        }
      } else {
        setErrors({ _: (err as Error).message });
      }
    } finally {
      setSending(false);
    }
  };

  const start = (
    <>
      <h3 className="section-title">Who is applying</h3>
      {me.organisations.length > 1 ? (
        <div className="field">
          <label>Organisation</label>
          <select className="input" value={applyingAs} onChange={(e) => setOrgId(e.target.value)}>
            {me.organisations.map((o) => (
              <option key={o.record.id} value={o.record.id}>
                {o.record.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="rowcard link-row">
          <span className="rec-mark">
            {me.organisations[0].record.name
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </span>
          <span style={{ flex: 1 }}>
            <strong style={{ fontSize: 13 }}>{me.organisations[0].record.name}</strong>
            <span className="faint" style={{ display: 'block', fontSize: 12 }}>
              {me.record.name} · {me.account.email}
            </span>
          </span>
        </div>
      )}

      {hasEligibility && (
        <>
          <h3 className="section-title">Before you start</h3>
          <p className="faint" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            {gate
              ? 'Every line has to be true to apply to this call.'
              : 'What this call is looking for. Tick what applies to you.'}
          </p>
          <div className="rows">
            {data.eligibility.criteria.map((c) => (
              <label className="check rowcard" style={{ padding: '10px 12px' }} key={c.id}>
                <input
                  type="checkbox"
                  checked={ticked.includes(c.id)}
                  onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c.id] : t.filter((x) => x !== c.id)))}
                />
                <span style={{ fontSize: 13 }}>{c.label}</span>
              </label>
            ))}
          </div>
          {blockedByGate && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              This call is only open to organisations that meet every criterion above.
            </div>
          )}
        </>
      )}
    </>
  );

  const fieldsOf = (page: PublicPage) =>
    page.fields.map((field) => (
      <PublicField
        key={field.id}
        field={field}
        value={values[field.id]}
        onChange={(v) => setAnswer(field.id, v)}
        error={errors[`answers.${field.id}`]}
      />
    ));

  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={{ background: `linear-gradient(90deg, ${data.colour}, ${data.colour}55)` }} />
        <div className="public-body">
          <div className="eyebrow">{data.editionName}</div>
          <h1>{data.programName}</h1>
          {data.intro && <p className="public-intro">{data.intro}</p>}

          {data.closesAt && (
            <span className="badge warn">
              <Icon name="clock" size={13} /> Closes {formatDate(data.closesAt)}
            </span>
          )}

          {paged && (
            <div className="steps">
              {steps.map((name, i) => (
                <span className={i === step ? 'step on' : i < step ? 'step done' : 'step'} key={name}>
                  <span className="step-n">{i + 1}</span>
                  {name}
                </span>
              ))}
            </div>
          )}

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> {errors._}
            </div>
          )}

          {paged ? (
            step === 0 ? (
              start
            ) : (
              <>
                <h3 className="section-title">{currentPage!.name}</h3>
                {currentPage!.intro && (
                  <p className="faint" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                    {currentPage!.intro}
                  </p>
                )}
                {fieldsOf(currentPage!)}
              </>
            )
          ) : (
            <>
              {start}
              {data.pages.map((page) => (
                <div key={page.id}>
                  {page.intro && (
                    <p className="faint" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                      {page.intro}
                    </p>
                  )}
                  {fieldsOf(page)}
                </div>
              ))}
            </>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            {paged && step > 0 && (
              <button className="btn" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
            <div className="spacer" />
            {last ? (
              <button className="btn primary" disabled={sending || blockedByGate} onClick={submit}>
                {sending ? 'Sending…' : 'Send my application'}
              </button>
            ) : (
              /* A gate holds the form shut: there is no way past this step. */
              !blockedByGate && (
                <button className="btn primary" onClick={next}>
                  Continue <Icon name="arrowRight" size={14} />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell({ children, colour }: { children: React.ReactNode; colour?: string }) {
  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={colour ? { background: colour } : undefined} />
        <div className="public-body stack" style={{ gap: 14 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PublicField({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const label = (
    <label>
      {field.label}
      {field.required && <span style={{ color: 'var(--stop)' }}> *</span>}
    </label>
  );

  return (
    <div className="field">
      {label}
      {field.help && <div className="hint" style={{ marginTop: -2, marginBottom: 5 }}>{field.help}</div>}

      {field.type === 'long_text' ? (
        <textarea className="textarea" rows={4} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'select' ? (
        <select className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose one</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === 'multiselect' ? (
        <div className="rows">
          {field.options.map((o) => {
            const chosen = Array.isArray(value) ? (value as string[]) : [];
            return (
              <label className="check rowcard" style={{ padding: '8px 11px' }} key={o}>
                <input
                  type="checkbox"
                  checked={chosen.includes(o)}
                  onChange={(e) => onChange(e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))}
                />
                <span style={{ fontSize: 13 }}>{o}</span>
              </label>
            );
          })}
        </div>
      ) : field.type === 'file' ? (
        <FileField field={field} value={value} onChange={onChange} />
      ) : (
        <input
          className={error ? 'input bad' : 'input'}
          type={
            field.type === 'email'
              ? 'email'
              : field.type === 'number'
                ? 'number'
                : field.type === 'date'
                  ? 'date'
                  : field.type === 'url'
                    ? 'url'
                    : field.type === 'phone'
                      ? 'tel'
                      : 'text'
          }
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {error && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{error}</div>}
    </div>
  );
}

/** An attachment is sent as soon as it is chosen; submitting claims it. */
function FileField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const current = value as { uploadId: string; filename: string; size: number } | undefined;

  const upload = async (file: File) => {
    setProblem('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setProblem(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('fieldId', field.id);
      body.append('file', file);
      const res = await fetch('/api/public/uploads', { method: 'POST', body });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Upload failed.');
      const saved = (await res.json()) as { id: string; filename: string; size: number };
      onChange({ uploadId: saved.id, filename: saved.filename, size: saved.size });
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (current) {
    return (
      <div className="rowcard link-row">
        <Icon name="file" size={15} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{current.filename}</strong>
          <span className="faint num" style={{ display: 'block', fontSize: 12 }}>
            {(current.size / 1024).toFixed(0)} KB
          </span>
        </span>
        <button className="btn ghost sm" onClick={() => onChange(undefined)}>
          Replace
        </button>
      </div>
    );
  }

  return (
    <>
      <label className="dropzone">
        <input type="file" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Icon name="file" size={16} />
        <span>{busy ? 'Sending…' : 'Choose a file — 10 MB at most'}</span>
      </label>
      {problem && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{problem}</div>}
    </>
  );
}
