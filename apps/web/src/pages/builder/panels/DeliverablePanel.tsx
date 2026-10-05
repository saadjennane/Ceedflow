import {
  DELIVERABLE_RETURN_VARIABLES,
  DELIVERABLE_VARIABLES,
  FIELD_TYPE_LABEL,
  FIELD_TYPES,
  idOf,
  longDate,
  type DeliverableConfig,
  type DeliverableItem,
  type FormField,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/useAsync';
import { Icon } from '../../../ui/Icon';
import { DateField, TextField } from '../../../ui/Field';
import { Modal } from '../../../ui/Overlays';
import { Template } from './Template';
import { OwedList } from '../../member/OwedItems';

/* Three sides to set up, so three tabs: when the list is open, what is on it,
   and what the startups are told. A dozen documents under the dates made the
   dates hard to find and the list hard to read. */
export const DELIVERABLE_TABS = ['Overview', 'What you ask for', 'Messages'] as const;
export type DeliverableTab = (typeof DELIVERABLE_TABS)[number];

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

/**
 * What is being asked of the startups that got this far.
 *
 * A flat list on purpose. A form has pages, sections and eligibility because
 * it is put once to people nobody knows yet; this is followed item by item
 * with a population that is known, and every structure a form needs would get
 * in the way of the one question this screen exists for — who has sent what.
 */
export function DeliverableSetup({
  config,
  patch,
  tab = 'Overview',
}: {
  config: DeliverableConfig;
  patch: (partial: Partial<DeliverableConfig>) => void;
  tab?: DeliverableTab;
}) {
  const setItem = (id: string, partial: Partial<DeliverableItem>) =>
    patch({ items: config.items.map((item) => (item.id === id ? { ...item, ...partial } : item)) });

  const blank = (): FormField => ({
    id: idOf.field(),
    type: 'file',
    label: '',
    help: '',
    required: true,
    options: [],
    showInTable: false,
    pageId: '',
  });

  /* Two buttons rather than a type in the dropdown, because these are not the
     same kind of choice: the dropdown says what ONE answer looks like, and a
     group says what counts as one thing. Hiding that distinction in a list
     beside "File" and "Short text" is how it gets missed. */
  const add = (kind: 'field' | 'group') =>
    patch({
      items: [
        ...config.items,
        {
          ...blank(),
          ...(kind === 'group'
            ? { kind: 'group' as const, label: '', required: true, fields: [blank()] }
            : { kind: 'field' as const }),
          fields: kind === 'group' ? [blank()] : [],
          repeatable: false,
          each: '',
        },
      ],
    });

  if (tab === 'Overview') {
    return (
      <>
        <div className="callout">
          <Icon name="file" size={15} />
          <div>
            Ask the startups still in for what a file needs — the documents and the figures both. Only those that
            passed the selection before this block are asked, and each one sees nothing but its own list.
          </div>
        </div>

        <div className="grid-2">
          <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
          <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
        </div>

      </>
    );
  }

  if (tab === 'Messages') return <MessagesTab config={config} patch={patch} />;

  return (
    <>
      {/* Above the list, because that is where it sits on their page: it is the
          sentence they read before the first item, not a separate setting. */}
      <TextField
        label="What they read above the list"
        value={config.intro}
        onChange={(v) => patch({ intro: v })}
        placeholder="Merci de déposer les pièces ci-dessous avant le 15 novembre."
        hint="optional"
      />

      <div className="field">
        <div className="row">
          <label style={{ flex: 1 }}>What you are asking for</label>
          <span className="badge num">{config.items.length}</span>
        </div>
        <div className="help">
          A document, or an answer. Marking one <strong>required</strong> is what makes a file complete or not — the
          rest are asked for without holding anything up.
        </div>

        {config.items.length === 0 && (
          <div className="empty" style={{ padding: 14, marginTop: 6 }}>
            Nothing is being asked yet.
          </div>
        )}
        {config.items.length > 0 && (
          <div className="rows" style={{ marginTop: 6 }}>
            {config.items.map((item) => (
              <ItemEditor
                key={item.id}
                item={item}
                onChange={(partial) => setItem(item.id, partial)}
                onRemove={() => patch({ items: config.items.filter((x) => x.id !== item.id) })}
                blank={blank}
              />
            ))}
          </div>
        )}

        {/* Under the list, not above it. Adding the eighth document and being
            sent back to the top to find what you just made is the thing that
            makes a list of a dozen tedious to build. */}
        <div className="row wrap" style={{ marginTop: 8, gap: 7 }}>
          <button className="btn sm" onClick={() => add('field')}>
            <Icon name="plus" size={13} /> Add a field
          </button>
          <button className="btn sm" onClick={() => add('group')} title="Several fields that count as one thing">
            <Icon name="plus" size={13} /> Add a group
          </button>
          <div className="spacer" />
          <FounderPreview config={config} />
        </div>
      </div>
    </>
  );
}

/** One field's own row: what it is called, what kind of answer, is it needed. */
function FieldRow({
  field,
  onChange,
  onRemove,
  requiredShown = true,
}: {
  field: FormField;
  onChange: (partial: Partial<FormField>) => void;
  onRemove?: () => void;
  /** Hidden where it could not mean anything different from the item's own. */
  requiredShown?: boolean;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={field.label}
          placeholder="Registre de commerce"
          aria-label="What is being asked for"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <select
          className="status-select"
          value={field.type}
          aria-label="Kind of answer"
          onChange={(e) => onChange({ type: e.target.value as FormField['type'] })}
        >
          {FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {FIELD_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
        {requiredShown && (
          <label className="row" style={{ gap: 6, fontSize: 12.5, flexShrink: 0 }}>
            <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} />
            Required
          </label>
        )}
        {onRemove && (
          <button className="btn ghost icon sm" aria-label="Remove" onClick={onRemove}>
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>

      {(field.type === 'select' || field.type === 'multiselect') && (
        <TextField
          label="Choices"
          value={field.options.join(', ')}
          onChange={(v) => onChange({ options: v.split(',').map((x) => x.trim()).filter(Boolean) })}
          placeholder="Oui, Non, En cours"
        />
      )}
    </div>
  );
}

/**
 * One thing asked for, as it is set up.
 *
 * The two checkboxes describe the item rather than the screen, and they are
 * independent on purpose. **Required** says the file is not complete without
 * it. **Repeatable** says there may be several — and only then does the
 * singular word appear, which is what makes the founder read "Add an associé"
 * instead of "Add an entry". Having that field surface at the moment the box
 * is ticked teaches the box better than any help text under it.
 */
function ItemEditor({
  item,
  onChange,
  onRemove,
  blank,
}: {
  item: DeliverableItem;
  onChange: (partial: Partial<DeliverableItem>) => void;
  onRemove: () => void;
  blank: () => FormField;
}) {
  const group = item.kind === 'group';
  const setField = (id: string, partial: Partial<FormField>) =>
    onChange({ fields: item.fields.map((f) => (f.id === id ? { ...f, ...partial } : f)) });

  return (
    <div className="rowcard card-pad stack" style={{ gap: 10 }}>
      {group ? (
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={item.label}
            placeholder="Associés"
            aria-label="What this group is called"
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <button className="btn ghost icon sm" aria-label="Remove" onClick={onRemove}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ) : (
        <FieldRow field={item} onChange={onChange} onRemove={onRemove} />
      )}

      <div className="row" style={{ gap: 10 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={item.help}
          placeholder="A note for whoever has to find it"
          aria-label="Note"
          onChange={(e) => onChange({ help: e.target.value })}
        />
        {group && (
          <label className="row" style={{ gap: 6, fontSize: 12.5, flexShrink: 0 }}>
            <input type="checkbox" checked={item.required} onChange={(e) => onChange({ required: e.target.checked })} />
            Required
          </label>
        )}
        <label className="row" style={{ gap: 6, fontSize: 12.5, flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={item.repeatable}
            onChange={(e) => onChange({ repeatable: e.target.checked })}
          />
          Repeatable
        </label>
      </div>

      {item.repeatable && (
        <TextField
          label="Each one is a"
          value={item.each}
          onChange={(v) => onChange({ each: v })}
          placeholder="associé"
          hint="singular"
        />
      )}

      {group && (
        <div className="field">
          <label>{item.repeatable && item.each ? `Asked for each ${item.each.toLowerCase()}` : 'The fields it holds'}</label>
          <div className="rows" style={{ marginTop: 6 }}>
            {item.fields.map((field) => (
              <div className="rowcard card-pad" key={field.id}>
                <FieldRow
                  field={field}
                  onChange={(partial) => setField(field.id, partial)}
                  onRemove={
                    item.fields.length > 1
                      ? () => onChange({ fields: item.fields.filter((f) => f.id !== field.id) })
                      : undefined
                  }
                  /* With one field, its own Required could not mean anything
                     different from the group's: an entry exists because
                     something was typed in it, or it does not exist. */
                  requiredShown={item.fields.length > 1}
                />
              </div>
            ))}
          </div>
          {/* "to each associé" rather than "to this group": it changes the
              shape, it does not add one more associé. That sentence is where
              the whole idea is either understood or not. */}
          <button
            className="btn sm"
            style={{ alignSelf: 'flex-start', marginTop: 8 }}
            onClick={() => onChange({ fields: [...item.fields, blank()] })}
          >
            <Icon name="plus" size={13} />{' '}
            {item.repeatable && item.each ? `Add a field to each ${item.each.toLowerCase()}` : 'Add a field to it'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The list as the startup opens it.
 *
 * The same component the founder's own page draws, against the config being
 * edited rather than the saved one — so the order of the items, the labels and
 * the instruction above them are checked before sixteen people read them. A
 * window rather than a route, for the same reason the grid preview is one: what
 * is being tried has not been saved.
 */
function FounderPreview({ config }: { config: DeliverableConfig }) {
  const [open, setOpen] = useState(false);
  if (!config.items.length) return null;
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}>
        <Icon name="eye" size={13} /> See their page
      </button>
      {open && (
        <Modal
          wide
          title="What they see"
          subtitle="Rafid Tech, as an example. Nothing here is saved — no answer, no row."
          onClose={() => setOpen(false)}
          footer={
            <>
              <div className="spacer" />
              <button className="btn primary" onClick={() => setOpen(false)}>
                Close
              </button>
            </>
          }
        >
          <OwedList
            ask={{ block: { id: 'preview', name: 'Due diligence' }, config, open: true, returns: [] }}
            orgName="Rafid Tech"
            onSave={() => {}}
          />
        </Modal>
      )}
    </>
  );
}

/**
 * What the startups read.
 *
 * Kept with the block rather than in a settings page somewhere: what a due
 * diligence asks for and the words it asks in are one piece of work, done in
 * one sitting. The defaults are whole letters — a template somebody has to
 * finish before the first send is a template that goes out half-written.
 */
function MessagesTab({
  config,
  patch,
}: {
  config: DeliverableConfig;
  patch: (partial: Partial<DeliverableConfig>) => void;
}) {
  const set = (key: keyof DeliverableConfig['messages'], next: string) =>
    patch({ messages: { ...config.messages, [key]: next } });

  /* What this block actually asks for — never an invented document. A preview
     that filled {{pieces}} with two plausible examples read as configuration:
     it showed a Registre de commerce nobody had asked for, on a block whose
     list was empty. A preview is only worth having if everything in it is
     true, so an empty list says it is empty. */
  const required = config.items.filter((i) => i.required);
  const pieces = required.length
    ? required.map((i) => `  · ${i.label || '(this one has no name yet)'}`).join('\n')
    : '  (nothing is being asked for yet — add it under “What you ask for”)';

  const link = useAsync(() => api.get<{ link: string }>('/api/app-link'), 'app-link');
  const example = {
    startup: 'Rafid Tech',
    pieces,
    date: longDate(config.closesAt) || '(no closing date set)',
    lien: link.data?.link || '(this platform has no public address set)',
  };

  return (
    <>
      <div className="callout">
        <Icon name="send" size={15} />
        <div>
          Written once here, sent from the work screen — where you see who it names before it goes. A message can
          still be adjusted for one send without changing the template.
        </div>
      </div>

      {/* Almost never seen: the platform picks its address up from the first
          page anybody opens. If it is still blank, something is genuinely
          wrong with how this is being served, and saying so beats sending a
          letter whose only instruction leads nowhere. */}
      {link.data && !link.data.link && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>We don’t know this platform’s own web address yet.</strong> A message using <strong>Link</strong>{' '}
            would have nowhere to send anybody, so it won’t go out. Reload this page; if it persists, whoever hosts
            this needs to look at it.
          </div>
        </div>
      )}

      <Template
        label="Asking for the documents"
        help="The first letter. It goes to each startup once."
        value={config.messages.request}
        onChange={(v) => set('request', v)}
        variables={DELIVERABLE_VARIABLES}
        example={example}
      />

      <Template
        label="Chasing a file still short"
        help="Sent to whoever still owes something they can act on — never to a file that is only waiting on CEED."
        value={config.messages.reminder}
        onChange={(v) => set('reminder', v)}
        variables={DELIVERABLE_VARIABLES}
        example={example}
      />

      <Template
        label="Sending one thing back"
        help="Goes out the moment you send something back, carrying the reason you typed. Nothing to launch."
        value={config.messages.rejected}
        onChange={(v) => set('rejected', v)}
        variables={DELIVERABLE_RETURN_VARIABLES}
        example={{
          ...example,
          piece: config.items[0]?.label || 'Registre de commerce',
          motif: 'Le registre date de 2024 — il nous en faut un de moins de trois mois.',
        }}
      />
    </>
  );
}
