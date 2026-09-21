import { canWriteWorkspace, isWorkspaceAdmin, type StaffRole } from '@ceed/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, accountForToken } from '../services/auth.js';
import { HttpError } from './util.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the workspace guard. Absent on public routes. */
    staff?: { id: string; email: string; recordId: string; role: StaffRole };
  }
}

/** Reading is a GET. Everything else changes something. */
const changes = (method: string) => method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

/**
 * The door to the CEED workspace. Registered as a hook on a whole route group
 * rather than repeated inside each handler: a rule that has to be remembered
 * once per route is a rule that will eventually be forgotten on one.
 *
 * `openTo` lets a group keep genuinely public routes — the application form and
 * the booking page are meant to be reachable by people who are not CEED.
 */
export function workspaceGuard(openTo?: (url: string) => boolean) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (openTo?.(req.routeOptions?.url ?? req.url)) return;

    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account?.staffRole) {
      // The same refusal whether there is no session or the session belongs to a
      // founder: this endpoint does not tell anyone who works at CEED.
      throw new HttpError(401, 'Sign in to the CEED workspace.');
    }
    if (account.mustChangePassword) {
      throw new HttpError(403, 'Choose your own password before going further.', { mustChangePassword: 'true' });
    }
    if (changes(req.method) && !canWriteWorkspace(account.staffRole)) {
      throw new HttpError(403, 'Your access to the workspace is read-only.');
    }
    req.staff = {
      id: account.id,
      email: account.email,
      recordId: account.recordId,
      role: account.staffRole,
    };
  };
}

/** For the handful of things only CEED's own administrators do. */
export function requireWorkspaceAdmin(req: FastifyRequest) {
  if (!req.staff) throw new HttpError(401, 'Sign in to the CEED workspace.');
  if (!isWorkspaceAdmin(req.staff.role)) {
    throw new HttpError(403, 'Only a CEED administrator can do that.');
  }
  return req.staff;
}
