import { MAX_UPLOAD_BYTES, type FormField } from '@ceed/shared';
import { useState } from 'react';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ */
/* One question, rendered once                                         */
/* ------------------------------------------------------------------ */

/**
 * The renderer for a question of an application form, shared by the public
 * form and by the team adding a candidacy that arrived by other means.
 *
 * One renderer because it is one form: the manual path used to offer only the
 * multiple-choice questions, so everything an applicant would have written —
 * the description, the figures, the stage — was silently dropped.
 */
export function FormFieldInput({
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
