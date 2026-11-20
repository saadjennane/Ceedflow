import { canWriteWorkspace, isWorkspaceAdmin, type StaffRole } from '@ceed/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, accountForToken } from '../services/auth.js';
import { DEFAULT_CENTER, assertInCenter, centersOfAccount, getCenter, inCenter, isGlobalAdmin } from '../services/centers.js';
import { HttpError } from './util.js';
import { one } from '../db/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the workspace guard. Absent on public routes. */
    staff?: {
      id: string;
      email: string;
      recordId: string;
      /** Son rôle dans le centre où il travaille maintenant. */
      role: StaffRole;
      /** Le centre où il travaille maintenant — celui que le sélecteur a choisi. */
      centerId: string;
      /** CEED Global : entre dans n'importe quel centre, en administrateur. */
      global: boolean;
      /** Son nom, tel que sa fiche le dit — pour signer ce qu'il ajoute. */
      name: string;
    };
  }
}

/** L'en-tête par lequel l'application dit dans quel centre on travaille. */
export const CENTER_HEADER = 'x-ceed-center';

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
  /* Le reste de la requête — la route et tout ce qu'elle appelle — tourne dans
     le centre résolu ici : `done` est appelé depuis l'intérieur de ce centre. */
  return (req: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
    if (openTo?.(req.routeOptions?.url ?? req.url)) return done();
    admit(req)
      .then((centerId) =>
        inCenter(centerId, () => assertInCenter(req, centerId).then(() => done(), done), {
          id: req.staff!.recordId,
          name: req.staff!.name,
        }),
      )
      .catch(done);
  };
}

/**
 * Qui entre, et dans quel centre : celui que l'application demande, sinon le
 * premier où l'on travaille. CEED Global entre partout, en administrateur ;
 * les autres, là où ils ont un rôle, avec ce rôle.
 */
async function admit(req: FastifyRequest): Promise<string> {
  const account = await accountForToken(req.cookies[SESSION_COOKIE]);
  if (!account?.staffRole) {
    // The same refusal whether there is no session or the session belongs to a
    // founder: this endpoint does not tell anyone who works at CEED.
    throw new HttpError(401, 'Sign in to the CEED workspace.');
  }
  if (account.mustChangePassword) {
    throw new HttpError(403, 'Choose your own password before going further.', { mustChangePassword: 'true' });
  }
  const global = await isGlobalAdmin(account.id);
  const mine = await centersOfAccount(account.id);
  const asked = String(req.headers[CENTER_HEADER] ?? '').trim();
  const centerId = asked || mine[0]?.centerId || DEFAULT_CENTER;
  const here = mine.find((m) => m.centerId === centerId);
  if (!global && !here) throw new HttpError(403, 'You do not work for this centre.');
  const center = await getCenter(centerId);
  if (!center) throw new HttpError(404, 'This centre does not exist.');
  if (center.status !== 'active' && !global) throw new HttpError(403, 'This centre is not active.');
  const role: StaffRole = global ? 'admin' : here!.role;

  if (changes(req.method) && !canWriteWorkspace(role)) {
    throw new HttpError(403, 'Your access to the workspace is read-only.');
  }
  const name = (await one<{ name: string }>('select name from records where id = $1', [account.recordId]))?.name?.trim() || account.email;
  req.staff = { id: account.id, email: account.email, recordId: account.recordId, role, centerId, global, name };
  return centerId;
}

/** For the handful of things only CEED's own administrators do. */
export function requireWorkspaceAdmin(req: FastifyRequest) {
  if (!req.staff) throw new HttpError(401, 'Sign in to the CEED workspace.');
  if (!isWorkspaceAdmin(req.staff.role)) {
    throw new HttpError(403, 'Only a CEED administrator can do that.');
  }
  return req.staff;
}
