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
import {
  createTaskInput, createTaskItemInput, taskAttachInput, taskItemOrder, taskItemPatch, taskPatch, taskStuckInput, taskSubmitInput,
  taskValidateInput,
} from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as dir from '../db/directory.js';
import { houseLetter } from '../services/houseLetters.js';
import { teamOf } from '../services/people.js';
import { tellOwner, tellWaiting, whoHears } from '../services/taskNotices.js';
import {
  addItems, attachToTask, changeItem, changeTask, createTasks, detachFromTask, dropItem, dropTask, getTask, listTasks, markStuck,
  orderItems, submitForValidation, taskAttachments, taskHistory, validateTask, waitingFor,
} from '../services/tasks.js';
import { workspaceGuard } from './guard.js';
import { HttpError, notFound, parse } from './util.js';

/** Le collègue qui agit, tel qu'on l'inscrira sur la tâche : sa fiche, et son nom. */
const actor = async (req: FastifyRequest) => {
  if (!req.staff) return null;
  const record = await dir.getRecord(req.staff.recordId);
  return { id: req.staff.recordId, name: record?.name?.trim() || req.staff.email };
};
const must = async (req: FastifyRequest) => {
  const who = await actor(req);
  if (!who) throw new HttpError(401, 'Sign in to the CEED workspace.');
  return who;
};

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  app.get('/api/tasks', async (req) => {
    const { editionId, programId, recordId, open } = req.query as Record<string, string | undefined>;
    return listTasks({ editionId, programId, recordId, open: open !== 'all' });
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
    const by = await actor(req);
    if (input.tell) for (const task of made) await tellOwner(task.id, by?.id ?? null);
    reply.code(201);
    return Promise.all(made.map(async (t) => (await getTask(t.id)) ?? t));
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(taskPatch, req.body);
    const by = await actor(req);
    /* Une tâche à valider ne se termine que par son valideur. */
    const before = await getTask(id);
    if (before?.state === 'to_validate' && patch.state === 'done' && before.validator?.id !== by?.id && req.staff?.role !== 'admin') {
      throw new HttpError(403, `${before.validator?.name || 'Its validator'} validates this task.`);
    }
    return (await changeTask(id, patch, by)) ?? notFound(reply, 'Task not found.');
  });

  /* ---- Bloquée, à valider, validée ---- */

  app.post('/api/tasks/:id/stuck', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(taskStuckInput, req.body);
    const by = await must(req);
    const task = await markStuck(id, input, by);
    if (!task) return notFound(reply, 'Task not found.');
    if (input.tell && input.unblockerId !== by.id) await tellWaiting(id, 'task_stuck', input.unblockerId, by.name);
    return task;
  });

  app.post('/api/tasks/:id/submit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(taskSubmitInput, req.body);
    const by = await must(req);
    const task = await submitForValidation(id, input, by);
    if (!task) return notFound(reply, 'Task not found.');
    if (input.tell && input.validatorId !== by.id) await tellWaiting(id, 'task_to_validate', input.validatorId, by.name);
    return task;
  });

  app.post('/api/tasks/:id/validate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const by = await must(req);
    return (await validateTask(id, parse(taskValidateInput, req.body), by, req.staff?.role === 'admin')) ?? notFound(reply, 'Task not found.');
  });

  /** Ce qui attend la personne connectée : débloquer, ou valider. */
  app.get('/api/tasks/waiting', async (req) => waitingFor((await must(req)).id));

  app.get('/api/tasks/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getTask(id))) return notFound(reply, 'Task not found.');
    return { events: await taskHistory(id), attachments: await taskAttachments(id) };
  });

  app.post('/api/tasks/:id/attachments', async (req) => {
    const { id } = req.params as { id: string };
    return attachToTask(id, parse(taskAttachInput, req.body).uploadId, await actor(req));
  });

  app.delete('/api/tasks/:id/attachments/:attachmentId', async (req) => {
    const { id, attachmentId } = req.params as { id: string; attachmentId: string };
    return detachFromTask(id, attachmentId, await actor(req));
  });

  /* ---- La checklist : écrite ici, et seulement ici ----
     Chaque route rend la tâche entière : cocher une ligne peut la faire
     passer « en cours », et l'écran doit le voir sans relire la liste. */

  app.post('/api/tasks/:id/items', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getTask(id))) return notFound(reply, 'Task not found.');
    const { label } = parse(createTaskItemInput, req.body);
    await addItems(id, [label]);
    reply.code(201);
    return getTask(id);
  });

  app.patch('/api/tasks/:id/items/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const patch = parse(taskItemPatch, req.body);
    if (!(await changeItem(id, itemId, patch, await actor(req)))) return notFound(reply, 'Item not found.');
    return getTask(id);
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
    return getTask(id);
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getTask(id))) return notFound(reply, 'Task not found.');
    await dropTask(id);
    reply.code(204);
  });
}
