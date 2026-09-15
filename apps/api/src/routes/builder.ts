import {
  createBlockInput,
  createPhaseInput,
  moveBlockInput,
  reorderInput,
  updateBlockInput,
  updatePhaseInput,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import * as repo from '../db/repo.js';
import { notFound, parse } from './util.js';

export async function builderRoutes(app: FastifyInstance) {
  app.post('/api/phases', async (req, reply) => {
    const input = parse(createPhaseInput, req.body);
    reply.code(201);
    return repo.createPhase(input.trackId, input.name);
  });

  app.patch('/api/phases/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(updatePhaseInput, req.body);
    return (await repo.updatePhase(id, patch)) ?? notFound(reply, 'Phase not found.');
  });

  app.delete('/api/phases/:id', async (req, reply) => {
    await repo.deletePhase((req.params as { id: string }).id);
    reply.code(204);
  });

  app.post('/api/tracks/:id/phase-order', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { ids } = parse(reorderInput, req.body);
    await repo.reorderPhases(id, ids);
    reply.code(204);
  });

  app.post('/api/blocks', async (req, reply) => {
    const input = parse(createBlockInput, req.body);
    reply.code(201);
    return repo.createBlock(input.phaseId, input.type, input.name, input.position);
  });

  app.get('/api/blocks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await repo.getBlock(id)) ?? notFound(reply, 'Block not found.');
  });

  app.patch('/api/blocks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(updateBlockInput, req.body);
    return (await repo.updateBlock(id, patch)) ?? notFound(reply, 'Block not found.');
  });

  app.delete('/api/blocks/:id', async (req, reply) => {
    await repo.deleteBlock((req.params as { id: string }).id);
    reply.code(204);
  });

  app.post('/api/blocks/:id/move', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(moveBlockInput, req.body);
    await repo.moveBlock(id, input.phaseId, input.position);
    reply.code(204);
  });
}
