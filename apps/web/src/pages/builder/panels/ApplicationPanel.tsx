import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  blockStatus,
  formPages,
  idOf,
  type ApplicationConfig,
  type Block,
  type Candidate,
  type FieldType,
  type FormField,
  type FormPage,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { DateField, SelectField, TagField, TextArea, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, useToast } from '../../../ui/Overlays';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

/** The sections of the Application drawer, in the order they are shown. */
/** The word the top callout uses for a form that exists but is shut. */
const STATE_WORD: Record<string, string> = {
  not_configured: 'empty',
  scheduled: 'not open yet',
  closed: 'closed',
  live: 'live',
};

export const APPLICATION_TABS = ['Overview', 'Form', 'Eligibility', 'Settings'] as const;
export type ApplicationTab = (typeof APPLICATION_TABS)[number];

export function ApplicationSetup({
  block,
  config,
  patch,
  tab = 'Overview',
}: {
  block: Block;
  config: ApplicationConfig;
  patch: (partial: Partial<ApplicationConfig>) => void;
  tab?: ApplicationTab;
}) {
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmPage, setConfirmPage] = useState<FormPage | null>(null);
  const [minting, setMinting] = useState(false);
  const toast = useToast();

  /** Issues a fresh public link and retires the old one on the spot. */
  const mintLink = async () => {
    setMinting(true);
    try {
      const updated = await api.post<Block>(`/api/blocks/${block.id}/application/token`);
      patch({ publicToken: (updated.config as ApplicationConfig).publicToken });
      toast('New link issued. The old one now leads nowhere.');
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setMinting(false);
    }
  };

  // Read from the draft, not the saved block: the toggle in the header edits
  // the draft, and a callout reading the old config contradicts it on screen.
  const state = blockStatus({ type: 'application', config });
  const live = state === 'live';
  const publicUrl = `${window.location.origin}/apply/${config.publicToken}`;
  const paged = config.layout === 'paged';
  const grouped = formPages(config);

  const setField = (id: string, partial: Partial<FormField>) =>
    patch({ fields: config.fields.map((f) => (f.id === id ? { ...f, ...partial } : f)) });

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
    const list = [...config.fields];
    const lastOfPage = list.map((f) => f.pageId).lastIndexOf(pageId);
    list.splice(lastOfPage === -1 ? list.length : lastOfPage + 1, 0, field);
    patch({ fields: list });
    setOpenFieldId(field.id);
  };

  /** Dropping a question on another one puts it there — and on that page. */
  const moveField = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...config.fields];
    const from = list.findIndex((f) => f.id === fromId);
    const to = list.findIndex((f) => f.id === toId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    // After the removal everything past `from` shifted down by one.
    const target = list[to > from ? to - 1 : to];
    list.splice(to, 0, { ...moved, pageId: target?.pageId ?? moved.pageId });
    patch({ fields: list });
  };

  /** Dropping on an empty page, or below the last question of a page. */
  const moveToPage = (fromId: string, pageId: string) => {
    const list = [...config.fields];
    const from = list.findIndex((f) => f.id === fromId);
    if (from === -1) return;
    const [moved] = list.splice(from, 1);
    const lastOfPage = list.map((f) => f.pageId).lastIndexOf(pageId);
    list.splice(lastOfPage === -1 ? list.length : lastOfPage + 1, 0, { ...moved, pageId });
    patch({ fields: list });
  };

  const setLayout = (layout: 'single' | 'paged') => {
    if (layout === 'paged' && !config.pages.length) {
      // Everything that exists becomes the first page, so nothing is stranded.
      const first: FormPage = { id: idOf.field().replace('fld_', 'pg_'), name: 'Your application', intro: '' };
      patch({
        layout,
        pages: [first],
        fields: config.fields.map((f) => ({ ...f, pageId: first.id })),
      });
      return;
    }
    patch({ layout });
  };

  const addPage = () => {
    const page: FormPage = {
      id: idOf.field().replace('fld_', 'pg_'),
      name: `Page ${config.pages.length + 1}`,
      intro: '',
    };
    patch({ pages: [...config.pages, page] });
  };

  const removePage = (page: FormPage) => {
    const remaining = config.pages.filter((p) => p.id !== page.id);
    const fallback = remaining[Math.max(0, config.pages.findIndex((p) => p.id === page.id) - 1)]?.id ?? '';
    patch({
      pages: remaining,
      // Questions are never deleted with their page — they move to the one before.
      fields: config.fields.map((f) => (f.pageId === page.id ? { ...f, pageId: fallback } : f)),
    });
    toast(remaining.length ? `Questions moved to ${remaining[0].name}.` : 'Page removed.');
  };

  if (tab === 'Eligibility') return <EligibilityTab config={config} patch={patch} />;
  if (tab === 'Settings') return <SettingsTab config={config} patch={patch} />;

  return (
    <>
      {tab === 'Overview' && (
      <>
      <div className={live ? 'callout ok' : 'callout'}>
        <Icon name={live ? 'check' : 'link'} size={15} />
        <div style={{ flex: 1 }}>
          {state !== 'not_configured' ? (
            <>
              <strong>{live ? 'The form is live.' : `The form is ${STATE_WORD[state]}.`}</strong>{' '}
              {live
                ? 'Anyone with the link can apply, and every submission creates a candidate in this track.'
                : 'The link resolves, and shows what a latecomer is told rather than the questions.'}
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
                {/* The late-applicant manoeuvre: a fresh link retires the old
                    one, so reopening the call does not reopen it to everybody
                    who kept the address from the first round. */}
                <button className="btn sm" disabled={minting} onClick={mintLink}>
                  <Icon name="edit" size={13} /> New link
                </button>
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

      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>

      <TextArea
        label="What a latecomer is told"
        value={config.closedMessage}
        onChange={(v) => patch({ closedMessage: v })}
        help="Shown once the call is closed, in place of the form. Empty falls back to a plain sentence."
      />

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

      </>
      )}

      {tab === 'Form' && (
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
                Questions split into named steps, one after the other. The applicant sees their progress and cannot
                move on until the required answers on the page are filled.
              </span>
            </div>
          </button>
        </div>
      </div>

      <div className="row">
        <h3 className="section-title">Questions</h3>
        <span className="badge num">{config.fields.length}</span>
        {paged && <span className="badge num">{config.pages.length} pages</span>}
        <div className="spacer" />
        {paged && (
          <button className="btn sm" onClick={addPage}>
            <Icon name="plus" size={13} /> Add page
          </button>
        )}
        {!paged && <AddFieldMenu onPick={(type) => addField(type, '')} />}
      </div>

      {!config.fields.length && !paged && (
        <div className="empty" style={{ padding: 26 }}>
          No question yet. Every applicant is asked for their organisation name, contact and email already — add what
          else you need to decide.
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
                    patch({ pages: config.pages.map((p) => (p.id === page.id ? { ...p, name: e.target.value } : p)) })
                  }
                />
                <span className="badge num">{fields.length}</span>
                <AddFieldMenu onPick={(type) => addField(type, page.id)} compact />
                <button
                  className="btn ghost icon sm"
                  onClick={() => setConfirmPage(page)}
                  disabled={config.pages.length === 1}
                  title={config.pages.length === 1 ? 'A paged form needs at least one page' : 'Remove this page'}
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
                  patch({ pages: config.pages.map((p) => (p.id === page.id ? { ...p, intro: e.target.value } : p)) })
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
                      {paged && config.pages.length > 1 && (
                        <SelectField
                          label="On page"
                          value={field.pageId}
                          onChange={(v) => moveToPage(field.id, v)}
                          options={config.pages.map((p, i) => ({ value: p.id, label: `${i + 1}. ${p.name}` }))}
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
          </section>
        ))}
      </div>

      </>
      )}

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

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

/**
 * Conditions the applicant ticks before starting. Informative ones are read and
 * acknowledged; a gate holds the form shut until every box is ticked.
 */
function EligibilityTab({
  config,
  patch,
}: {
  config: ApplicationConfig;
  patch: (partial: Partial<ApplicationConfig>) => void;
}) {
  const { mode, criteria } = config.eligibility;
  const set = (partial: Partial<ApplicationConfig['eligibility']>) =>
    patch({ eligibility: { ...config.eligibility, ...partial } });

  return (
    <>
      <div className="callout">
        <Icon name="filter" size={15} />
        Who the call is for. The applicant sees these before the first question and ticks them off.
      </div>

      <div className="field">
        <label>What the list does</label>
        <div className="pick-list">
          <button
            type="button"
            className={mode === 'informative' ? 'pick on' : 'pick'}
            onClick={() => set({ mode: 'informative' })}
          >
            <Icon name={mode === 'informative' ? 'check' : 'square'} />
            <div>
              <strong>Informative</strong>
              <span>Read and acknowledged. The applicant can carry on either way.</span>
            </div>
          </button>
          <button type="button" className={mode === 'gate' ? 'pick on' : 'pick'} onClick={() => set({ mode: 'gate' })}>
            <Icon name={mode === 'gate' ? 'check' : 'square'} />
            <div>
              <strong>A gate</strong>
              <span>
                Nothing opens until every box is ticked. Use it when a criterion genuinely disqualifies — it stops
                somebody wasting twenty minutes on a form they cannot pass.
              </span>
            </div>
          </button>
        </div>
      </div>

      <div className="row">
        <h3 className="section-title">Criteria</h3>
        <span className="badge num">{criteria.length}</span>
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={() => set({ criteria: [...criteria, { id: idOf.field().replace('fld_', 'elg_'), label: '' }] })}
        >
          <Icon name="plus" size={13} /> Add a criterion
        </button>
      </div>

      {!criteria.length ? (
        <div className="empty" style={{ padding: 24 }}>
          No criterion. The form opens straight on its first question.
        </div>
      ) : (
        <div className="rows">
          {criteria.map((c) => (
            <div className="rowcard" key={c.id} style={{ padding: '9px 11px', display: 'flex', gap: 9 }}>
              <Icon name="square" size={14} />
              <input
                className="input"
                value={c.label}
                placeholder="Registered in Morocco for less than five years"
                onChange={(e) =>
                  set({ criteria: criteria.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) })
                }
              />
              <button
                className="btn ghost icon sm"
                aria-label="Remove criterion"
                onClick={() => set({ criteria: criteria.filter((x) => x.id !== c.id) })}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === 'gate' && criteria.length > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          With a gate, somebody who cannot tick every box cannot apply at all. Make each line something they can
          answer honestly about themselves.
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function SettingsTab({
  config,
  patch,
}: {
  config: ApplicationConfig;
  patch: (partial: Partial<ApplicationConfig>) => void;
}) {
  return (
    <>
      <div className="callout">
        <Icon name="settings" size={15} />
        How the call behaves once it is open.
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={config.onePerOrganisation}
          onChange={(e) => patch({ onePerOrganisation: e.target.checked })}
        />
        <span>
          <strong>One application per organisation</strong>
          <div className="faint" style={{ fontSize: 12 }}>
            A second attempt is refused rather than creating a duplicate candidate.
          </div>
        </span>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={config.allowEditAfterSubmit}
          onChange={(e) => patch({ allowEditAfterSubmit: e.target.checked })}
        />
        <span>
          <strong>Let applicants change their answers</strong>
          <div className="faint" style={{ fontSize: 12 }}>
            They can reopen what they sent while the call is still open.
          </div>
        </span>
      </label>

      <div className="public-sep" />

      <div className="callout warn">
        <Icon name="alert" size={15} />
        <div>
          <strong>No mail provider is connected.</strong> The two below are recorded as intent — they are what will
          be sent the day one is wired in, and nothing leaves in the meantime.
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={config.confirmationEmail}
          onChange={(e) => patch({ confirmationEmail: e.target.checked })}
        />
        <span>
          <strong>Email the applicant a confirmation</strong>
          <div className="faint" style={{ fontSize: 12 }}>
            The message on screen after submitting is shown either way.
          </div>
        </span>
      </label>

      <TagField
        label="Tell these people about each submission"
        values={config.notifyOnSubmit}
        onChange={(v) => patch({ notifyOnSubmit: v })}
        placeholder="name@ceed.ma"
        help="Addresses for now. Once the directory backs this, it becomes people."
      />
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
          {blockStatus(block) === 'live'
            ? 'The form is live. Submissions will appear here as they come in.'
            : 'Open the form and share its link to start receiving applications.'}
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
