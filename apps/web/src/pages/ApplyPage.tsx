import type { FormField } from '@ceed/shared';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';

interface PublicForm {
  programName: string;
  editionName: string;
  colour: string;
  blockName: string;
  intro: string;
  fields: FormField[];
  opensAt: string | null;
  closesAt: string | null;
  state: 'open' | 'closed' | 'not_open';
}

export function ApplyPage() {
  const { token = '' } = useParams();
  const form = useAsync(() => api.get<PublicForm>(`/api/public/forms/${token}`), token);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [contact, setContact] = useState({ orgName: '', contactName: '', email: '', phone: '', source: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  const submit = async () => {
    setSending(true);
    setErrors({});
    try {
      const result = await api.post<{ confirmation: string }>(`/api/public/forms/${token}`, {
        ...contact,
        answers: values,
      });
      setDone(result.confirmation);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ _: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  const setAnswer = (id: string, value: unknown) => setValues((v) => ({ ...v, [id]: value }));

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

          <div className="public-sep" />

          <h3 className="section-title">About you</h3>
          <Text label="Organisation" required value={contact.orgName} onChange={(v) => setContact((c) => ({ ...c, orgName: v }))} error={errors.orgName} />
          <div className="grid-2">
            <Text label="Your name" value={contact.contactName} onChange={(v) => setContact((c) => ({ ...c, contactName: v }))} />
            <Text label="Email" required type="email" value={contact.email} onChange={(v) => setContact((c) => ({ ...c, email: v }))} error={errors.email} />
          </div>
          <div className="grid-2">
            <Text label="Phone" value={contact.phone} onChange={(v) => setContact((c) => ({ ...c, phone: v }))} />
            <Text label="How did you hear about us?" value={contact.source} onChange={(v) => setContact((c) => ({ ...c, source: v }))} />
          </div>

          {data.fields.length > 0 && (
            <>
              <div className="public-sep" />
              <h3 className="section-title">Your application</h3>
              {data.fields.map((field) => (
                <PublicField
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  onChange={(v) => setAnswer(field.id, v)}
                  error={errors[`answers.${field.id}`]}
                />
              ))}
            </>
          )}

          {errors._ && <div className="callout warn"><Icon name="alert" size={15} />{errors._}</div>}

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn primary" disabled={sending} onClick={submit}>
              {sending ? 'Sending…' : 'Submit application'}
            </button>
            <span className="faint" style={{ fontSize: 12.5 }}>
              You will get a confirmation on screen straight away.
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
      <input className="input" type={type} value={value} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />
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
        <select className="select" value={(value as string) ?? ''} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)}>
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
