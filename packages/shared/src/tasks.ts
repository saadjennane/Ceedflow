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
