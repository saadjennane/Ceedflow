import { useId, type ReactNode } from 'react';

export function Field({
  label,
  help,
  error,
  children,
  hint,
}: {
  label: string;
  help?: string;
  error?: string;
  hint?: ReactNode;
  children: (id: string, invalid: boolean) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {hint && <span className="faint" style={{ fontWeight: 400 }}> · {hint}</span>}
      </label>
      {help && <div className="help">{help}</div>}
      {children(id, Boolean(error))}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  help,
  error,
  type = 'text',
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  error?: string;
  type?: string;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} help={help} error={error} hint={hint}>
      {(id, invalid) => (
        <input
          id={id}
          className="input"
          type={type}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  help,
  min,
  max,
  error,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  help?: string;
  min?: number;
  max?: number;
  error?: string;
}) {
  return (
    <Field label={label} help={help} error={error}>
      {(id, invalid) => (
        <input
          id={id}
          className="input num"
          type="number"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ''}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  help,
  placeholder,
  rows,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  placeholder?: string;
  rows?: number;
  error?: string;
}) {
  return (
    <Field label={label} help={help} error={error}>
      {(id, invalid) => (
        <textarea
          id={id}
          className="textarea"
          rows={rows}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  help,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  help?: string;
  error?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} help={help} error={error}>
      {(id, invalid) => (
        <select id={id} className="select" value={value} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function DateField({
  label,
  value,
  onChange,
  help,
  error,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  help?: string;
  error?: string;
}) {
  return (
    <Field label={label} help={help} error={error}>
      {(id, invalid) => (
        <input
          id={id}
          className="input"
          type="date"
          value={value ?? ''}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
    </Field>
  );
}

/** A comma-free tag editor: type, press Enter. */
export function TagField({
  label,
  values,
  onChange,
  help,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  help?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {help && <div className="help">{help}</div>}
      <div className="tag-box">
        {values.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(values.filter((t) => t !== tag))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          className="tag-input"
          placeholder={placeholder ?? 'Type and press Enter'}
          onKeyDown={(e) => {
            const input = e.currentTarget;
            if (e.key === 'Enter' && input.value.trim()) {
              e.preventDefault();
              const next = input.value.trim();
              if (!values.includes(next)) onChange([...values, next]);
              input.value = '';
            } else if (e.key === 'Backspace' && !input.value && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
        />
      </div>
    </div>
  );
}
