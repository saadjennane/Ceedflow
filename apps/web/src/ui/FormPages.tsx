/**
 * Les questions d'un formulaire, telles que celui qui le remplit les voit.
 *
 * Deux lecteurs : la page publique où l'on candidate, et l'aperçu du builder
 * où l'on relit ses questions avant de les publier. Un aperçu qui redessine le
 * formulaire à sa façon est un aperçu qui finit par mentir — sur l'ordre, sur
 * un libellé, sur ce qu'un champ obligatoire montre. D'où un seul rendu, ici,
 * et deux écrans qui l'appellent.
 *
 * Ce qui n'y est pas est délibéré : qui candidate, par quel canal il est
 * arrivé, et le bouton d'envoi appartiennent à l'acte de candidater, pas aux
 * questions.
 */
import { type FormField } from '@ceed/shared';
import { FormFieldInput } from './FormField';

export interface FormPageView {
  id: string;
  name: string;
  intro: string;
  fields: FormField[];
}

/** La barre d'étapes d'un formulaire en plusieurs pages. */
export function FormSteps({ names, step }: { names: string[]; step: number }) {
  return (
    <div className="steps">
      {names.map((name, i) => (
        <span className={i === step ? 'step on' : i < step ? 'step done' : 'step'} key={`${name}-${i}`}>
          <span className="step-n">{i + 1}</span>
          {name}
        </span>
      ))}
    </div>
  );
}

/** Une page de questions : sa consigne, puis ses champs dans l'ordre. */
export function FormPageBody({
  page,
  values,
  errors,
  onAnswer,
  /** Le nom de la page au-dessus, quand les pages sont nommées. */
  heading,
  notes,
}: {
  page: FormPageView;
  values: Record<string, unknown>;
  errors?: Record<string, string>;
  onAnswer: (fieldId: string, value: unknown) => void;
  heading?: boolean;
  /** Une ligne sous une question — « repris de votre fiche ». */
  notes?: Record<string, string>;
}) {
  return (
    <>
      {heading && page.name && <h3 className="section-title">{page.name}</h3>}
      {page.intro && (
        <p className="faint" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
          {page.intro}
        </p>
      )}
      {page.fields.map((field) => (
        <div key={field.id}>
          <FormFieldInput
            field={field}
            value={values[field.id]}
            onChange={(v) => onAnswer(field.id, v)}
            error={errors?.[`answers.${field.id}`]}
          />
          {notes?.[field.id] && (
            <div className="faint" style={{ fontSize: 11.5, marginTop: -6, marginBottom: 10 }}>
              {notes[field.id]}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
