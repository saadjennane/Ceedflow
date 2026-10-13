/**
 * Les tâches : qui les lit, qui les donne, qui les coche.
 *
 * Deux portes, et elles ne disent pas la même chose. Dans l'espace CEED, on
 * voit tout et on attribue. Dans l'espace des membres, on ne voit que les
 * siennes — et celles des sociétés dont on tient la page, parce qu'une tâche
 * confiée à une startup est vue par qui la tient.
 *
 * Personne d'autre que l'équipe CEED n'attribue : c'est la décision prise en
 * ouvrant le chantier, et elle tient en une ligne de garde plutôt qu'en un
 * système de droits.
 */
import { createTaskInput, createTaskItemInput, taskItemOrder, taskItemPatch, taskPatch } from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as dir from '../db/directory.js';
import { houseLetter } from '../services/houseLetters.js';
import { teamOf } from '../services/people.js';
import { tellOwner, whoHears } from '../services/taskNotices.js';
import {
  addItems, changeItem, changeTask, createTasks, dropItem, dropTask, getTask, listTasks, orderItems,
} from '../services/tasks.js';
import { workspaceGuard } from './guard.js';
import { notFound, parse } from './util.js';

/** Le collègue qui agit, tel qu'on l'inscrira sur la tâche. */
const actor = async (req: FastifyRequest) => {
  if (!req.staff) return null;
  const record = await dir.getRecord(req.staff.recordId);
  return { id: req.staff.id, name: record?.name?.trim() || req.staff.email };
};

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  app.get('/api/tasks', async (req) => {
    const { editionId, recordId, open } = req.query as Record<string, string | undefined>;
    return listTasks({ editionId, recordId, open: open !== 'all' });
  });

  /** Qui travaille sur cette édition, en quatre groupes. */
  app.get('/api/editions/:id/team', async (req) => {
    const { id } = req.params as { id: string };
    return teamOf(id);
  });

  /**
   * Qui entendra parler de cette tâche, avant qu'elle existe.
   *
   * Demandé par la fenêtre qui la donne, pour qu'elle nomme d'avance ceux
   * qu'on ne pourra pas prévenir. Une société sans adresse se rabat sur qui
   * tient sa page : le client ne peut pas le savoir seul, et deux règles —
   * une ici, une là-bas — seraient deux règles qui divergent.
   */
  app.post('/api/tasks/hearers', async (req) => {
    const { ownerIds } = (req.body ?? {}) as { ownerIds?: string[] };
    const letter = await houseLetter('task_given');
    const who = await Promise.all(
      [...new Set(ownerIds ?? [])].map(async (id) => ({ id, ...(await whoHears(id)) })),
    );
    return { on: letter.enabled, who };
  });

  app.post('/api/tasks', async (req, reply) => {
    const input = parse(createTaskInput, req.body);
    const made = await createTasks(input, await actor(req));
    /* La lettre après l'enregistrement, et jamais à sa place : une tâche
       confiée reste confiée même si le courrier ne part pas. */
    if (input.tell) for (const task of made) await tellOwner(task.id);
    reply.code(201);
    return Promise.all(made.map(async (t) => (await getTask(t.id)) ?? t));
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(taskPatch, req.body);
    return (await changeTask(id, patch, await actor(req))) ?? notFound(reply, 'Task not found.');
  });

  /* ---- La checklist : écrite ici, et seulement ici ---- */

  app.post('/api/tasks/:id/items', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getTask(id))) return notFound(reply, 'Task not found.');
    const { label } = parse(createTaskItemInput, req.body);
    const [item] = await addItems(id, [label]);
    reply.code(201);
    return item;
  });

  app.patch('/api/tasks/:id/items/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const patch = parse(taskItemPatch, req.body);
    return (await changeItem(id, itemId, patch, await actor(req))) ?? notFound(reply, 'Item not found.');
  });

  app.put('/api/tasks/:id/items/order', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getTask(id))) return notFound(reply, 'Task not found.');
    await orderItems(id, parse(taskItemOrder, req.body).ids);
    return getTask(id);
  });

  app.delete('/api/tasks/:id/items/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    if (!(await dropItem(id, itemId))) return notFound(reply, 'Item not found.');
    reply.code(204);
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getTask(id))) return notFound(reply, 'Task not found.');
    await dropTask(id);
    reply.code(204);
  });
}
