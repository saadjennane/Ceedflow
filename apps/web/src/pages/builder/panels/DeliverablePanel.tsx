import {
  DELIVERABLE_RETURN_VARIABLES,
  DELIVERABLE_VARIABLES,
  FIELD_TYPE_LABEL,
  FIELD_TYPES,
  fillTemplate,
  idOf,
  longDate,
  type DeliverableConfig,
  type FormField,
} from '@ceed/shared';
import { useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/useAsync';
import { Icon } from '../../../ui/Icon';
import { DateField, TextField } from '../../../ui/Field';
import { Modal } from '../../../ui/Overlays';
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
  const setItem = (id: string, partial: Partial<FormField>) =>
    patch({ items: config.items.map((item) => (item.id === id ? { ...item, ...partial } : item)) });

  const add = () =>
    patch({
      items: [
        ...config.items,
        {
          id: idOf.field(),
          type: 'file',
          label: '',
          help: '',
          required: true,
          options: [],
          showInTable: false,
          pageId: '',
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
              <div className="rowcard card-pad stack" key={item.id} style={{ gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={item.label}
                    placeholder="Registre de commerce"
                    aria-label="What is being asked for"
                    onChange={(e) => setItem(item.id, { label: e.target.value })}
                  />
                  <select
                    className="status-select"
                    value={item.type}
                    aria-label="Kind of answer"
                    onChange={(e) => setItem(item.id, { type: e.target.value as FormField['type'] })}
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {FIELD_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn ghost icon sm"
                    aria-label="Remove"
                    onClick={() => patch({ items: config.items.filter((x) => x.id !== item.id) })}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>

                <div className="row" style={{ gap: 10 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={item.help}
                    placeholder="A note for whoever has to find it"
                    aria-label="Note"
                    onChange={(e) => setItem(item.id, { help: e.target.value })}
                  />
                  <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(e) => setItem(item.id, { required: e.target.checked })}
                    />
                    Required
                  </label>
                </div>

                {(item.type === 'select' || item.type === 'multiselect') && (
                  <TextField
                    label="Choices"
                    value={item.options.join(', ')}
                    onChange={(v) => setItem(item.id, { options: v.split(',').map((x) => x.trim()).filter(Boolean) })}
                    placeholder="Oui, Non, En cours"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Under the list, not above it. Adding the eighth document and being
            sent back to the top to find what you just made is the thing that
            makes a list of a dozen tedious to build. */}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={add}>
            <Icon name="plus" size={13} /> Add something to ask for
          </button>
          <div className="spacer" />
          <FounderPreview config={config} />
        </div>
      </div>
    </>
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

/** One template, with its variables a click away and said back filled in. */
function Template({
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
  variables: readonly { name: string; label: string; what: string }[];
  example: Record<string, string>;
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
      {show && <pre className="letter" style={{ marginTop: 6 }}>{fillTemplate(value, example)}</pre>}
    </div>
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
