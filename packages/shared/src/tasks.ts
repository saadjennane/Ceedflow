/**
 * Une tâche : qui fait quoi, d'ici quand.
 *
 * Le produit savait déjà dire ce qu'un fondateur doit déposer et ce qu'un juré
 * doit noter — des choses déduites du tunnel. Ceci est l'autre moitié : ce que
 * quelqu'un demande à quelqu'un, et qui n'est écrit nulle part ailleurs.
 *
 * Volontairement court. Pas de sous-tâches, pas de récurrence, pas de colonnes
 * à faire glisser : un intitulé, une échéance, un destinataire, une attache.
 * « En retard » n'est pas un état — c'est une date passée, et le déduire évite
 * qu'une tâche soit en retard dans la base et pas à l'écran.
 */
import { z } from 'zod';
import { accessBlock } from './blocks.js';

export const TASK_STATES = ['open', 'done', 'dropped'] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Ce à quoi une tâche se rapporte, quand elle se rapporte à quelque chose. */
export interface TaskAbout {
  recordId: string | null;
  editionId: string | null;
  blockId: string | null;
  candidateId: string | null;
}

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  detail: z.string().default(''),
  dueOn: z.string().nullable().default(null),
  state: z.enum(TASK_STATES).default('open'),
  /** La fiche qui doit s'en occuper : une personne, ou une organisation. */
  ownerId: z.string(),
  ownerName: z.string().default(''),
  ownerKind: z.enum(['person', 'org']).default('person'),
  recordId: z.string().nullable().default(null),
  editionId: z.string().nullable().default(null),
  blockId: z.string().nullable().default(null),
  candidateId: z.string().nullable().default(null),
  /** De quoi l'écrire en une ligne sans aller chercher ailleurs. */
  aboutName: z.string().default(''),
  createdByName: z.string().default(''),
  createdAt: z.string(),
  doneAt: z.string().nullable().default(null),
  doneByName: z.string().default(''),
  /** Quand la lettre qui l'annonce est partie. Null : personne n'a été prévenu. */
  toldAt: z.string().nullable().default(null),
});

export type Task = z.infer<typeof taskSchema>;

export const createTaskInput = z.object({
  title: z.string().min(1, 'Say what has to be done.'),
  detail: z.string().default(''),
  dueOn: z.string().nullable().default(null),
  /** Un destinataire par tâche. Plusieurs personnes, plusieurs tâches. */
  ownerIds: z.array(z.string()).min(1, 'Who is it for?'),
  recordId: z.string().nullable().default(null),
  editionId: z.string().nullable().default(null),
  blockId: z.string().nullable().default(null),
  candidateId: z.string().nullable().default(null),
  /**
   * Prévenir par mail, ou pas.
   *
   * Décidé à l'écran et non déduit : entre collègues qui ont l'application
   * ouverte, une lettre par tâche est du bruit ; pour un mentor qui s'y
   * connecte une fois par mois, c'est la seule façon de l'apprendre.
   */
  tell: z.boolean().default(true),
});

export const taskPatch = z.object({
  state: z.enum(TASK_STATES).optional(),
  title: z.string().min(1).optional(),
  detail: z.string().optional(),
  dueOn: z.string().nullable().optional(),
});

/**
 * En retard : une échéance passée, et rien de fait.
 *
 * Le jour même ne l'est pas — quelqu'un a jusqu'au soir, et une tâche qui
 * devient rouge au réveil du jour dit est une tâche qui a tort.
 */
export const isLate = (task: Pick<Task, 'dueOn' | 'state'>, today = new Date().toISOString().slice(0, 10)): boolean =>
  task.state === 'open' && Boolean(task.dueOn) && task.dueOn! < today;

/** Ce qui vient : aujourd'hui et les jours suivants, le plus proche d'abord. */
export const byDue = (a: Task, b: Task): number => {
  if (a.dueOn === b.dueOn) return a.createdAt.localeCompare(b.createdAt);
  if (!a.dueOn) return 1;
  if (!b.dueOn) return -1;
  return a.dueOn.localeCompare(b.dueOn);
};

/* ------------------------------------------------------------------ */
/* Le courrier des tâches                                              */
/* ------------------------------------------------------------------ */

/**
 * Les lettres qui n'appartiennent à aucune brique.
 *
 * Celles du tunnel sont écrites dans la config de leur étape, parce qu'une
 * demande de pièces appartient à cette due diligence de ce programme. Une
 * tâche n'est d'aucun programme : son courrier est celui de la maison, écrit
 * une fois pour tout l'espace, et ces deux clés sont tout ce qu'il contient.
 */
export const HOUSE_LETTERS = ['task_given', 'task_late'] as const;
export type HouseLetterKey = (typeof HOUSE_LETTERS)[number];

