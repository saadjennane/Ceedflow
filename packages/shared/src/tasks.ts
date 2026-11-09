/**
 * Une tâche : qui fait quoi, d'ici quand.
 *
 * Le produit savait déjà dire ce qu'un fondateur doit déposer et ce qu'un juré
 * doit noter — des choses déduites du tunnel. Ceci est l'autre moitié : ce que
 * quelqu'un demande à quelqu'un, et qui n'est écrit nulle part ailleurs.
 *
 * Volontairement court. Pas de sous-tâches, pas de récurrence : un intitulé,
 * une échéance, un destinataire, une attache — et où elle en est, pour qu'un
 * tableau puisse la ranger en colonnes.
 * « En retard » n'est pas un état — c'est une date passée, et le déduire évite
 * qu'une tâche soit en retard dans la base et pas à l'écran.
 */
import { z } from 'zod';
import { accessBlock } from './blocks.js';

export const TASK_STATES = ['open', 'doing', 'stuck', 'to_validate', 'done', 'dropped'] as const;
export type TaskState = (typeof TASK_STATES)[number];

/**
 * Ce qui reste à faire, où qu'on en soit.
 *
 * « En cours » et « bloquée » ne sont pas « faite » : elles comptent dans ce
 * qui est ouvert, et une échéance passée les met en retard comme les autres.
 */
export const OPEN_TASK_STATES = ['open', 'doing', 'stuck', 'to_validate'] as const satisfies readonly TaskState[];
export const isOpen = (task: Pick<Task, 'state'>): boolean =>
  (OPEN_TASK_STATES as readonly string[]).includes(task.state);

/** Les colonnes du tableau, dans l'ordre où une tâche les traverse. */
export const BOARD_COLUMNS: { state: TaskState; label: string }[] = [
  { state: 'open', label: 'To do' },
  { state: 'doing', label: 'In progress' },
  { state: 'stuck', label: 'Stuck' },
  { state: 'to_validate', label: 'To validate' },
  { state: 'done', label: 'Done' },
];

/** Trois niveaux, pour ranger : ce qui presse en haut. « Medium » par défaut. */
export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Ce à quoi une tâche se rapporte, quand elle se rapporte à quelque chose. */
export interface TaskAbout {
  recordId: string | null;
  editionId: string | null;
  blockId: string | null;
  candidateId: string | null;
}

/**
 * Une ligne de la checklist d'une tâche.
 *
 * Écrite par l'équipe CEED, cochée par qui doit faire la tâche. Pas d'échéance
 * ni de destinataire à elle : ce sont ceux de la tâche, sinon ce serait une
 * autre tâche.
 */
export const taskItemSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  position: z.number().int(),
  done: z.boolean(),
  doneAt: z.string().nullable().default(null),
  doneByName: z.string().default(''),
});
export type TaskItem = z.infer<typeof taskItemSchema>;

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  detail: z.string().default(''),
  dueOn: z.string().nullable().default(null),
  state: z.enum(TASK_STATES).default('open'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  /** L'owner principal — toujours quelqu'un de l'équipe CEED. */
  ownerId: z.string(),
  ownerName: z.string().default(''),
  ownerKind: z.enum(['person', 'org']).default('person'),
  recordId: z.string().nullable().default(null),
  editionId: z.string().nullable().default(null),
  blockId: z.string().nullable().default(null),
  candidateId: z.string().nullable().default(null),
  /** Tous les owners, de l'équipe CEED : une tâche partagée, terminée une fois pour tous. */
  owners: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  /** À qui la tâche est confiée hors de l'équipe : un mentor, une startup, une organisation. */
  delegate: z.object({ id: z.string(), name: z.string(), kind: z.enum(['person', 'org']) }).nullable().default(null),
  /** Le programme, à côté du sujet (startup, personne, organisation). */
  editionName: z.string().default(''),
  subjectName: z.string().default(''),
  stuckReason: z.string().default(''),
  unblocker: z.object({ id: z.string(), name: z.string() }).nullable().default(null),
  validator: z.object({ id: z.string(), name: z.string() }).nullable().default(null),
  validationNote: z.string().default(''),
  attachments: z.number().int().default(0),
  /** De quoi l'écrire en une ligne sans aller chercher ailleurs. */
  aboutName: z.string().default(''),
  /** Le genre de la fiche liée, quand c'est une fiche : une personne ou une organisation. */
  recordKind: z.enum(['person', 'org']).nullable().default(null),
  createdByName: z.string().default(''),
  createdAt: z.string(),
  doneAt: z.string().nullable().default(null),
  doneByName: z.string().default(''),
  /** Quand la lettre qui l'annonce est partie. Null : personne n'a été prévenu. */
  toldAt: z.string().nullable().default(null),
  /** La checklist, dans son ordre. Vide pour une tâche d'un seul geste. */
  items: z.array(taskItemSchema).default([]),
});

