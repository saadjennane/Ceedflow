import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The connection a transaction is running on, for the queries inside it.
 *
 * Against a server, every query takes a connection from the pool — so a `begin`
 * sent on its own landed on one connection while what it was meant to protect
 * ran on others, and the `commit` on a third. The transaction guarded nothing
 * and left a connection open. It only ever worked because PGlite is a single
 * connection. This carries the transaction's own handle down to the queries
 * without the callers having to pass it.
 */
const openTx = new AsyncLocalStorage<{ unsafe: (text: string, params?: unknown[]) => unknown }>();

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
    const sql = postgres(url, {
      /* Supabase and every other transaction-mode pooler hands a different
         backend to each statement, which prepared statements cannot survive.
         The errors it produces are intermittent and only appear under load. */
      prepare: false,
    });
    /** Inside a transaction, its own handle; outside, the pool. */
    const on = () => (openTx.getStore() ?? sql) as typeof sql;
    return {
      query: async <T>(text: string, params: unknown[] = []) =>
        (await on().unsafe(text, params as never[])) as unknown as T[],
      exec: async (text: string) => {
        await on().unsafe(text);
      },
      tx: <T>(fn: () => Promise<T>) =>
        // One connection for the whole block, and every query inside it finds
        // that connection rather than asking the pool for another.
        sql.begin((tx) => openTx.run(tx as never, fn)) as Promise<T>,
      close: () => sql.end(),
    };
  }

  /* PGlite is a database inside the process: no server to install, and the
     data in a folder beside the code. That is right for a laptop and wrong
     everywhere else — in a container the folder dies with the container, and
     loading the engine into memory is what a small instance kills you for.
     Falling back to it silently in production would look like a crash with no
     cause, or worse, like a working app with an empty database. */
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL is not set. In production this app talks to a Postgres server; ' +
        'it will not start its own. Point DATABASE_URL at the database — on Railway, ' +
        'add a Postgres service and set DATABASE_URL to ${{Postgres.DATABASE_URL}}.',
    );
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

/**
 * A number nobody else will pick, standing for "the schema of this app".
 * Postgres advisory locks share one namespace across the whole database.
 */
const SCHEMA_LOCK = 4_412_003;

/**
 * Brings the schema up to date, once, whoever asks.
 *
 * Two things make this safe to call from more than one place at a time — which
 * is what a rolling deploy does, starting the new instance while the old one
 * still runs. An advisory lock means the second caller waits instead of racing
 * the first through the same `create table`. And the whole run sits in one
 * transaction, so a migration that fails halfway leaves the schema exactly as
 * it was rather than half-changed; every migration this app has is plain DDL,
 * which Postgres rolls back like anything else.
 */
export async function migrate(): Promise<void> {
  const conn = await db();
  const dir = join(here, 'migrations');
  const files = (await readdir(dir)).filter((f: string) => f.endsWith('.sql')).sort();

  await conn.tx(async () => {
    // Released when the transaction ends, whichever way it ends.
    await conn.query('select pg_advisory_xact_lock($1)', [SCHEMA_LOCK]);
    await conn.query(`create table if not exists _migrations (
      name text primary key, ran_at timestamptz not null default now())`);
    const done = new Set(
      (await conn.query<{ name: string }>('select name from _migrations')).map((r) => r.name),
    );
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      await conn.exec(sql);
      await conn.query('insert into _migrations (name) values ($1)', [file]);
      console.log(`migrated ${file}`);
    }
  });
}

/** `select ... from t where id = $1` helper that returns one row or null. */
export async function one<T>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await (await db()).query<T>(text, params);
  return rows[0] ?? null;
}

export async function all<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db()).query<T>(text, params);
}
