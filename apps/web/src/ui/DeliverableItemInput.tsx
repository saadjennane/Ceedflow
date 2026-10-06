/**
 * One thing asked of a startup, as the startup fills it in.
 *
 * Four shapes from two independent properties, and the rendering follows what
 * the item actually is rather than treating one case as the special one:
 *
 *   a field              — the question, as everywhere else
 *   a field, repeated    — plain lines; a card around a single input is a box
 *                          around nothing
 *   a group              — the fields under one heading, counted as one
 *   a group, repeated    — cards, "Associé 1", "Associé 2"
 *
 * Cards rather than a table for a repeated group because half of them fill
 * this on a phone, and three columns one of which carries a file button are
 * unusable at 390px. CEED reads the same answers as a table, where comparing
 * is the point.
 */
import { itemFields, type DeliverableItem, type FormField } from '@ceed/shared';
import { useState } from 'react';
import { useLang } from '../lib/lang';
import { FormFieldInput } from './FormField';
import { Icon } from './Icon';

/**
 * Ce que dit le bouton d'ajout.
 *
 * In English the word is repeated — "Add another associé" — because it reads
 * naturally and tells you what you are adding. In French it is not: "ajouter"
 * wants an article, and the article wants a gender nobody can guess from a
 * word CEED typed in. The cards above are headed "ASSOCIÉ 1", so the word is
 * already on screen; the button only has to say the act.
 */
const addLabel = (item: DeliverableItem, lang: string, add: string) =>
  lang === 'fr' ? add : item.each ? `${add} ${item.each.toLowerCase()}` : add;

/** A fresh, empty entry of this item's shape. */
const emptyEntry = (item: DeliverableItem): unknown => (item.kind === 'group' ? {} : null);

function Entry({
  item,
  value,
  onChange,
  readOnly,
}: {
  item: DeliverableItem;
  value: unknown;
  onChange: (next: unknown) => void;
  readOnly: boolean;
}) {
  if (item.kind !== 'group') {
    // The repeated line carries no label of its own: the item's label sits
    // above the lot, and repeating it on each row says nothing.
    return (
      <FormFieldInput
        field={{ ...item, label: '', help: '', required: false } as FormField}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }
  const values = (value ?? {}) as Record<string, unknown>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {item.fields.map((field) => (
        <FormFieldInput
          key={field.id}
          field={field}
          value={values[field.id] ?? null}
          readOnly={readOnly}
          onChange={(v) => onChange({ ...values, [field.id]: v })}
        />
      ))}
    </div>
  );
}

export function DeliverableItemInput({
  item,
  value,
  onChange,
  readOnly = false,
}: {
  item: DeliverableItem;
  value: unknown;
  onChange: (next: unknown) => void;
  readOnly?: boolean;
}) {
  const { t, lang } = useLang();

  /* A plain field is exactly what it always was. Everything below is for the
     three shapes that are not. */
  if (!item.repeatable && item.kind !== 'group') {
    return <FormFieldInput field={item as FormField} value={value} readOnly={readOnly} onChange={onChange} />;
  }

  const heading = (
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <label style={{ flex: 1 }}>
        {item.label}
        {item.required && <span style={{ color: 'var(--stop)' }}> *</span>}
      </label>
      {item.repeatable && item.required && (
        <span className="faint" style={{ fontSize: 12 }}>
          {/* « 1 associé minimum » plutôt que « at least one associé » : le mot
              est tapé en français par CEED, et la tournure évite d'avoir à
              deviner son genre. */}
          {lang === 'fr'
            ? `1 ${item.each ? item.each.toLowerCase() : 'élément'} minimum`
            : `at least one${item.each ? ` ${item.each.toLowerCase()}` : ''}`}
        </span>
      )}
    </div>
  );

  if (!item.repeatable) {
    return (
      <div className="field">
        {heading}
        {item.help && <div className="help">{item.help}</div>}
        <div className="stack" style={{ gap: 10, marginTop: 6 }}>
          <Entry item={item} value={value} onChange={onChange} readOnly={readOnly} />
        </div>
      </div>
    );
  }

  /* An entry nobody has touched is not an incomplete entry — it does not
     exist. A blank card therefore lives only on this screen: pressing Add
     shows one and saves nothing, and the answer is written when something is
     typed into it. Without that, one stray press would leave a half-made
     associé in the file, holding it incomplete for a reason nobody could see.
     Which is exactly what it did before this. */
  const entries = Array.isArray(value) ? value : [];
  const [blanks, setBlanks] = useState(0);
  const waiting = readOnly ? 0 : Math.max(blanks, entries.length ? 0 : 1);
  const shown = [...entries, ...Array.from({ length: waiting }, () => emptyEntry(item))];

  /** Writing one entry, saved or still blank. */
  const edit = (index: number, next: unknown) => {
    if (index < entries.length) {
      onChange(entries.map((old, i) => (i === index ? next : old)).filter((e) => !isBlank(item, e)));
      return;
    }
    if (isBlank(item, next)) return; // Still nothing in it: nothing to save.
    // It has become real. It joins the answer and stops being a waiting card.
    setBlanks((n) => Math.max(0, n - 1));
    onChange([...entries, next]);
  };

  const drop = (index: number) => {
    if (index < entries.length) onChange(entries.filter((_, i) => i !== index));
    else setBlanks((n) => Math.max(0, n - 1));
  };

  return (
    <div className="field">
      {heading}
      {item.help && <div className="help">{item.help}</div>}

      {readOnly && !entries.length && (
        <p className="faint" style={{ margin: '6px 0 0', fontSize: 13 }}>—</p>
      )}

      <div className="stack" style={{ gap: item.kind === 'group' ? 10 : 6, marginTop: 6 }}>
        {shown.map((entry, index) =>
          item.kind === 'group' ? (
            <div className="rowcard card-pad stack" key={index} style={{ gap: 10 }}>
              <div className="row">
                <span className="eyebrow" style={{ flex: 1 }}>
                  {item.each || 'Entry'} {index + 1}
                </span>
                {!readOnly && shown.length > 1 && (
                  <button
                    className="btn ghost icon sm"
                    aria-label={`Remove ${item.each || 'entry'} ${index + 1}`}
                    onClick={() => drop(index)}
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
              <Entry item={item} value={entry} readOnly={readOnly} onChange={(next) => edit(index, next)} />
            </div>
          ) : (
            <div className="row" key={index} style={{ gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Entry item={item} value={entry} readOnly={readOnly} onChange={(next) => edit(index, next)} />
              </div>
              {!readOnly && shown.length > 1 && (
                <button
                  className="btn ghost icon sm"
                  aria-label={`Remove ${index + 1}`}
                  onClick={() => drop(index)}
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          ),
        )}
      </div>

      {/* Under the last one, where the eye already is. */}
      {!readOnly && (
        <button
          className="btn sm"
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
          onClick={() => setBlanks((n) => n + 1)}
        >
          <Icon name="plus" size={13} /> {addLabel(item, lang, t('item.add'))}
        </button>
      )}
    </div>
  );
}

/** Nothing in it at all — which is not the same as unfinished. */
function isBlank(item: DeliverableItem, entry: unknown): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
  if (item.kind !== 'group') return empty(entry);
  const values = (entry ?? {}) as Record<string, unknown>;
  return itemFields(item).every((f) => empty(values[f.id]));
}
