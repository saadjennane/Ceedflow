import { idOf, type Account } from '@ceed/shared';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '../db/client.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const KEY_LENGTH = 64;
/** Long enough that nobody has to sign in twice a day, short enough to expire. */
const SESSION_DAYS = 30;

/* ------------------------------------------------------------------ */
/* Passwords                                                           */
/* ------------------------------------------------------------------ */

/** scrypt with a per-password salt, stored as `salt:hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Compared in constant time, so a wrong password reveals nothing by timing. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/** Only the hash is stored: a database read is not enough to impersonate. */
const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(accountId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await (await db()).query(
    'insert into sessions (token_hash, account_id, expires_at) values ($1,$2,$3)',
    [fingerprint(token), accountId, expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

export async function accountForToken(token: string | undefined): Promise<(Account & { recordId: string }) | null> {
  if (!token) return null;
  const rows = await (
    await db()
  ).query<{ id: string; email: string; recordId: string }>(
    `select a.id, a.email, a.record_id as "recordId"
       from sessions s join accounts a on a.id = s.account_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [fingerprint(token)],
  );
  return rows[0] ?? null;
}

export async function endSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await (await db()).query('delete from sessions where token_hash = $1', [fingerprint(token)]);
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

const normalise = (email: string) => email.trim().toLowerCase();

export async function findAccount(email: string) {
  const rows = await (
    await db()
  ).query<{ id: string; email: string; recordId: string; passwordHash: string }>(
    `select id, email, record_id as "recordId", password_hash as "passwordHash"
       from accounts where email = $1`,
    [normalise(email)],
  );
  return rows[0] ?? null;
}

export async function createAccount(input: {
  email: string;
  password: string;
  recordId: string;
}): Promise<Account> {
  const id = idOf.account();
  await (await db()).query('insert into accounts (id, record_id, email, password_hash) values ($1,$2,$3,$4)', [
    id,
    input.recordId,
    normalise(input.email),
    await hashPassword(input.password),
  ]);
  return { id, email: normalise(input.email) };
}

/** Name of the cookie the browser carries. httpOnly, so no script reads it. */
export const SESSION_COOKIE = 'ceed_session';
