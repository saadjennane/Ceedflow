/**
 * La page de candidature, telle qu'elle se présente.
 *
 * Deux écrans la dessinent : celui où l'on candidate pour de vrai, et l'aperçu
 * du builder où l'on se relit. Un aperçu qui redessine la page à sa façon finit
 * par mentir — sur l'ordre des questions, sur un libellé, sur ce qu'une liste
 * de critères annonce — c'est-à-dire exactement sur ce qu'on venait vérifier.
 * D'où une seule page, ici, et deux appelants.
 *
 * Ce qui change entre eux ne tient qu'à deux endroits, passés en morceaux :
 * qui candidate, et les boutons du bas. Le reste est la même page.
 */
import { type Eligibility, type FormField } from '@ceed/shared';
import { type ReactNode } from 'react';
import { formatDate } from '../lib/format';
import { FormPageBody, FormSteps } from './FormPages';
import { Icon } from './Icon';

export interface PublicPage {
  id: string;
  name: string;
  intro: string;
  fields: FormField[];
}

export interface PublicForm {
  programName: string;
  editionName: string;
  colour: string;
  blockName: string;
  intro: string;
  eligibility: Eligibility;
  channels: { id: string; label: string }[];
  layout: 'single' | 'paged';
  pages: PublicPage[];
  opensAt: string | null;
  closesAt: string | null;
  /** What a latecomer is told, when the team wrote something. */
  closedMessage: string;
  state: 'open' | 'closed' | 'not_open';
}

/**
 * Ce que le formulaire déduit de lui-même.
 *
 * Lu par la page — qui en a besoin pour savoir si le bouton d'envoi est permis
 * et où s'arrête la dernière étape — et par l'aperçu, pour se promener dedans.
 * Deux calculs séparés, c'est une barre d'étapes qui compte autrement que les
 * pages qu'elle annonce.
 */
export function formShape(data: PublicForm, ticked: string[]) {
  const gate = data.eligibility.mode === 'gate';
  const allTicked = data.eligibility.criteria.every((c) => ticked.includes(c.id));
  const paged = data.layout === 'paged' && data.pages.length > 0;
  return {
    gate,
    blockedByGate: gate && !allTicked,
    hasEligibility: data.eligibility.criteria.length > 0,
    paged,
    // Step 0 is who is applying, plus the eligibility list when there is one.
    steps: paged ? ['Before you start', ...data.pages.map((p) => p.name)] : [],
  };
}

export function ApplyCard({
  data,
  values,
  errors,
  ticked,
  step,
  onAnswer,
  onTick,
  heardFrom,
  onHeardFrom,
  /** La carte « qui candidate » : la vraie société, ou un exemple en aperçu. */
  applicant,
  /** La rangée du bas : envoyer, continuer, fermer. */
  actions,
}: {
  data: PublicForm;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  ticked: string[];
  step: number;
  onAnswer: (fieldId: string, value: unknown) => void;
  onTick: (ids: string[]) => void;
  heardFrom: string;
  /** Absent quand le lien a déjà répondu, ou quand on ne fait que relire. */
  onHeardFrom?: (id: string) => void;
  applicant: ReactNode;
  actions: ReactNode;
}) {
  const { gate, blockedByGate, hasEligibility, paged, steps } = formShape(data, ticked);
  const currentPage = paged ? (step === 0 ? null : data.pages[step - 1]) : null;

  const start = (
    <>
      <h3 className="section-title">Who is applying</h3>
      {applicant}

      {/* A tagged link already answered this. Only the bare one has to ask. */}
      {onHeardFrom && data.channels.length > 0 && (
        <div className="field">
          <label>How did you hear about {data.programName}?</label>
          <div className="pick-list">
            {data.channels.map((channel) => (
              <button
                type="button"
                key={channel.id}
                className={heardFrom === channel.id ? 'pick on' : 'pick'}
                onClick={() => onHeardFrom(heardFrom === channel.id ? '' : channel.id)}
              >
                <Icon name={heardFrom === channel.id ? 'check' : 'square'} />
                <div>
                  <strong>{channel.label}</strong>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasEligibility && (
        <>
          <h3 className="section-title">Before you start</h3>
          <p className="faint" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            {gate
              ? 'Every line has to be true to apply to this call.'
              : 'What this call is looking for. Tick what applies to you.'}
          </p>
          <div className="rows">
            {data.eligibility.criteria.map((c) => (
              <label className="check rowcard" style={{ padding: '10px 12px' }} key={c.id}>
                <input
                  type="checkbox"
                  checked={ticked.includes(c.id)}
                  onChange={(e) => onTick(e.target.checked ? [...ticked, c.id] : ticked.filter((x) => x !== c.id))}
                />
                <span style={{ fontSize: 13 }}>{c.label}</span>
              </label>
            ))}
          </div>
          {blockedByGate && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              This call is only open to organisations that meet every criterion above.
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={{ background: `linear-gradient(90deg, ${data.colour}, ${data.colour}55)` }} />
        <div className="public-body">
          <div className="eyebrow">{data.editionName}</div>
          <h1>{data.programName}</h1>
          {data.intro && <p className="public-intro">{data.intro}</p>}

          {data.closesAt && (
            <span className="badge warn">
              <Icon name="clock" size={13} /> Closes {formatDate(data.closesAt)}
            </span>
          )}

          {paged && <FormSteps names={steps} step={step} />}

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> {errors._}
            </div>
          )}

          {paged ? (
            step === 0 ? (
              start
            ) : (
              <FormPageBody heading page={currentPage!} values={values} errors={errors} onAnswer={onAnswer} />
            )
          ) : (
            <>
              {start}
              {data.pages.map((page) => (
                <div key={page.id}>
                  <FormPageBody page={page} values={values} errors={errors} onAnswer={onAnswer} />
                </div>
              ))}
            </>
          )}

          <div className="row" style={{ marginTop: 16 }}>{actions}</div>
        </div>
      </div>
    </div>
  );
}
