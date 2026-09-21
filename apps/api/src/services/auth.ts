import {
  accountStateOf,
  idOf,
  type Account,
  type AccountState,
  type RecordAccount,
  type StaffRole,
} from '@ceed/shared';
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
  ).query<{
    id: string;
    email: string;
    recordId: string;
    mustChangePassword: boolean;
    invitedAt: string | null;
    staffRole: StaffRole | null;
  }>(
    `select a.id, a.email, a.record_id as "recordId",
            a.must_change_password as "mustChangePassword", a.invited_at::text as "invitedAt",
            a.staff_role as "staffRole"
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
  ).query<{
    id: string;
    email: string;
    recordId: string;
    passwordHash: string;
    mustChangePassword: boolean;
    invitedAt: string | null;
    staffRole: StaffRole | null;
  }>(
    `select id, email, record_id as "recordId", password_hash as "passwordHash",
            must_change_password as "mustChangePassword", a.invited_at::text as "invitedAt",
            a.staff_role as "staffRole"
       from accounts a where email = $1`,
    [normalise(email)],
  );
  return rows[0] ?? null;
}

export async function createAccount(input: {
  email: string;
  password: string;
  recordId: string;
  /** True when CEED chose the password, so its owner has to replace it. */
  mustChangePassword?: boolean;
}): Promise<Account> {
  const id = idOf.account();
  const provisional = input.mustChangePassword ?? false;
  await (
    await db()
  ).query(
    'insert into accounts (id, record_id, email, password_hash, must_change_password) values ($1,$2,$3,$4,$5)',
    [id, input.recordId, normalise(input.email), await hashPassword(input.password), provisional],
  );
  return { id, email: normalise(input.email), mustChangePassword: provisional };
}

/**
 * Choosing a password. Doing so is what makes an account its owner's, so the
 * provisional flag falls here and nowhere else. Every other session is ended:
 * whoever handed the password over cannot still be signed in on it.
 */
export async function setPassword(accountId: string, password: string, keepToken?: string): Promise<void> {
  const client = await db();
  await client.query('update accounts set password_hash = $2, must_change_password = false where id = $1', [
    accountId,
    await hashPassword(password),
  ]);
  await client.query('delete from sessions where account_id = $1 and token_hash <> $2', [
    accountId,
    keepToken ? fingerprint(keepToken) : '',
  ]);
}

/** The account attached to a directory record, as the team reads it. */
export async function accountOfRecord(recordId: string): Promise<RecordAccount | null> {
  const rows = await (
    await db()
  ).query<{ id: string; email: string; mustChangePassword: boolean; invitedAt: string | null; createdAt: string }>(
    `select id, email, must_change_password as "mustChangePassword",
            invited_at::text as "invitedAt", created_at::text as "createdAt"
       from accounts where record_id = $1`,
    [recordId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    state: accountStateOf(row),
    invitedAt: row.invitedAt,
    createdAt: row.createdAt,
  };
}

/** Account states for many records at once — one query, for the lists. */
export async function accountStatesByRecord(): Promise<Map<string, RecordAccount>> {
  const rows = await (
    await db()
  ).query<{
    id: string;
    recordId: string;
    email: string;
    mustChangePassword: boolean;
    invitedAt: string | null;
    createdAt: string;
  }>(
    `select id, record_id as "recordId", email, must_change_password as "mustChangePassword",
            invited_at::text as "invitedAt", created_at::text as "createdAt"
       from accounts`,
  );
  return new Map(
    rows.map((r) => [
      r.recordId,
      { id: r.id, email: r.email, state: accountStateOf(r), invitedAt: r.invitedAt, createdAt: r.createdAt },
    ]),
  );
}

/**
 * Sending the invitation. Recorded rather than delivered while no mail provider
 * is connected — the date is what separates an account nobody was told about
 * from one whose owner has simply not come yet. Inviting again re-stamps it,
 * which is what a reminder is.
 */
export async function markInvited(accountId: string): Promise<void> {
  await (await db()).query('update accounts set invited_at = now() where id = $1', [accountId]);
}

/**
 * Handing out a provisional password again — for an account whose password was
 * never claimed, and only ever for one that is still provisional. Sessions on
 * the old password end: whoever had it no longer gets in.
 */
export async function reissueProvisionalPassword(accountId: string, password: string): Promise<void> {
  const client = await db();
  await client.query('update accounts set password_hash = $2, must_change_password = true where id = $1', [
    accountId,
    await hashPassword(password),
  ]);
  await client.query('delete from sessions where account_id = $1', [accountId]);
}

/**
 * Taking an account away. The directory record it belonged to is untouched —
 * the person is still in the directory, they simply have no way in any more.
 * Their sessions go with it.
 */
/**
 * Putting somebody on the CEED team, or taking them off it. Null is not staff,
 * which is what every founder's account holds.
 */
export async function setStaffRole(accountId: string, role: StaffRole | null): Promise<void> {
  await (await db()).query('update accounts set staff_role = $2 where id = $1', [accountId, role]);
}

/** The CEED team, administrators first — the order a settings page reads in. */
export async function listStaff(): Promise<
  { accountId: string; recordId: string; email: string; role: StaffRole; state: AccountState;
    invitedAt: string | null; createdAt: string }[]
> {
  const rows = await (
    await db()
  ).query<{
    accountId: string; recordId: string; email: string; role: StaffRole;
    mustChangePassword: boolean; invitedAt: string | null; createdAt: string;
  }>(
    `select id as "accountId", record_id as "recordId", email, staff_role as "role",
            must_change_password as "mustChangePassword", invited_at::text as "invitedAt",
            created_at::text as "createdAt"
       from accounts where staff_role is not null`,
  );
  const rank: Record<StaffRole, number> = { admin: 0, editor: 1, observer: 2 };
  return rows
    .map(({ mustChangePassword, ...r }) => ({
      ...r,
      state: accountStateOf({ mustChangePassword, invitedAt: r.invitedAt }),
    }))
    .sort((a, b) => rank[a.role] - rank[b.role] || a.email.localeCompare(b.email));
}

/** How many administrators CEED has. The workspace is never left without one. */
export async function adminCount(): Promise<number> {
  const rows = await (await db()).query<{ n: number }>(
    `select count(*)::int as n from accounts where staff_role = 'admin'`,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Closes an account: the login and its sessions go, the directory record stays.
 * Everything a person did — a candidacy, a seat on a panel, marks given — hangs
 * off the record and belongs to the programme's history, not to their way of
 * signing in. CEED can issue a new password afterwards.
 */
export async function closeAccount(accountId: string): Promise<void> {
  const client = await db();
  await client.query('delete from sessions where account_id = $1', [accountId]);
  await client.query('delete from accounts where id = $1', [accountId]);
}

/** Name of the cookie the browser carries. httpOnly, so no script reads it. */
export const SESSION_COOKIE = 'ceed_session';