export type Task = z.infer<typeof taskSchema>;

/** Où en est la checklist : « 2/5 ». Rien à dire quand il n'y en a pas. */
export const progress = (task: Pick<Task, 'items'>): { done: number; total: number } => ({
  done: task.items.filter((i) => i.done).length,
  total: task.items.length,
});

export const createTaskInput = z.object({
  title: z.string().min(1, 'Say what has to be done.'),
  detail: z.string().default(''),
  dueOn: z.string().nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  /** Les owners, de l'équipe CEED — une seule tâche, partagée. */
  ownerIds: z.array(z.string()).min(1, 'Who owns it?'),
  /** Confiée à quelqu'un hors de l'équipe : un mentor, une startup, une organisation. */
  delegateId: z.string().nullable().default(null),
  recordId: z.string().nullable().default(null),
  editionId: z.string().nullable().default(null),
  blockId: z.string().nullable().default(null),
  candidateId: z.string().nullable().default(null),
  /**
   * La checklist, une ligne par sous-tâche.
   *
   * Recopiée sur chaque tâche quand il y a plusieurs destinataires : chacun
   * coche la sienne, comme chacun close la sienne.
   */
  items: z.array(z.string()).default([]),
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
  ownerIds: z.array(z.string()).min(1, 'A task keeps at least one owner.').optional(),
  delegateId: z.string().nullable().optional(),
  /** Le programme et le sujet, chacun facultatif. */
  about: z
    .object({ editionId: z.string().nullable(), subject: z.object({ kind: z.enum(['person', 'org', 'candidate']), id: z.string().min(1) }).nullable() })
    .optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  title: z.string().min(1).optional(),
  detail: z.string().optional(),
  dueOn: z.string().nullable().optional(),
});

export const createTaskItemInput = z.object({
  label: z.string().trim().min(1, 'Say what has to be done.'),
});

export const taskItemPatch = z.object({
  label: z.string().trim().min(1).optional(),
  done: z.boolean().optional(),
});

export const taskItemOrder = z.object({ ids: z.array(z.string()).min(1) });

/**
 * En retard : une échéance passée, et rien de fait.
 *
 * Le jour même ne l'est pas — quelqu'un a jusqu'au soir, et une tâche qui
 * devient rouge au réveil du jour dit est une tâche qui a tort.
 */
export const isLate = (task: Pick<Task, 'dueOn' | 'state'>, today = new Date().toISOString().slice(0, 10)): boolean =>
  isOpen(task) && Boolean(task.dueOn) && task.dueOn! < today;

/** Ce qui vient : aujourd'hui et les jours suivants, le plus proche d'abord. */
/** Le plus pressant d'abord : la priorité, puis l'échéance. */
export const byUrgency = (a: Task, b: Task): number =>
  PRIORITY_RANK[a.priority ?? 'medium'] - PRIORITY_RANK[b.priority ?? 'medium'] || byDue(a, b);

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
export const HOUSE_LETTERS = ['task_given', 'tasks_given', 'task_late', 'task_stuck', 'task_to_validate'] as const;
export type HouseLetterKey = (typeof HOUSE_LETTERS)[number];

export const TASK_GIVEN_SUBJECT = 'Une tâche pour vous — {{tache}}';
export const TASK_LATE_SUBJECT = 'En retard — {{combien}}';
export const TASKS_GIVEN_SUBJECT = '{{combien}} pour vous — {{reunion}}';

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

{{checklist}}

{{echeance}}

{{apropos}}

{{acces}}

Vous la retrouvez ici : {{lien}}`;

/** Plusieurs tâches d'un coup — celles d'une même réunion : une lettre par personne, pas une par tâche. */
export const TASKS_GIVEN_DEFAULT = `Bonjour {{prenom}},

Suite à la réunion « {{reunion}} », {{donnepar}} vous a confié :

