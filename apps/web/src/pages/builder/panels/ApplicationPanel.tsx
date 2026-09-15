import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  idOf,
  type ApplicationConfig,
  type Block,
  type Candidate,
  type FieldType,
  type FormField,
} from '@ceed/shared';
import { useState } from 'react';
import { formatDate } from '../../../lib/format';
import { DateField, SelectField, TagField, TextArea, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Overlays';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function ApplicationSetup({
  block,
  config,
  patch,
}: {
  block: Block;
  config: ApplicationConfig;
  patch: (partial: Partial<ApplicationConfig>) => void;
}) {
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const toast = useToast();

  const publicUrl = `${window.location.origin}/apply/${config.publicToken}`;

  const setField = (id: string, partial: Partial<FormField>) =>
    patch({ fields: config.fields.map((f) => (f.id === id ? { ...f, ...partial } : f)) });

  const addField = (type: FieldType) => {
    const field: FormField = {
      id: idOf.field(),
      type,
      label: '',
      help: '',
      required: false,
      options: type === 'select' || type === 'multiselect' ? ['First option'] : [],
      showInTable: false,
    };
    patch({ fields: [...config.fields, field] });
    setOpenFieldId(field.id);
  };

  const moveField = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...config.fields];
    const from = list.findIndex((f) => f.id === fromId);
    const to = list.findIndex((f) => f.id === toId);
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    patch({ fields: list });
  };

  return (
    <>
      <div className={config.published ? 'callout ok' : 'callout'}>
        <Icon name={config.published ? 'check' : 'link'} size={15} />
        <div style={{ flex: 1 }}>
          {config.published ? (
            <>
              <strong>The form is live.</strong> Anyone with the link can apply, and every submission creates a
              candidate in this track.
              <div className="row" style={{ marginTop: 8, gap: 7 }}>
                <code className="public-link">{publicUrl}</code>
                <button
                  className="btn sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(publicUrl);
                    toast('Link copied.');
                  }}
                >
                  <Icon name="copy" size={13} /> Copy
                </button>
                <a className="btn sm" href={publicUrl} target="_blank" rel="noreferrer">
                  <Icon name="eye" size={13} /> Open
                </a>
              </div>
            </>
          ) : (
            <>
              <strong>Not published.</strong> The link exists but returns nothing until you publish. Save the block
              after publishing for the change to take effect.
            </>
          )}
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={config.published} onChange={(e) => patch({ published: e.target.checked })} />
        <span>
          <strong>Publish the form</strong>
          <div className="faint" style={{ fontSize: 12 }}>
            Outside the opening dates below, the page tells visitors the call is not open.
          </div>
        </span>
      </label>

      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>

      <TextArea
        label="Introduction shown on the form"
        value={config.intro}
        onChange={(v) => patch({ intro: v })}
        rows={3}
        placeholder="Applications are open until 10 October. Expect about twenty minutes."
      />

      <TextArea
        label="Message after submitting"
        value={config.confirmation}
        onChange={(v) => patch({ confirmation: v })}
        rows={2}
      />

      <div className="public-sep" />

      <div className="row">
        <h3 className="section-title">Questions</h3>
        <span className="badge num">{config.fields.length}</span>
        <div className="spacer" />
        <AddFieldMenu onPick={addField} />
      </div>

      {!config.fields.length && (
        <div className="empty" style={{ padding: 26 }}>
          No question yet. Every applicant is asked for their organisation name, contact and email already — add what
          else you need to decide.
        </div>
      )}

      <div className="rows">
        {config.fields.map((field) => (
          <div
            key={field.id}
            className="rowcard"
            onDragOver={(e) => {
              e.preventDefault();
              if (dragId) moveField(dragId, field.id);
            }}
          >
            <div className="rowcard-head">
              <span
                className="grip"
                draggable
                onDragStart={() => setDragId(field.id)}
                onDragEnd={() => setDragId(null)}
                title="Drag to reorder"
              >
                <Icon name="drag" size={15} />
              </span>
              <button className="rowcard-title" onClick={() => setOpenFieldId(openFieldId === field.id ? null : field.id)}>
                {field.label || <span className="faint">Untitled question</span>}
              </button>
              <span className="mini">{FIELD_TYPE_LABEL[field.type]}</span>
              {field.required && <span className="badge stop">Required</span>}
              {field.showInTable && (
                <span className="badge info" title="Shown as a column in the candidates table">
                  Column
                </span>
              )}
              <button
                className="btn ghost icon sm"
                onClick={() => setOpenFieldId(openFieldId === field.id ? null : field.id)}
                aria-label="Edit question"
              >
                <Icon name={openFieldId === field.id ? 'chevronDown' : 'chevronRight'} size={14} />
              </button>
              <button
                className="btn ghost icon sm"
                onClick={() => patch({ fields: config.fields.filter((f) => f.id !== field.id) })}
                aria-label="Remove question"
              >
                <Icon name="trash" size={13} />
              </button>
            </div>

            {openFieldId === field.id && (
              <div className="rowcard-body">
                <TextField
                  label="Question"
                  value={field.label}
                  onChange={(v) => setField(field.id, { label: v })}
                  placeholder="What problem are you solving?"
                />
                <TextField
                  label="Helper text"
                  value={field.help}
                  onChange={(v) => setField(field.id, { help: v })}
                  hint="optional"
                  placeholder="Three or four sentences."
                />
                <SelectField
                  label="Answer type"
                  value={field.type}
                  onChange={(v) => setField(field.id, { type: v as FieldType })}
                  options={FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_LABEL[t] }))}
                />
                {(field.type === 'select' || field.type === 'multiselect') && (
                  <TagField
                    label="Options"
                    values={field.options}
                    onChange={(v) => setField(field.id, { options: v })}
                    placeholder="Add an option"
                  />
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => setField(field.id, { required: e.target.checked })}
                  />
                  <span>Required</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={field.showInTable}
                    onChange={(e) => setField(field.id, { showInTable: e.target.checked })}
                  />
                  <span>Show as a column in the candidates table</span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="faint" style={{ fontSize: 12, margin: 0 }}>
        Block id <span className="num">{block.id}</span>
      </p>
    </>
  );
}

function AddFieldMenu({ onPick }: { onPick: (type: FieldType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-anchor">
      <button className="btn sm" onClick={() => setOpen((v) => !v)}>
        <Icon name="plus" size={13} /> Add question
      </button>
      {open && (
        <>
          <div className="menu-catch" onClick={() => setOpen(false)} />
          <div className="menu" style={{ width: 210 }}>
            {FIELD_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => {
                  setOpen(false);
                  onPick(type);
                }}
              >
                <Icon name="form" />
                <div>
                  <strong>{FIELD_TYPE_LABEL[type]}</strong>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Submissions                                                         */
/* ------------------------------------------------------------------ */

export function ApplicationSubmissions({
  block,
  config,
  candidates,
}: {
  block: Block;
  config: ApplicationConfig;
  candidates: Candidate[];
}) {
  const mine = candidates.filter((c) => c.originBlockId === block.id);
  const bySource = new Map<string, number>();
  for (const c of mine) bySource.set(c.source || 'Unknown', (bySource.get(c.source || 'Unknown') ?? 0) + 1);

  if (!mine.length) {
    return (
      <div className="empty">
        <h3>No submission yet</h3>
        <p>
          {config.published
            ? 'The form is live. Submissions will appear here as they come in.'
            : 'Publish the form and share its link to start receiving applications.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="row wrap">
        <span className="badge info num">{mine.length} submissions</span>
        {[...bySource.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => (
            <span className="badge" key={source}>
              {source} <span className="num">{count}</span>
            </span>
          ))}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Contact</th>
              <th>Source</th>
              <th>Received</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((c) => (
              <tr key={c.id}>
                <td className="name">{c.orgName}</td>
                <td className="muted">
                  {c.contactName}
                  {c.email && (
                    <>
                      <br />
                      <span className="faint" style={{ fontSize: 12 }}>
                        {c.email}
                      </span>
                    </>
                  )}
                </td>
                <td className="muted">{c.source || '—'}</td>
                <td className="muted">{formatDate(c.submittedAt)}</td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
