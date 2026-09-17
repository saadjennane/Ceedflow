import type { FormField } from '@ceed/shared';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';

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
  /** Where the call is running, as declared by the sourcing block. */
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
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [contact, setContact] = useState({ orgName: '', contactName: '', email: '', phone: '', source: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (form.loading) {
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
      <div className="public">
        <div className="public-card">
          <div className="public-body">
            <h1>This form is not available</h1>
            <p className="public-intro">{form.error ?? 'The link may be wrong, or the call may have closed.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const data = form.data;

  if (done) {
    return (
      <div className="public">
        <div className="public-card">
          <div className="public-top" style={{ background: data.colour }} />
          <div className="public-body">
            <span className="badge ok">
              <Icon name="check" size={13} /> Application received
            </span>
            <h1>{data.programName}</h1>
            <p className="public-intro">{done}</p>
          </div>
        </div>
      </div>
    );
  }

  const paged = data.layout === 'paged' && data.pages.length > 0;
  // Step 0 is always who you are; the configured pages follow.
  const steps = paged ? ['About you', ...data.pages.map((p) => p.name)] : [];
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

  /** What must be filled before this step can be left. */
  const checkStep = (): Record<string, string> => {
    const found: Record<string, string> = {};
    if (!paged || step === 0) {
      if (!contact.orgName.trim()) found.orgName = 'Tell us the name of your organisation.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) found.email = 'Enter a valid email address.';
    }
    const fields = paged
      ? (currentPage?.fields ?? [])
      : data.pages.flatMap((p) => p.fields);
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
        ...contact,
        answers: values,
      });
      setDone(result.confirmation);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        // Land the applicant on the first page that still needs something.
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

  const contactBlock = (
    <>
      <h3 className="section-title">About you</h3>
      <Text
        label="Organisation"
        required
        value={contact.orgName}
        onChange={(v) => setContact((c) => ({ ...c, orgName: v }))}
        error={errors.orgName}
      />
      <div className="grid-2">
        <Text label="Your name" value={contact.contactName} onChange={(v) => setContact((c) => ({ ...c, contactName: v }))} />
        <Text
          label="Email"
          required
          type="email"
          value={contact.email}
          onChange={(v) => setContact((c) => ({ ...c, email: v }))}
          error={errors.email}
        />
      </div>
      <div className="grid-2">
        <Text label="Phone" value={contact.phone} onChange={(v) => setContact((c) => ({ ...c, phone: v }))} />
        {data.channels.length ? (
          <div className="field">
            <label>How did you hear about us?</label>
            <select
              className="select"
              value={data.channels.includes(contact.source) ? contact.source : contact.source ? '__other' : ''}
              onChange={(e) => setContact((c) => ({ ...c, source: e.target.value === '__other' ? 'Other' : e.target.value }))}
            >
              <option value="">Choose one</option>
              {data.channels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
              <option value="__other">Somewhere else</option>
            </select>
          </div>
        ) : (
          <Text
            label="How did you hear about us?"
            value={contact.source}
            onChange={(v) => setContact((c) => ({ ...c, source: v }))}
          />
        )}
      </div>
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
          {step === 0 && data.intro && <p className="public-intro">{data.intro}</p>}
          {step === 0 && data.closesAt && (
            <span className="badge warn">
              <Icon name="clock" size={13} /> Closes {formatDate(data.closesAt)}
            </span>
          )}

          {paged && (
            <>
              <div className="steps">
                {steps.map((name, i) => (
                  <div key={name} className={`step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}>
                    <span className="step-dot">{i < step ? <Icon name="check" size={11} /> : i + 1}</span>
                    <span className="step-name">{name}</span>
                  </div>
                ))}
              </div>
              <div className="public-sep" />
            </>
          )}

          {paged ? (
            step === 0 ? (
              contactBlock
            ) : (
              currentPage && (
                <>
                  <h3 className="section-title">{currentPage.name}</h3>
                  {currentPage.intro && <p className="public-intro">{currentPage.intro}</p>}
                  {currentPage.fields.length ? fieldsOf(currentPage) : <p className="faint">Nothing to fill in here.</p>}
                </>
              )
            )
          ) : (
            <>
              {contactBlock}
              {data.pages[0]?.fields.length > 0 && (
                <>
                  <div className="public-sep" />
                  <h3 className="section-title">Your application</h3>
                  {fieldsOf(data.pages[0])}
                </>
              )}
            </>
          )}

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              {errors._}
            </div>
          )}

          <div className="row" style={{ marginTop: 6 }}>
            {paged && step > 0 && (
              <button className="btn" onClick={() => setStep((s) => s - 1)}>
                <Icon name="chevronLeft" size={14} /> Back
              </button>
            )}
            {last ? (
              <button className="btn primary" disabled={sending} onClick={submit}>
                {sending ? 'Sending…' : 'Submit application'}
              </button>
            ) : (
              <button className="btn primary" onClick={next}>
                Continue <Icon name="arrowRight" size={14} />
              </button>
            )}
            <span className="faint" style={{ fontSize: 12.5 }}>
              {last
                ? 'You will get a confirmation on screen straight away.'
                : `Step ${step + 1} of ${steps.length}. Nothing is sent until the last step.`}
            </span>
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
  required,
  type = 'text',
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        className="input"
        type={type}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div className="err">{error}</div>}
    </div>
  );
}

function PublicField({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const label = (
    <label>
      {field.label}
      {field.required && <span style={{ color: 'var(--stop)' }}> *</span>}
    </label>
  );

  if (field.type === 'long_text') {
    return (
      <div className="field">
        {label}
        {field.help && <div className="help">{field.help}</div>}
        <textarea
          className="textarea"
          value={(value as string) ?? ''}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
        {error && <div className="err">{error}</div>}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="field">
        {label}
        {field.help && <div className="help">{field.help}</div>}
        <select
          className="select"
          value={(value as string) ?? ''}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose one</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {error && <div className="err">{error}</div>}
      </div>
    );
  }

  if (field.type === 'multiselect') {
    const chosen = (value as string[]) ?? [];
    return (
      <div className="field">
        {label}
        {field.help && <div className="help">{field.help}</div>}
        <div className="rows">
          {field.options.map((option) => (
            <label className="check" key={option}>
              <input
                type="checkbox"
                checked={chosen.includes(option)}
                onChange={(e) => onChange(e.target.checked ? [...chosen, option] : chosen.filter((o) => o !== option))}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    );
  }

  const inputType =
    field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text';

  return (
    <div className="field">
      {label}
      {field.help && <div className="help">{field.help}</div>}
      <input
        className={field.type === 'number' ? 'input num' : 'input'}
        type={inputType}
        value={(value as string) ?? ''}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
      />
      {error && <div className="err">{error}</div>}
    </div>
  );
}
