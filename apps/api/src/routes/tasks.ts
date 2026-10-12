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
import { createTaskInput, taskPatch } from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as dir from '../db/directory.js';
import { changeTask, createTasks, dropTask, getTask, listTasks } from '../services/tasks.js';
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

  app.post('/api/tasks', async (req, reply) => {
    const input = parse(createTaskInput, req.body);
    reply.code(201);
    return createTasks(input, await actor(req));
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(taskPatch, req.body);
    return (await changeTask(id, patch, await actor(req))) ?? notFound(reply, 'Task not found.');
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getTask(id))) return notFound(reply, 'Task not found.');
    await dropTask(id);
    reply.code(204);
  });
}