export const TASK_GIVEN_SUBJECT = 'Une tâche pour vous — {{tache}}';
export const TASK_LATE_SUBJECT = 'En retard — {{combien}}';

/**
 * Chaque variable tient sa ligne entière, ponctuation comprise.
 *
 * `fillTemplate` retire une ligne qui ne contient qu'une variable vide, avec
 * le blanc qui la suit. Une échéance écrite « pour le {{date}} » laisserait
 * donc « pour le » tout seul le jour où il n'y en a pas — alors qu'une ligne
 * qui est la phrase disparaît proprement.
 */
export const TASK_GIVEN_DEFAULT = `Bonjour {{prenom}},

{{donnepar}} vous a confié une tâche :

{{tache}}

{{detail}}

{{echeance}}

{{apropos}}

{{acces}}

Vous la retrouvez ici : {{lien}}`;

export const TASK_LATE_DEFAULT = `Bonjour {{prenom}},

Voici ce qui a dépassé son échéance, de votre côté :

{{taches}}

{{acces}}

Vous les retrouvez ici : {{lien}}`;

/** Ce qu'une lettre de tâche peut nommer. */
export const TASK_GIVEN_VARIABLES = [
  { name: 'prenom', label: 'First name', what: 'The first name of whoever this letter is addressed to', example: 'Karim' },
  { name: 'nom', label: 'Their name', what: 'The person or organisation the task is for', example: 'Karim Benali' },
  { name: 'tache', label: 'The task', what: 'What has to be done, as you wrote it', example: 'Relire la grille du jury' },
  { name: 'detail', label: 'Detail', what: 'What you added under it — empty when you added nothing', example: 'Les deux premiers critères ont changé depuis la dernière session.' },
  { name: 'echeance', label: 'By when', what: 'The whole sentence, and nothing at all when the task has no date', example: 'À faire pour le 15 novembre 2026.' },
  { name: 'apropos', label: 'About', what: 'What the task is attached to — empty when it hangs on nothing', example: 'À propos de : The Builders · Cohorte 1.' },
  { name: 'donnepar', label: 'Who asked', what: 'The colleague who gave the task', example: 'Rima Arrach' },
  { name: 'acces', label: 'First login', what: 'The password somebody with no account yet needs — empty for everybody who already signs in, and for an organisation', example: accessBlock('karim@rafid.ma', '••••-••••-••••') },
  { name: 'lien', label: 'Link', what: 'Where they read it on this platform', example: 'https://www.ceedflow.com/me' },
] as const;

/** Et ce qu'un rappel de retard peut nommer. */
export const TASK_LATE_VARIABLES = [
  { name: 'prenom', label: 'First name', what: 'The first name of whoever this letter is addressed to', example: 'Karim' },
  { name: 'nom', label: 'Their name', what: 'The person or organisation these tasks are for', example: 'Karim Benali' },
  {
    name: 'taches',
    label: 'What is late',
    what: 'Everything of theirs past its date, one per line',
    example: '  · Relire la grille du jury — pour le 3 octobre 2026\n  · Envoyer le RIB — pour le 7 octobre 2026',
  },
  { name: 'combien', label: 'How many', what: 'Counted and named, for the subject line', example: '2 tâches' },
  { name: 'acces', label: 'First login', what: 'The password somebody with no account yet needs — empty for everybody who already signs in, and for an organisation', example: accessBlock('karim@rafid.ma', '••••-••••-••••') },
  { name: 'lien', label: 'Link', what: 'Where they read them on this platform', example: 'https://www.ceedflow.com/me' },
] as const;

export const HOUSE_LETTER_DEFAULTS: Record<HouseLetterKey, { subject: string; body: string }> = {
  task_given: { subject: TASK_GIVEN_SUBJECT, body: TASK_GIVEN_DEFAULT },
  task_late: { subject: TASK_LATE_SUBJECT, body: TASK_LATE_DEFAULT },
};

export const houseLetterSchema = z.object({
  key: z.enum(HOUSE_LETTERS),
  subject: z.string(),
  body: z.string(),
  enabled: z.boolean(),
  updatedAt: z.string().nullable().default(null),
  updatedByName: z.string().default(''),
});
export type HouseLetter = z.infer<typeof houseLetterSchema>;

export const houseLetterPatch = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

/**
 * Au bout de combien de jours un retard se rappelle à nouveau.
 *
 * Tous les jours, une liste de retards devient du courrier qu'on filtre ;
 * jamais, et une tâche oubliée en octobre l'est encore en décembre. Une fois
 * par semaine est la cadence d'un rappel qu'on lit encore.
 */
export const LATE_AGAIN_AFTER_DAYS = 7;

/** « 1 tâche », « 3 tâches » — compté et nommé, pour une ligne d'objet. */
export const howMany = (n: number): string => `${n} tâche${n === 1 ? '' : 's'}`;
