/**
 * What the database tests need, and why some of them do not run everywhere.
 *
 * The bugs these catch — a transaction that guards nothing, jsonb stored as a
 * string — are invisible against PGlite, because PGlite is one connection and
 * forgiving about types. They only appear against a server. So these tests run
 * when DATABASE_URL points at one, and say plainly that they were skipped when
 * it does not: a green run on a laptop must not be mistaken for a green run.
 */
import { db } from '../src/db/client.js';

export const hasServer = Boolean(process.env.DATABASE_URL);

export const skipWithoutServer = hasServer
  ? false
  : 'needs a Postgres server — set DATABASE_URL (the CI workflow does)';

/** A fresh schema for one test file, so files cannot leak into each other. */
export async function freshSchema(name: string): Promise<void> {
  const conn = await db();
  await conn.exec(`drop schema if exists ${name} cascade; create schema ${name}; set search_path to ${name}`);
}

export async function closeDb(): Promise<void> {
  await (await db()).close();
}

/** Quelqu'un de l'équipe CEED : les seules fiches qui peuvent être owner d'une tâche. */
export async function teammate(name = 'Équipe'): Promise<{ id: string; name: string }> {
  const { createRecord } = await import('../src/db/directory.js');
  const { createAccount, setStaffRole } = await import('../src/services/auth.js');
  const mark = Math.random().toString(36).slice(2, 10);
  const r = await createRecord({ kind: 'person', name: `${name} ${mark}`, origin: 'manual' });
  const a = await createAccount({ email: `team.${mark}@example.test`, password: 'chosen-by-them', recordId: r.id });
  await setStaffRole(a.id, 'editor');
  return { id: r.id, name: r.name };
}
