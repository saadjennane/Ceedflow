import { z } from 'zod';

/**
 * Une adresse et un numéro, vérifiés avant d'être écrits.
 *
 * Les deux finissent par servir à joindre quelqu'un : une adresse fautive est
 * une lettre qui ne part pas — et personne ne le voit avant le jour où elle
 * comptait. Un numéro avec une lettre dedans est un appel qu'on ne passe pas.
 *
 * La règle vit ici, et nulle part ailleurs : l'écran la dit en écrivant, le
 * serveur la fait respecter en écrivant. Une règle recopiée est une règle qui
 * se met à diverger, et c'est l'écran qui finit par mentir.
 */

/**
 * Nom@domaine.extension.
 *
 * Volontairement plus simple que la vraie grammaire des adresses, qui autorise
 * des choses que personne ne tape : ce qu'on attrape ici, ce sont la virgule à
 * la place du point, l'espace au milieu, le domaine sans extension. Les points
 * et les tirets dans le nom passent — « contact.be.obg@gmail.com » est une
 * adresse de ce fichier.
 */
const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)*\.[A-Za-z]{2,}$/;

/**
 * Une suite de chiffres, lue comme les gens l'écrivent.
 *
 * « +212 6 12 34 56 78 » est un numéro, « 06.12.34.56.78 » aussi : ce sont des
 * chiffres, avec la ponctuation dont on se sert pour les lire. Ce qui est
 * refusé, c'est ce qui n'est pas un numéro — une lettre, une mention, deux
 * numéros collés. Entre six et quinze chiffres : l'indicatif le plus long du
 * monde tient dedans, et cinq chiffres ne joignent personne.
 */
const PUNCTUATION = /[\s.\-()/]/g;

export type ContactProblem = 'email' | 'phone' | '';

/** Ce qui cloche dans une adresse, ou rien. Vide passe : c'est « non renseigné ». */
export function emailProblem(value: unknown): ContactProblem {
  if (typeof value !== 'string') return '';
  const written = value.trim();
  if (!written) return '';
  return EMAIL.test(written) ? '' : 'email';
}

/** Ce qui cloche dans un numéro, ou rien. */
export function phoneProblem(value: unknown): ContactProblem {
  if (typeof value !== 'string') return '';
  const written = value.trim();
  if (!written) return '';
  const digits = written.replace(/^\+/, '').replace(PUNCTUATION, '');
  if (!/^[0-9]+$/.test(digits)) return 'phone';
  return digits.length >= 6 && digits.length <= 15 ? '' : 'phone';
}

/** La même question, posée à un champ de formulaire dont on connaît le type. */
export function contactProblem(type: string, value: unknown): ContactProblem {
  if (type === 'email') return emailProblem(value);
  if (type === 'phone') return phoneProblem(value);
  return '';
}

/**
 * Ce qu'on en dit, dans la langue de l'espace CEED.
 *
 * L'espace des membres a les siennes, dans son dictionnaire : c'est le même
 * code qui les choisit, et donc la même règle des deux côtés.
 */
export const CONTACT_SAYS: Record<Exclude<ContactProblem, ''>, string> = {
  email: 'An address is written name@domain.ma.',
  phone: 'A number is digits — 06 12 34 56 78, or +212 6 12 34 56 78.',
};

/* ------------------------------------------------------------------ */
/* Les deux champs, tels qu'un formulaire les reçoit                    */
/* ------------------------------------------------------------------ */

/** Une adresse, ou rien — « non renseigné » est une réponse. */
export const emailValue = () =>
  z
    .string()
    .default('')
    .refine((v) => !emailProblem(v), CONTACT_SAYS.email);

/** Un numéro, ou rien. */
export const phoneValue = () =>
  z
    .string()
    .default('')
    .refine((v) => !phoneProblem(v), CONTACT_SAYS.phone);

/**
 * Plusieurs numéros, et le premier est celui qu'on donne quand il n'y a de la
 * place que pour un.
 *
 * Les vides tombent : une ligne qu'on a ajoutée puis pas remplie n'est pas un
 * numéro, et la refuser ferait un message d'erreur pour un clic de trop.
 */
export const phoneList = () =>
  z
    .array(z.string())
    .default([])
    .transform((list) => list.map((n) => n.trim()).filter(Boolean))
    .refine((list) => list.every((n) => !phoneProblem(n)), CONTACT_SAYS.phone);

/** Un lieu : une ville, et le pays où elle est. */
export const placeList = () =>
  z
    .array(z.object({ city: z.string().default(''), country: z.string().default('') }))
    .default([])
    .transform((list) =>
      list
        .map((p) => ({ city: p.city.trim(), country: p.country.trim() }))
        .filter((p) => p.city || p.country),
    );
