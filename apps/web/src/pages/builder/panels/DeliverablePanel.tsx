import { FIELD_TYPE_LABEL, FIELD_TYPES, idOf, type DeliverableConfig, type FormField } from '@ceed/shared';
import { Icon } from '../../../ui/Icon';
import { DateField, TextField } from '../../../ui/Field';
import { VisibilityControl } from './shared';

/* Two sides to set up, so two tabs: when the list is open, and what is on it.
   A dozen documents under the dates made the dates hard to find and the list
   hard to read. */
export const DELIVERABLE_TABS = ['Overview', 'What you ask for'] as const;
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
  status,
  missing,
  tab = 'Overview',
}: {
  config: DeliverableConfig;
  patch: (partial: Partial<DeliverableConfig>) => void;
  status: Parameters<typeof VisibilityControl>[0]['status'];
  missing?: string | null;
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

        <VisibilityControl
        config={config}
        patch={patch}
        status={status}
        missing={missing}
          what={{
            open: 'Startups can send what is asked',
            closed: 'The list is shut — nothing more can be sent',
            notOpen: 'Not open yet',
            empty: 'Ask for something first',
          }}
        />

        <TextField
          label="What they are told"
          value={config.intro}
          onChange={(v) => patch({ intro: v })}
          placeholder="Please send the documents below before 15 November."
          hint="optional"
        />
      </>
    );
  }

  return (
    <>
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
        <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={add}>
          <Icon name="plus" size={13} /> Add something to ask for
        </button>
      </div>
    </>
  );
}
