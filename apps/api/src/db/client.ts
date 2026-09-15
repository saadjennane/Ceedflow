import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs a script that may contain several statements. */
  exec(text: string): Promise<void>;
  /** Runs fn inside a transaction, rolling back on throw. */
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Local development runs Postgres compiled to WASM (PGlite) so there is nothing
 * to install. Setting DATABASE_URL points the exact same SQL at a real server.
 */
async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: postgres } = await import('postgres');
    const sql = postgres(url);
    return {
      query: async <T>(text: string, params: unknown[] = []) =>
        (await sql.unsafe(text, params as never[])) as unknown as T[],
      exec: async (text: string) => {
        await sql.unsafe(text);
      },
      tx: async <T>(fn: () => Promise<T>) => {
        await sql.unsafe('begin');
        try {
          const out = await fn();
          await sql.unsafe('commit');
          return out;
        } catch (err) {
          await sql.unsafe('rollback');
          throw err;
        }
      },
      close: () => sql.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(process.env.PGLITE_DIR ?? join(here, '../../../../.pgdata'));
  await pg.waitReady;
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    exec: async (text: string) => {
      await pg.exec(text);
    },
    tx: async <T>(fn: () => Promise<T>) => {
      await pg.exec('begin');
      try {
        const out = await fn();
        await pg.exec('commit');
        return out;
      } catch (err) {
        await pg.exec('rollback');
        throw err;
      }
    },
    close: () => pg.close(),
  };
}

let instance: Promise<Db> | null = null;

export function db(): Promise<Db> {
  if (!instance) instance = connect();
  return instance;
}

export async function migrate(): Promise<void> {
  const conn = await db();
  await conn.query(`create table if not exists _migrations (
    name text primary key, ran_at timestamptz not null default now())`);
  const done = new Set(
    (await conn.query<{ name: string }>('select name from _migrations')).map((r) => r.name),
  );
  const dir = join(here, 'migrations');
  const files = (await readdir(dir)).filter((f: string) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await conn.exec(sql);
    await conn.query('insert into _migrations (name) values ($1)', [file]);
    console.log(`migrated ${file}`);
  }
}

/** `select ... from t where id = $1` helper that returns one row or null. */
export async function one<T>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await (await db()).query<T>(text, params);
  return rows[0] ?? null;
}

export async function all<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db()).query<T>(text, params);
}
