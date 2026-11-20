/**
 * Le réseau CEED : les centres, et ce que CEED Global en voit.
 *
 * Two audiences. Anybody on a team asks where they may work (`/api/network/me`)
 * and reads or signs their own centre (`/api/center`). CEED Global alone
 * creates centres, names their administrators and reads the network whole.
 */
import { suggestPassword } from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as dir from '../db/directory.js';
import { accountOfRecord, createAccount, findAccount, setStaffRole } from '../services/auth.js';
import {
  createCenter,
  currentCenter,
  getCenter,
  listCenters,
  networkFigures,
  networkPrograms,
  staffOf,
  updateCenter,
  centersOfAccount,
} from '../services/centers.js';
import { requireWorkspaceAdmin, workspaceGuard } from './guard.js';
import { HttpError, notFound, parse } from './util.js';

/** CEED Global seulement. */
function requireGlobal(req: FastifyRequest) {
  if (!req.staff?.global) throw new HttpError(403, 'Only CEED Global can do that.');
  return req.staff;
}

const centerInput = z.object({
  name: z.string().trim().min(2, 'Name the centre.'),
  country: z.string().trim().default(''),
  city: z.string().trim().default(''),
  description: z.string().trim().max(2000).default(''),
});

const centerPatch = z.object({
  name: z.string().trim().min(2, 'Name the centre.').optional(),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  mailName: z.string().trim().max(80).optional(),
  replyTo: z.union([z.literal(''), z.string().trim().email('An email address.')]).optional(),
  logoUploadId: z.string().nullable().optional(),
});

/** Ce qu'un centre règle de lui-même : sa présentation et la signature de ses lettres. */
const ownPatch = centerPatch.pick({ description: true, mailName: true, replyTo: true, logoUploadId: true });

const adminInput = z.object({
  name: z.string().trim().min(2, 'Their name.'),
  email: z.string().trim().toLowerCase().email('An email address.'),
});

/**
 * Nommer l'administrateur d'un centre : un compte qui existe déjà le devient
 * (une seule identité dans le réseau), sinon une fiche et un compte naissent,
 * avec un mot de passe provisoire montré une fois.
 */
async function nameAdmin(centerId: string, input: z.infer<typeof adminInput>) {
  const existing = await findAccount(input.email);
  if (existing) {
    await setStaffRole(existing.id, 'admin', centerId);
    return { email: input.email, password: null as string | null };
  }
  const known = (await dir.findByEmail('person', input.email)) ?? null;
  if (known && (await accountOfRecord(known.id))) {
    throw new HttpError(422, `${known.name} already signs in with another address.`, { email: 'Use the address they sign in with.' });
  }
  const record =
    known ??
    (await dir.createRecord({ kind: 'person', name: input.name, emails: [input.email], roles: ['CEED team'], origin: 'manual', centerId }));
  const password = suggestPassword();
  const account = await createAccount({ email: input.email, password, recordId: record.id, mustChangePassword: true });
  await setStaffRole(account.id, 'admin', centerId);
  return { email: input.email, password };
}

export async function networkRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  /** Où l'on peut travailler, et où l'on travaille maintenant. */
  app.get('/api/network/me', async (req) => {
    const staff = req.staff!;
    const all = await listCenters();
    const mine = await centersOfAccount(staff.id);
    const reachable = staff.global ? all : all.filter((c) => mine.some((m) => m.centerId === c.id));
    return {
      global: staff.global,
      current: currentCenter(),
      centers: reachable.map((c) => ({
        id: c.id, name: c.name, country: c.country, city: c.city, status: c.status, logoUploadId: c.logoUploadId,
        role: staff.global ? 'admin' : (mine.find((m) => m.centerId === c.id)?.role ?? null),
      })),
    };
  });

  /* ---- Le centre où l'on travaille ---- */

  app.get('/api/center', async (_req, reply) => (await getCenter(currentCenter())) ?? notFound(reply, 'Centre not found.'));

  app.patch('/api/center', async (req) => {
    requireWorkspaceAdmin(req);
    return updateCenter(currentCenter(), parse(ownPatch, req.body));
  });

  /* ---- CEED Global ---- */

  app.get('/api/network/overview', async (req) => {
    requireGlobal(req);
    return networkFigures();
  });

  app.get('/api/network/programs', async (req) => {
    requireGlobal(req);
    return networkPrograms();
  });

  app.get('/api/centers', async (req) => {
    requireGlobal(req);
    return listCenters();
  });

  app.post('/api/centers', async (req, reply) => {
    requireGlobal(req);
    const body = (req.body ?? {}) as { admin?: unknown };
    const input = parse(centerInput, req.body);
    const admin = body.admin ? parse(adminInput, body.admin) : null;
    const taken = (await listCenters()).some((c) => c.name.trim().toLowerCase() === input.name.toLowerCase());
    if (taken) throw new HttpError(422, 'A centre already has this name.', { name: 'Already taken.' });
    const center = await createCenter(input);
    const invite = admin ? await nameAdmin(center.id, admin) : null;
    reply.code(201);
    return { center, invite };
  });

  app.patch('/api/centers/:id', async (req, reply) => {
    requireGlobal(req);
    const { id } = req.params as { id: string };
    if (!(await getCenter(id))) return notFound(reply, 'Centre not found.');
    return updateCenter(id, parse(centerPatch, req.body));
  });

  app.get('/api/centers/:id/staff', async (req, reply) => {
    requireGlobal(req);
    const { id } = req.params as { id: string };
    if (!(await getCenter(id))) return notFound(reply, 'Centre not found.');
    return staffOf(id);
  });

  app.post('/api/centers/:id/admins', async (req, reply) => {
    requireGlobal(req);
    const { id } = req.params as { id: string };
    if (!(await getCenter(id))) return notFound(reply, 'Centre not found.');
    const invite = await nameAdmin(id, parse(adminInput, req.body));
    reply.code(201);
    return { staff: await staffOf(id), invite };
  });
}
