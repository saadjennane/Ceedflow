/**
 * L'espace de test, côté CEED. Réservé aux administrateurs : c'est d'ici
 * qu'on fabrique des comptes et qu'on purge, et une purge ne se rattrape pas.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  TEST_ROLES,
  createTestPerson,
  createTestProgram,
  generateStartups,
  purgeSandbox,
  sandboxOverview,
  sendAccess,
} from '../services/sandbox.js';
import { requireWorkspaceAdmin, workspaceGuard } from './guard.js';
import { HttpError, parse } from './util.js';

export async function sandboxRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());
  app.addHook('preHandler', async (req) => {
    requireWorkspaceAdmin(req);
  });

  app.get('/api/sandbox', async () => sandboxOverview());

  app.post('/api/sandbox/startups', async (req, reply) => {
    const { count } = parse(z.object({ count: z.number().int().min(1).max(6).default(3) }), req.body ?? {});
    const staff = req.staff!;
    const made = await generateStartups({ accountId: staff.id, email: staff.email, recordId: staff.recordId }, count);
    reply.code(201);
    return made;
  });

  app.post('/api/sandbox/people', async (req, reply) => {
    const input = parse(
      z.object({
        email: z.string().email('A full address, with a “+”.'),
        firstName: z.string().min(1, 'A first name.'),
        lastName: z.string().default(''),
        role: z.enum(TEST_ROLES),
        orgId: z.string().nullable().default(null),
      }),
      req.body,
    );
    if (input.role === 'founder' && !input.orgId) {
      throw new HttpError(422, 'Pick the test startup they found.', { orgId: 'Pick a startup.' });
    }
    reply.code(201);
    return createTestPerson(input);
  });

  app.post('/api/sandbox/people/:id/access', async (req) => {
    await sendAccess((req.params as { id: string }).id);
    return { ok: true };
  });

  app.post('/api/sandbox/programs', async (req, reply) => {
    const input = parse(
      z.object({
        fromEditionId: z.string().nullable().default(null),
        name: z.string().default(''),
        startTomorrow: z.boolean().default(true),
      }),
      req.body,
    );
    reply.code(201);
    return createTestProgram(input.fromEditionId, input.name, input.startTomorrow);
  });

  app.post('/api/sandbox/purge', async (req) => {
    const { confirm } = parse(z.object({ confirm: z.string() }), req.body ?? {});
    if (confirm !== 'PURGER') throw new HttpError(422, 'Type PURGER to confirm.');
    return purgeSandbox();
  });
}