{{taches}}

{{acces}}

Vous les retrouvez ici : {{lien}}`;

export const TASK_LATE_DEFAULT = `Bonjour {{prenom}},

Voici ce qui a dépassé son échéance, de votre côté :

{{taches}}

{{acces}}

Vous les retrouvez ici : {{lien}}`;

/** Ce qu'une lettre de tâche peut nommer. */
export const TASK_GIVEN_VARIABLES = [
  { name: 'prenom', label: 'First name', what: 'The first name of whoever this letter is addressed to', example: 'Prénom' },
  { name: 'nom', label: 'Their name', what: 'The person or organisation the task is for', example: 'Prénom Nom' },
  { name: 'tache', label: 'The task', what: 'What has to be done, as you wrote it', example: 'Relire la grille du jury' },
  { name: 'detail', label: 'Detail', what: 'What you added under it — empty when you added nothing', example: 'Les deux premiers critères ont changé depuis la dernière session.' },
  {
    name: 'checklist',
    label: 'Checklist',
    what: 'The lines to tick, one per line — empty when the task has none',
    example: '  · Relire la grille\n  · Réserver la salle',
  },
  { name: 'echeance', label: 'By when', what: 'The whole sentence, and nothing at all when the task has no date', example: 'À faire pour le 15 novembre 2026.' },
  { name: 'apropos', label: 'About', what: 'What the task is attached to — empty when it hangs on nothing', example: 'À propos de : The Builders · Cohorte 1.' },
  { name: 'donnepar', label: 'Who asked', what: 'The colleague who gave the task', example: 'Prénom Nom' },
  { name: 'acces', label: 'First login (email + password)', what: 'The password somebody with no account yet needs — empty for everybody who already signs in, and for an organisation', example: accessBlock('prenom@startup-exemple.ma', '••••-••••-••••') },
  { name: 'lien', label: 'Link to their tasks', what: 'Where they read it on this platform', example: 'https://www.ceedflow.com/me' },
] as const;

/** Ce que la lettre qui annonce plusieurs tâches peut nommer. */
export const TASKS_GIVEN_VARIABLES = [
  { name: 'prenom', label: 'First name', what: 'The first name of whoever this letter is addressed to', example: 'Prénom' },
  { name: 'nom', label: 'Their name', what: 'The person these tasks are for', example: 'Prénom Nom' },
  {
    name: 'taches',
    label: 'The tasks',
    what: 'Each of their tasks, one per line, with its priority and date',
    example: '  · Préparer le budget prévisionnel — priorité haute — pour le 20 novembre 2026\n  · Contacter les mentors',
  },
  { name: 'combien', label: 'How many', what: 'Counted and named, for the subject line', example: '2 tâches' },
  { name: 'reunion', label: 'The meeting', what: 'The title of the meeting they come from', example: 'Réunion de coordination The Builders' },
  { name: 'donnepar', label: 'Who asked', what: 'The colleague who created them', example: 'Prénom Nom' },
  { name: 'acces', label: 'First login (email + password)', what: 'The password somebody with no account yet needs — empty for everybody who already signs in', example: accessBlock('prenom@startup-exemple.ma', '••••-••••-••••') },
  { name: 'lien', label: 'Link to their tasks', what: 'Where they read them on this platform', example: 'https://www.ceedflow.com/tasks' },
] as const;

/** Et ce qu'un rappel de retard peut nommer. */
export const TASK_LATE_VARIABLES = [
  { name: 'prenom', label: 'First name', what: 'The first name of whoever this letter is addressed to', example: 'Prénom' },
  { name: 'nom', label: 'Their name', what: 'The person or organisation these tasks are for', example: 'Prénom Nom' },
  {
    name: 'taches',
    label: 'What is late',
    what: 'Everything of theirs past its date, one per line',
    example: '  · Relire la grille du jury — pour le 3 octobre 2026\n  · Envoyer le RIB — pour le 7 octobre 2026',
  },
  { name: 'combien', label: 'How many', what: 'Counted and named, for the subject line', example: '2 tâches' },
  { name: 'acces', label: 'First login (email + password)', what: 'The password somebody with no account yet needs — empty for everybody who already signs in, and for an organisation', example: accessBlock('prenom@startup-exemple.ma', '••••-••••-••••') },
  { name: 'lien', label: 'Link to their tasks', what: 'Where they read them on this platform', example: 'https://www.ceedflow.com/me' },
] as const;

export const HOUSE_LETTER_DEFAULTS: Record<HouseLetterKey, { subject: string; body: string }> = {
  task_given: { subject: TASK_GIVEN_SUBJECT, body: TASK_GIVEN_DEFAULT },
  tasks_given: { subject: TASKS_GIVEN_SUBJECT, body: TASKS_GIVEN_DEFAULT },
  task_late: { subject: TASK_LATE_SUBJECT, body: TASK_LATE_DEFAULT },
  task_stuck: {
    subject: 'Une tâche est bloquée — {{tache}}',
    body: `Bonjour {{prenom}},\n\n{{par}} est bloqué(e) sur une tâche et vous désigne pour la débloquer :\n\n{{tache}}\n\n{{raison}}\n\nVous la retrouvez ici : {{lien}}`,
  },
  task_to_validate: {
    subject: 'À valider — {{tache}}',
    body: `Bonjour {{prenom}},\n\n{{par}} vous demande de valider une tâche :\n\n{{tache}}\n\n{{raison}}\n\nVous la validez ici : {{lien}}`,
  },
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

/** Bloquée : pourquoi, et qui peut débloquer. */
export const taskStuckInput = z.object({
  reason: z.string().trim().min(1, 'Say what blocks it.').max(2000),
  unblockerId: z.string().min(1, 'Who can unblock it?'),
  tell: z.boolean().default(true),
});

/** À valider : un mot éventuel, et qui valide. */
export const taskSubmitInput = z.object({
  note: z.string().trim().max(2000).default(''),
  validatorId: z.string().min(1, 'Who validates it?'),
  tell: z.boolean().default(true),
});

/** Le valideur : valider (la tâche est faite) ou renvoyer (elle reprend). */
export const taskValidateInput = z.object({
  action: z.enum(['approve', 'send_back']),
  note: z.string().trim().max(2000).default(''),
});

export const taskAttachInput = z.object({ uploadId: z.string().min(1) });

/** Ce qui arrive à une tâche, dans l'ordre : qui, quoi, quand. */
export interface TaskEvent {
  id: string;
  kind: string;
  actorName: string;
  note: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  uploadId: string;
  filename: string;
  mime: string;
  size: number;
  addedByName: string;
  createdAt: string;
}

export const TASK_EVENT_WORD: Record<string, string> = {
  created: 'Created',
  owners: 'Owners changed',
  delegated: 'Entrusted',
  undelegated: 'No longer entrusted',
  state: 'Moved',
  stuck: 'Stuck',
  submitted: 'Sent for validation',
  validated: 'Validated',
  sent_back: 'Sent back',
  about: 'Link changed',
  attached: 'File attached',
  detached: 'File removed',
  edited: 'Edited',
  priority: 'Priority changed',
  due: 'Due date changed',
};

/** Ce que les lettres « bloquée » et « à valider » peuvent nommer. */
export const TASK_WAITING_VARIABLES = [
  { name: 'prenom', label: 'First name', what: 'The first name of the colleague asked', example: 'Prénom' },
  { name: 'tache', label: 'The task', what: 'Its title', example: 'Préparer le budget' },
  { name: 'par', label: 'Who asks', what: 'The colleague who asks', example: 'Prénom Nom' },
  { name: 'raison', label: 'Their words', what: 'What blocks it, or the note for the validator — empty when none', example: 'Il manque les chiffres de 2025.' },
  { name: 'lien', label: 'Link to the task', what: 'Where they open it', example: 'https://www.ceedflow.com/tasks?task=…' },
] as const;

/** Qui est sur une tâche, en une ligne : ses owners, et à qui elle est confiée. */
export const taskPeople = (t: Pick<Task, 'owners' | 'ownerName' | 'delegate'>): string =>
  [(t.owners?.length ? t.owners.map((o) => o.name).join(', ') : t.ownerName), t.delegate ? `→ ${t.delegate.name}` : ''].filter(Boolean).join(' ');

/** Qui la fait : celui à qui elle est confiée, sinon son owner principal. */
export const taskDoer = (t: Pick<Task, 'ownerId' | 'ownerName' | 'delegate'>): { id: string; name: string } =>
  t.delegate ? { id: t.delegate.id, name: t.delegate.name } : { id: t.ownerId, name: t.ownerName };
