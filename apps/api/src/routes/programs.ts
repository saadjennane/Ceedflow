import {
  createEditionInput,
  createProgramInput,
  updateEditionInput,
  updateProgramInput,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import * as repo from '../db/repo.js';
import { notFound, parse } from './util.js';
import { workspaceGuard } from './guard.js';
import { currentCenter } from '../services/centers.js';
import { distributionOf, setDistribution } from '../services/distribution.js';
import { z } from 'zod';

export async function programRoutes(app: FastifyInstance) {
  // Everything below is the CEED workspace. Public routes name themselves.
  app.addHook('preHandler', workspaceGuard());

  /* Où ce programme est proposé dans le réseau, et ce que chaque centre a répondu. */
  app.get('/api/programs/:id/distribution', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await distributionOf(id)) ?? notFound(reply, 'Programme not found.');
  });

  app.put('/api/programs/:id/distribution', async (req) => {
    const { id } = req.params as { id: string };
    const input = parse(
      z.object({ visibility: z.enum(['center', 'selected', 'all']), centerIds: z.array(z.string()).default([]) }),
      req.body,
    );
    return setDistribution(id, input, req.staff!.email);
  });

  /* Ceux qu'organise le centre où l'on travaille. */
  app.get('/api/programs', async () => repo.listPrograms({ center: currentCenter() }));

  app.get('/api/programs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await repo.getProgram(id)) ?? notFound(reply, 'Programme not found.');
  });

  app.post('/api/programs', async (req, reply) => {
    const input = parse(createProgramInput, req.body);
    reply.code(201);
    return repo.createProgram(input);
  });

  app.patch('/api/programs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(updateProgramInput, req.body);
    return (await repo.updateProgram(id, patch)) ?? notFound(reply, 'Programme not found.');
  });

  app.delete('/api/programs/:id', async (req, reply) => {
    await repo.deleteProgram((req.params as { id: string }).id, req.staff?.email ?? '');
    reply.code(204);
  });

  app.post('/api/programs/:id/editions', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await repo.getProgram(id))) return notFound(reply, 'Programme not found.');
    const input = parse(createEditionInput, req.body);
    reply.code(201);
    return repo.createEdition(id, input);
  });

  app.get('/api/editions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await repo.getEditionDetail(id)) ?? notFound(reply, 'Edition not found.');
  });

  app.patch('/api/editions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(updateEditionInput, req.body);
    return (await repo.updateEdition(id, patch)) ?? notFound(reply, 'Edition not found.');
  });

  app.delete('/api/editions/:id', async (req, reply) => {
    await repo.deleteEdition((req.params as { id: string }).id, req.staff?.email ?? '');
    reply.code(204);
  });

  app.post('/api/editions/:id/tracks', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = (req.body ?? {}) as { name?: string };
    reply.code(201);
    return repo.createTrack(id, name?.trim() || 'New track');
  });

  app.patch('/api/tracks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = (req.body ?? {}) as { name?: string };
    if (name?.trim()) await repo.renameTrack(id, name.trim());
    reply.code(204);
  });

  app.delete('/api/tracks/:id', async (req, reply) => {
    await repo.deleteTrack((req.params as { id: string }).id);
    reply.code(204);
  });
}
