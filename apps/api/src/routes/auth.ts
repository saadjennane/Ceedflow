import {
  fullName,
  loginInput,
  myOrgInput,
  profileInput,
  signupAccountInput,
  type Me,
} from '@ceed/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as dir from '../db/directory.js';
import {
  SESSION_COOKIE,
  accountForToken,
  createAccount,
  createSession,
  endSession,
  findAccount,
  verifyPassword,
} from '../services/auth.js';
import { HttpError, notFound, parse } from './util.js';

/** Sets the session cookie. Same-origin through the dev proxy, so httpOnly works. */
function setSession(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Everything the member space needs about whoever is signed in. */
async function meFor(account: { id: string; email: string; recordId: string }): Promise<Me> {
  const record = await dir.getRecord(account.recordId);
  if (!record) throw new HttpError(401, 'This account has no profile.');
  return {
    account: { id: account.id, email: account.email },
    record,
    organisations: await dir.linksOf(record),
  };
}

export async function authRoutes(app: FastifyInstance) {
  /** Reads the signed-in account, or refuses. */
  const require = async (req: FastifyRequest) => {
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) throw new HttpError(401, 'Sign in to continue.');
    return account;
  };

  /* ---- Creating an account ---- */

  app.post('/api/auth/signup', async (req, reply) => {
    const input = parse(signupAccountInput, req.body);
    if (await findAccount(input.email)) {
      throw new HttpError(422, 'An account already uses this email.', { email: 'Already taken — sign in instead.' });
    }

    const name = fullName(input.firstName, input.lastName);
    // Somebody CEED already typed in becomes the account's profile rather than a
    // second copy of the same person.
    const existing = await dir.findByName('person', name);
    const record =
      existing ??
      (await dir.createRecord({
        kind: 'person',
        name,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        country: 'Morocco',
        origin: 'signup',
      }));
    if (existing) {
      await dir.updateRecord(existing.id, {
        firstName: existing.firstName || input.firstName,
        lastName: existing.lastName || input.lastName,
        email: existing.email || input.email,
      });
    }

    const account = await createAccount({ email: input.email, password: input.password, recordId: record.id });
    const { token, expiresAt } = await createSession(account.id);
    setSession(reply, token, expiresAt);
    reply.code(201);
    return meFor({ ...account, recordId: record.id });
  });

  /* ---- Signing in ---- */

  app.post('/api/auth/login', async (req, reply) => {
    const input = parse(loginInput, req.body);
    const account = await findAccount(input.email);
    // The same refusal whether the email is unknown or the password is wrong:
    // otherwise this endpoint tells anyone who has an account here.
    const ok = account && (await verifyPassword(input.password, account.passwordHash));
    if (!account || !ok) throw new HttpError(401, 'Email or password is wrong.');

    const { token, expiresAt } = await createSession(account.id);
    setSession(reply, token, expiresAt);
    return meFor(account);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await endSession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(204);
  });

  app.get('/api/auth/me', async (req, reply) => {
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) return reply.code(401).send({ error: 'Not signed in.' });
    return meFor(account);
  });

  /* ---- The profile is the directory record ---- */

  app.patch('/api/me', async (req) => {
    const account = await require(req);
    const input = parse(profileInput, req.body);
    await dir.updateRecord(account.recordId, {
      ...input,
      name: fullName(input.firstName, input.lastName),
    });
    return meFor(account);
  });

  /* ---- Organisation pages, created by their own people ---- */

  app.post('/api/me/organisations', async (req, reply) => {
    const account = await require(req);
    const input = parse(myOrgInput, req.body);

    // An organisation CEED already knows gains a contact rather than a twin.
    const found = await dir.findByName('org', input.name);
    const org =
      found ??
      (await dir.createRecord({
        kind: 'org',
        name: input.name,
        roles: input.roles,
        email: input.email,
        phone: input.phone,
        city: input.city,
        country: input.country,
        website: input.website,
        bio: input.bio,
        origin: 'signup',
      }));
    if (found) {
      await dir.updateRecord(found.id, {
        email: found.email || input.email,
        phone: found.phone || input.phone,
        city: found.city || input.city,
        website: found.website || input.website,
        bio: found.bio || input.bio,
      });
    }

    await dir.linkRecords({ personId: account.recordId, orgId: org.id, role: input.myRole });
    reply.code(201);
    return { organisation: org, joined: Boolean(found) };
  });

  app.patch('/api/me/organisations/:id', async (req, reply) => {
    const account = await require(req);
    const { id } = req.params as { id: string };
    const record = await dir.getRecord(account.recordId);
    if (!record) return notFound(reply, 'Profile not found.');
    // You may edit an organisation you belong to, and only that one.
    const mine = (await dir.linksOf(record)).some((l) => l.record.id === id);
    if (!mine) throw new HttpError(403, 'You are not attached to that organisation.');
    return dir.updateRecord(id, parse(myOrgInput.omit({ myRole: true }).partial(), req.body));
  });
}
