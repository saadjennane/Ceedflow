/**
 * Une liste de questions : leur ordre, leurs pages, leurs types.
 *
 * Sorti du formulaire de candidature pour servir aussi au compte rendu d'un
 * One to One — un formulaire est un formulaire, qu'un candidat le remplisse
 * ou un mentor face à une startup. Ce qui n'appartient qu'à la candidature
 * (l'aperçu, la reprise de la fiche, la colonne du tableau) arrive en option.
 */
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  PROFILE_SOURCES,
  formPages,
  idOf,
  type FieldType,
  type FormField,
  type FormPage,
} from '@ceed/shared';
import { useState, type ReactNode } from 'react';
import { SelectField, TagField, TextField } from './Field';
import { Icon } from './Icon';
import { ConfirmDialog, useToast } from './Overlays';

export interface Questions {
  layout: 'single' | 'paged';
  pages: FormPage[];
  fields: FormField[];
}

export function QuestionsEditor({
  value,
  onChange,
  toolbar,
  emptyText,
  pagedHint = 'Questions split into named steps, one after the other, with the progress shown along the way.',
  firstPageName = 'Page 1',
  profileLink = false,
  columnToggle = false,
}: {
  value: Questions;
  onChange: (partial: Partial<Questions>) => void;
  /** Beside the title — the application puts its preview there. */
  toolbar?: ReactNode;
  emptyText: string;
  pagedHint?: string;
  firstPageName?: string;
  /** Offer to prefill a question from the organisation’s profile (applications only). */
  profileLink?: boolean;
  /** Offer to show a question as a column of the candidates table (applications only). */
  columnToggle?: boolean;
}) {
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmPage, setConfirmPage] = useState<FormPage | null>(null);
  const toast = useToast();
  const paged = value.layout === 'paged';
  const grouped = formPages(value);

  const setField = (id: string, partial: Partial<FormField>) =>
    onChange({ fields: value.fields.map((f) => (f.id === id ? { ...f, ...partial } : f)) });

  const addField = (type: FieldType, pageId: string) => {
    const field: FormField = {
      id: idOf.field(),
      type,
      label: '',
      help: '',
      required: false,
      options: type === 'select' || type === 'multiselect' ? ['First option'] : [],
      showInTable: false,
      pageId,
    };
    // A new question lands at the end of its own page, not at the end of the form.
    const list = [...value.fields];
    const lastOfPage = list.map((f) => f.pageId).lastIndexOf(pageId);
    list.splice(lastOfPage === -1 ? list.length : lastOfPage + 1, 0, field);
    onChange({ fields: list });
    setOpenFieldId(field.id);
  };

  /** Dropping a question on another one puts it there — and on that page. */
  const moveField = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...value.fields];
    const from = list.findIndex((f) => f.id === fromId);
    const to = list.findIndex((f) => f.id === toId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    // After the removal everything past `from` shifted down by one.
    const target = list[to > from ? to - 1 : to];
    list.splice(to, 0, { ...moved, pageId: target?.pageId ?? moved.pageId });
    onChange({ fields: list });
  };

  /** Dropping on an empty page, or below the last question of a page. */
  const moveToPage = (fromId: string, pageId: string) => {
    const list = [...value.fields];
    const from = list.findIndex((f) => f.id === fromId);
    if (from === -1) return;
    const [moved] = list.splice(from, 1);
    const lastOfPage = list.map((f) => f.pageId).lastIndexOf(pageId);
    list.splice(lastOfPage === -1 ? list.length : lastOfPage + 1, 0, { ...moved, pageId });
    onChange({ fields: list });
  };

  const setLayout = (layout: 'single' | 'paged') => {
    if (layout === 'paged' && !value.pages.length) {
      // Everything that exists becomes the first page, so nothing is stranded.
      const first: FormPage = { id: idOf.field().replace('fld_', 'pg_'), name: firstPageName, intro: '' };
      onChange({
        layout,
        pages: [first],
        fields: value.fields.map((f) => ({ ...f, pageId: first.id })),
      });
      return;
    }
    onChange({ layout });
  };

  const addPage = () => {
    const page: FormPage = {
      id: idOf.field().replace('fld_', 'pg_'),
      name: `Page ${value.pages.length + 1}`,
      intro: '',
    };
    onChange({ pages: [...value.pages, page] });
  };

  const removePage = (page: FormPage) => {
    const remaining = value.pages.filter((p) => p.id !== page.id);
    const fallback = remaining[Math.max(0, value.pages.findIndex((p) => p.id === page.id) - 1)]?.id ?? '';
    onChange({
      pages: remaining,
      // Questions are never deleted with their page — they move to the one before.
      fields: value.fields.map((f) => (f.pageId === page.id ? { ...f, pageId: fallback } : f)),
    });
    toast(remaining.length ? `Questions moved to ${remaining[0]!.name}.` : 'Page removed.');
  };

  return (
    <>
      <div className="field">
        <label>How the form is laid out</label>
        <div className="pick-list">
          <button type="button" className={!paged ? 'pick on' : 'pick'} onClick={() => setLayout('single')}>
            <Icon name={!paged ? 'check' : 'square'} />
            <div>
              <strong>One page</strong>
              <span>Every question on a single scroll. Good for a short form.</span>
            </div>
          </button>
          <button type="button" className={paged ? 'pick on' : 'pick'} onClick={() => setLayout('paged')}>
            <Icon name={paged ? 'check' : 'square'} />
            <div>
              <strong>Several pages</strong>
              <span>
                {pagedHint}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div className="row">
        <h3 className="section-title">Questions</h3>
        <span className="badge num">{value.fields.length}</span>
        {paged && <span className="badge num">{value.pages.length} pages</span>}
        <div className="spacer" />
        {toolbar}
        {paged && (
          <button className="btn sm" onClick={addPage}>
            <Icon name="plus" size={13} /> Add page
          </button>
        )}
        {!paged && <AddFieldMenu onPick={(type) => addField(type, '')} />}
      </div>

      {!value.fields.length && !paged && (
        <div className="empty" style={{ padding: 26 }}>
          {emptyText}
        </div>
      )}

      <div className="stack" style={{ gap: 12 }}>
        {grouped.map(({ page, fields }, pageIndex) => (
          <section key={page.id || 'single'} className={paged ? 'form-page' : ''}>
            {paged && (
              <div className="form-page-head">
                <span className="phase-num">Page {pageIndex + 1}</span>
                <input
                  className="page-name"
                  value={page.name}
                  aria-label="Page name"
                  placeholder="Page name"
                  onChange={(e) =>
                    onChange({ pages: value.pages.map((p) => (p.id === page.id ? { ...p, name: e.target.value } : p)) })
                  }
                />
                <span className="badge num">{fields.length}</span>
                <AddFieldMenu onPick={(type) => addField(type, page.id)} compact />
                <button
                  className="btn ghost icon sm"
                  onClick={() => setConfirmPage(page)}
                  disabled={value.pages.length === 1}
                  title={value.pages.length === 1 ? 'A paged form needs at least one page' : 'Remove this page'}
                  aria-label="Remove page"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            )}

            {paged && (
              <input
                className="input page-intro"
                value={page.intro}
                placeholder="A line of context for this step (optional)"
                aria-label="Page introduction"
                onChange={(e) =>
                  onChange({ pages: value.pages.map((p) => (p.id === page.id ? { ...p, intro: e.target.value } : p)) })
                }
              />
            )}

            <div
              className="rows"
              style={paged ? { padding: '0 10px 10px' } : undefined}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId && paged) moveToPage(dragId, page.id);
                setDragId(null);
              }}
            >
              {!fields.length && <div className="phase-empty">Drag a question here, or add one.</div>}
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="rowcard"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragId) moveField(dragId, field.id);
                  }}
                  onDrop={(e) => {
                    // The position is already set by the drag; stop the page from
                    // catching this and pushing the question to the end.
                    e.stopPropagation();
                    setDragId(null);
                  }}
                >
                  <div className="rowcard-head">
                    <span
                      className="grip"
                      draggable
                      onDragStart={() => setDragId(field.id)}
                      onDragEnd={() => setDragId(null)}
                      title="Drag to reorder, or onto another page"
                    >
                      <Icon name="drag" size={15} />
                    </span>
                    <button
                      className="rowcard-title"
                      onClick={() => setOpenFieldId(openFieldId === field.id ? null : field.id)}
                    >
                      {field.label || <span className="faint">Untitled question</span>}
                    </button>
                    <span className="mini">{FIELD_TYPE_LABEL[field.type]}</span>
                    {field.required && <span className="badge stop">Required</span>}
                    {columnToggle && field.showInTable && (
                      <span className="badge info" title="Shown as a column in the candidates table">
                        Column
                      </span>
                    )}
                    {field.fromProfile && (
                      <span className="badge ok" title="Prefilled from the organisation’s profile">
                        Profile
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
                      onClick={() => onChange({ fields: value.fields.filter((f) => f.id !== field.id) })}
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
                      {paged && value.pages.length > 1 && (
                        <SelectField
                          label="On page"
                          value={field.pageId}
                          onChange={(v) => moveToPage(field.id, v)}
                          options={value.pages.map((p, i) => ({ value: p.id, label: `${i + 1}. ${p.name}` }))}
                        />
                      )}
                      {(field.type === 'select' || field.type === 'multiselect') && (
                        <TagField
                          label="Options"
                          values={field.options}
                          onChange={(v) => setField(field.id, { options: v })}
                          placeholder="Add an option"
                        />
                      )}
                      {/* La fiche de l'organisation, reprise ici : la startup ne
                          retape pas ce qu'elle a déjà dit, et garde la main pour
                          le corriger dans cette candidature. */}
                      {profileLink && (
                      <>
                      <SelectField
                        label="Prefill from the organisation’s profile"
                        value={field.fromProfile ?? ''}
                        onChange={(v) => setField(field.id, { fromProfile: v || undefined })}
                        options={[
                          { value: '', label: 'Nothing — the applicant types it' },
                          ...PROFILE_SOURCES.filter((src) => (src.types as readonly string[]).includes(field.type)).map(
                            (src) => ({ value: src.key, label: src.en }),
                          ),
                        ]}
                      />
                      {field.fromProfile &&
                        !PROFILE_SOURCES.find((src) => src.key === field.fromProfile)?.types.includes(field.type as never) && (
                          <div className="hint" style={{ color: 'var(--warn)' }}>
                            This answer type cannot take that part of the profile — choose another, or none.
                          </div>
                        )}
                      </>
                      )}
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => setField(field.id, { required: e.target.checked })}
                        />
                        <span>Required</span>
                      </label>
                      {columnToggle && (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={field.showInTable}
                          onChange={(e) => setField(field.id, { showInTable: e.target.checked })}
                        />
                        <span>Show as a column in the candidates table</span>
                      </label>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {confirmPage && (
        <ConfirmDialog
          title={`Remove ${confirmPage.name}?`}
          body="Its questions are not deleted — they move to the page before it."
          confirmLabel="Remove page"
          destructive
          onClose={() => setConfirmPage(null)}
          onConfirm={() => removePage(confirmPage)}
        />
      )}
    </>
  );
}

function AddFieldMenu({ onPick, compact }: { onPick: (type: FieldType) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-anchor">
      <button className="btn sm" onClick={() => setOpen((v) => !v)}>
        <Icon name="plus" size={13} /> {compact ? 'Question' : 'Add question'}
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
