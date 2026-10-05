/**
 * Un gabarit de message, et ce qu'il donne une fois rempli.
 *
 * Shared by every brick that writes to startups, because the act is the same
 * whichever one it is: a letter that is already whole, variables a click away
 * rather than typed from memory, and an example filled in with this block's own
 * data. A second copy of this would be a second place for the wording of a
 * programme to drift.
 */
import { fillTemplate } from '@ceed/shared';
import { useRef, useState } from 'react';
import { Icon } from '../../../ui/Icon';

/** One template, with its variables a click away and said back filled in. */
export function Template({
  label,
  help,
  value,
  onChange,
  variables,
  example,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (next: string) => void;
  variables: readonly { name: string; label: string; what: string; example?: string }[];
  /** Only what this block knows — its own name, its own labels. The rest comes
      from the variables themselves, so a new one can never be forgotten here. */
  example?: Record<string, string | undefined>;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [show, setShow] = useState(false);

  /* Dropped at the cursor, because the alternative — appended at the end, or
     typed from memory — is how {{startup}} ends up spelled {{Startup}} and
     goes out as four braces. */
  const insert = (name: string) => {
    const el = box.current;
    const token = `{{${name}}}`;
    if (!el) return onChange(value + token);
    const from = el.selectionStart ?? value.length;
    const to = el.selectionEnd ?? from;
    onChange(value.slice(0, from) + token + value.slice(to));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from + token.length, from + token.length);
    });
  };

  const known = new Set(variables.map((v) => v.name));
  const unknown = [...new Set([...value.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)].map((m) => m[1]!))].filter(
    (n) => !known.has(n),
  );

  return (
    <div className="field">
      <div className="row">
        <label style={{ flex: 1 }}>{label}</label>
        <button className="linkish" style={{ fontSize: 12 }} onClick={() => setShow(!show)}>
          {show ? 'Hide preview' : 'Preview'}
        </button>
      </div>
      <div className="help">{help}</div>
      <textarea
        ref={box}
        className="textarea"
        rows={9}
        value={value}
        style={{ marginTop: 6 }}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
        {variables.map((v) => (
          <button key={v.name} className="btn ghost sm" title={v.what} onClick={() => insert(v.name)}>
            <Icon name="plus" size={11} /> {v.label}
          </button>
        ))}
      </div>
      {/* A name nobody replaces goes out written exactly as typed. Said here
          rather than discovered in somebody's inbox. */}
      {unknown.length > 0 && (
        <p className="warnline" style={{ margin: '6px 0 0', fontSize: 12 }}>
          {unknown.map((u) => `{{${u}}}`).join(', ')} {unknown.length === 1 ? 'is' : 'are'} not a variable here — it
          will go out written like that.
        </p>
      )}
      {show && (
        <pre className="letter" style={{ marginTop: 6 }}>
          {fillTemplate(value, {
            ...Object.fromEntries(variables.map((v) => [v.name, v.example ?? ''])),
            // Undefined means "this block has nothing of its own to say here",
            // so the variable's own sample stands.
            ...Object.fromEntries(Object.entries(example ?? {}).filter(([, v]) => v !== undefined)),
          } as Record<string, string>)}
        </pre>
      )}
    </div>
  );
}

