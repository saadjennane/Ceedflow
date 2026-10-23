import {
  APPLICATION_VARIABLES,
  blockStatus,
  formPages,
  idOf,
  type ApplicationConfig,
  type Block,
  type Candidate,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/useAsync';
import { formatDate } from '../../../lib/format';
import { DateField, TagField, TextArea } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { AccessTemplate, Template } from './Template';
import { Modal, useToast } from '../../../ui/Overlays';
import { ApplyCard, formShape, type PublicForm } from '../../../ui/ApplyCard';
import { QuestionsEditor } from '../../../ui/QuestionsEditor';

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

  if (tab === 'Eligibility') return <EligibilityTab config={config} patch={patch} />;
  if (tab === 'Settings') return <SettingsTab block={block} config={config} patch={patch} />;

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
        <QuestionsEditor
          value={config}
          onChange={patch}
          toolbar={<FormPreview block={block} config={config} />}
          emptyText="No question yet. Every applicant is asked for their organisation name, contact and email already — add what else you need to decide."
          pagedHint="Questions split into named steps, one after the other. The applicant sees their progress and cannot move on until the required answers on the page are filled."
          firstPageName="Your application"
          profileLink
          columnToggle
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
  block,
  config,
  patch,
}: {
  block: Block;
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

      <label className="check">
        <input
          type="checkbox"
          checked={config.confirmationEmail}
          onChange={(e) => patch({ confirmationEmail: e.target.checked })}
        />
        <span>
          <strong>Email the applicant a receipt</strong>
          <div className="faint" style={{ fontSize: 12 }}>
            Sent the moment they submit. The message on screen is shown either way.
          </div>
        </span>
      </label>

      {/* The one letter with no list to look at first, and rightly so: one
          recipient, signed in, who has just pressed the button themselves. */}
      {config.confirmationEmail && (
        <Template
          label="What the receipt says"
          help="It answers one question — did you get it — asked the minute after submitting."
          value={config.receivedMessage}
          onChange={(v: string) => patch({ receivedMessage: v })}
          subject={config.subjects.received}
          onSubject={(v) => patch({ subjects: { ...config.subjects, received: v } })}
          variables={APPLICATION_VARIABLES}
          example={{ appel: block.name }}
        />
      )}

      {config.confirmationEmail && (
        <AccessTemplate value={config.access} onChange={(v) => patch({ access: v })} />
      )}

      <TagField
        label="Tell these people about each submission"
        values={config.notifyOnSubmit}
        onChange={(v) => patch({ notifyOnSubmit: v })}
        placeholder="name@ceed.ma"
        help="They get the organisation's name and a link to the file, not a copy of the applicant's receipt."
      />

      {/* Un objet sans corps à régler : ce mot-là est un relevé de quatre
          lignes qui n'a pas à être réécrit, mais il atterrit dans une boîte
          CEED que quelqu'un trie, et c'est la ligne qui le fait trier. */}
      {config.notifyOnSubmit.length > 0 && (
        <div className="field">
          <label htmlFor="submitted-subject">What that one is called</label>
          <div className="help">The subject of the note to the team. The letter itself is a four-line digest.</div>
          <input
            id="submitted-subject"
            className="input"
            style={{ marginTop: 6 }}
            value={config.subjects.submitted}
            onChange={(e) => patch({ subjects: { ...config.subjects, submitted: e.target.value } })}
          />
          <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
            {APPLICATION_VARIABLES.filter((v) => v.name !== 'acces' && v.name !== 'lien').map((v) => (
              <button
                key={v.name}
                className="btn ghost sm"
                title={v.what}
                onClick={() =>
                  patch({ subjects: { ...config.subjects, submitted: `${config.subjects.submitted}{{${v.name}}}` } })
                }
              >
                <Icon name="plus" size={11} /> {v.label}
                <span className="faint" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{`{{${v.name}}}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
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

/**
 * La page de candidature telle qu'on la recevra, avant que personne ne la
 * reçoive.
 *
 * C'est la vraie page — même composant que celle où l'on candidate — montée
 * sur deux moitiés : son décor vient du serveur (le nom du programme, sa
 * couleur, les canaux qui amènent les candidats, qui ne s'éditent pas ici) et
 * ses questions viennent du brouillon, puisque c'est pendant qu'on les écrit
 * qu'on veut les relire.
 *
 * La porte est forcée ouverte : un formulaire encore fermé est précisément
 * celui qu'on veut voir. Et rien ne s'enregistre — ni réponse, ni candidature.
 */
function FormPreview({ block, config }: { block: Block; config: ApplicationConfig }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [ticked, setTicked] = useState<string[]>([]);
  const [heardFrom, setHeardFrom] = useState('');
  const [step, setStep] = useState(0);

  const context = useAsync(
    async () => (open ? api.get<PublicForm>(`/api/blocks/${block.id}/form-preview`) : null),
    `form-preview:${block.id}:${open}`,
  );

  if (!config.fields.length && !config.eligibility.criteria.length) return null;

  const start = () => {
    setStep(0);
    setValues({});
    setTicked([]);
    setOpen(true);
  };

  /* Le décor du serveur, les questions du brouillon. */
  const data: PublicForm | null = context.data && {
    ...context.data,
    intro: config.intro,
    eligibility: config.eligibility,
    layout: config.layout,
    pages: formPages(config).map(({ page, fields }) => ({ ...page, fields })),
    closesAt: config.closesAt || null,
    state: 'open',
  };
  const shape = data ? formShape(data, ticked) : null;
  const last = !shape?.paged || step === shape.steps.length - 1;

  return (
    <>
      <button className="btn sm" onClick={start}>
        <Icon name="eye" size={13} /> Preview
      </button>
      {open && (
        <Modal
          wide
          title="What they see"
          subtitle="The page as an applicant reads it, shown whether or not the call is open. Nothing here is saved — no answer, no application."
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
          {!data ? (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              {context.error ?? 'Loading…'}
            </p>
          ) : (
            <ApplyCard
              data={data}
              values={values}
              errors={{}}
              ticked={ticked}
              step={step}
              onAnswer={(id, v) => setValues((old) => ({ ...old, [id]: v }))}
              onTick={setTicked}
              heardFrom={heardFrom}
              onHeardFrom={setHeardFrom}
              /* Une société pour l'exemple : l'aperçu n'en candidate aucune. */
              applicant={
                <div className="rowcard link-row">
                  <span className="rec-mark">RT</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>Rafid Tech</strong>
                    <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                      An example — whoever applies sees their own page here.
                    </span>
                  </span>
                </div>
              }
              actions={
                <>
                  {shape?.paged && step > 0 && (
                    <button className="btn" onClick={() => setStep((n) => n - 1)}>
                      Back
                    </button>
                  )}
                  <div className="spacer" />
                  {last ? (
                    /* Jamais actif : l'aperçu ne dépose rien, et un bouton qui
                       ne fait rien sans le dire est pire que pas de bouton. */
                    <span className="btn off" title="Nothing is sent from a preview">
                      Send my application
                    </span>
                  ) : (
                    <button className="btn primary" onClick={() => setStep((n) => n + 1)}>
                      Continue <Icon name="arrowRight" size={14} />
                    </button>
                  )}
                </>
              }
            />
          )}
        </Modal>
      )}
    </>
  );
}
