import {
  staffMemberInput,
  staffRolePatch,
  suggestPassword,
  type StaffMember,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import * as dir from '../db/directory.js';
import {
  adminCount,
  createAccount,
  findAccount,
  listStaff,
  markInvited,
  reissueProvisionalPassword,
  setStaffRole,
} from '../services/auth.js';
import { requireWorkspaceAdmin, workspaceGuard } from './guard.js';
import { HttpError, notFound, parse } from './util.js';

/**
 * The CEED team itself. Same shape as the team on an organisation page, because
 * it is the same idea: a name is added, a right is granted, and a door is opened
 * separately.
 */
export async function staffRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  const resolve = async (): Promise<StaffMember[]> => {
    const rows = await listStaff();
    if (!rows.length) return [];
    const people = await dir.recordsByIds(rows.map((r) => r.recordId));
    return rows
      .map((r) => {
        const person = people.find((p) => p.id === r.recordId);
        return person
          ? {
              accountId: r.accountId,
              person,
              email: r.email,
              role: r.role,
              state: r.state,
              invitedAt: r.invitedAt,
              createdAt: r.createdAt,
            }
          : null;
      })
      .filter((m): m is StaffMember => m !== null);
  };

  /** Anybody in the workspace may see who else is in it. */
  app.get('/api/staff', async () => resolve());

  /**
   * Adding a colleague. The password is provisional by construction — whoever
   * typed this knows it — and comes back once, to be passed on until mail
   * routing exists to carry it.
   */
  app.post('/api/staff', async (req, reply) => {
    requireWorkspaceAdmin(req);
    const input = parse(staffMemberInput, req.body);
    const email = input.email.trim().toLowerCase();

    const existing = await findAccount(email);
    if (existing) {
      // Somebody CEED already knows — a mentor with an account, a founder who
      // joined the team — is promoted rather than duplicated.
      if (existing.staffRole) throw new HttpError(422, 'They are already on the CEED team.');
      await setStaffRole(existing.id, input.role);
      reply.code(200);
      return { team: await resolve(), invite: null, promoted: true };
    }

    const record =
      (await dir.findByEmail('person', email)) ??
      (await dir.createRecord({
        kind: 'person',
        name: input.name.trim(),
        email,
        roles: ['CEED team'],
        country: 'Morocco',
        origin: 'manual',
      }));

    const password = suggestPassword();
    const account = await createAccount({ email, password, recordId: record.id, mustChangePassword: true });
    await setStaffRole(account.id, input.role);
    reply.code(201);
    return { team: await resolve(), invite: { email, password }, promoted: false };
  });

  app.patch('/api/staff/:accountId', async (req) => {
    const admin = requireWorkspaceAdmin(req);
    const { accountId } = req.params as { accountId: string };
    const { role } = parse(staffRolePatch, req.body);
    const team = await listStaff();
    const member = team.find((m) => m.accountId === accountId);
    if (!member) throw new HttpError(404, 'Not on the CEED team.');

    // A workspace with no administrator can be administered by nobody, and no
    // route exists to put one back from outside.
    if (member.role === 'admin' && role !== 'admin' && (await adminCount()) <= 1) {
      throw new HttpError(422, 'Name another administrator first — CEED cannot be left without one.');
    }
    if (member.accountId === admin.id && role !== 'admin') {
      throw new HttpError(422, 'Ask another administrator to change your own role.');
    }
    await setStaffRole(accountId, role);
    return resolve();
  });

  /**
   * Taking somebody off the team. The account and the record stay: they may
   * still be a mentor, sit on a jury, or hold an organisation page. Only their
   * way into the workspace is withdrawn.
   */
  app.delete('/api/staff/:accountId', async (req, reply) => {
    const admin = requireWorkspaceAdmin(req);
    const { accountId } = req.params as { accountId: string };
    const member = (await listStaff()).find((m) => m.accountId === accountId);
    if (!member) return notFound(reply, 'Not on the CEED team.');
    if (member.accountId === admin.id) throw new HttpError(422, 'You cannot take yourself off the team.');
    if (member.role === 'admin' && (await adminCount()) <= 1) {
      throw new HttpError(422, 'Name another administrator first — CEED cannot be left without one.');
    }
    await setStaffRole(accountId, null);
    reply.code(204);
  });

  /** A new provisional password, for a colleague who never received theirs. */
  app.post('/api/staff/:accountId/invite', async (req, reply) => {
    requireWorkspaceAdmin(req);
    const { accountId } = req.params as { accountId: string };
    const member = (await listStaff()).find((m) => m.accountId === accountId);
    if (!member) return notFound(reply, 'Not on the CEED team.');
    if (member.state === 'claimed') {
      throw new HttpError(422, 'They chose their own password — nobody here can read or replace it.');
    }

    const password = suggestPassword();
    await reissueProvisionalPassword(accountId, password);
    await markInvited(accountId);
    reply.code(201);
    return { team: await resolve(), invite: { email: member.email, password } };
  });
}
