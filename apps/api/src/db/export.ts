/**
 * The data, as SQL anybody can load.
 *
 * A PGlite folder is only readable by PGlite, and a Railway snapshot only from
 * the account that holds it. This writes something neither of those is: one
 * text file with the rows and nothing else, that loads into any Postgres.
 *
 * It carries no schema. The target runs `npm run migrate` first and then loads
 * this — so the structure comes from the migrations that are under review in
 * the repository, and only the contents travel.
 *
 *   npm run export -w apps/api > ceed-2026-09-21.sql
 *
 * Reading order matters: a row cannot be written before the rows it points at,
 * so the tables come out sorted by their foreign keys rather than by name.
 */
import { all, db } from './client.js';

/** Filled by the target's own migrations, never by a dump. */
const NEVER_EXPORTED = new Set(['_migrations']);

async function tableNames(): Promise<string[]> {
  const rows = await all<{ name: string }>(
    `select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  return rows.map((r) => r.name).filter((n) => !NEVER_EXPORTED.has(n));
}

/** Who points at whom, so nothing is written before what it refers to. */
async function dependencies(): Promise<Map<string, Set<string>>> {
  const rows = await all<{ child: string; parent: string }>(
    `select c.relname as child, p.relname as parent
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_class p on p.oid = k.confrelid
      where k.contype = 'f'`,
  );
  const out = new Map<string, Set<string>>();
  for (const { child, parent } of rows) {
    if (child === parent) continue; // a row pointing at its own table orders itself
    if (!out.has(child)) out.set(child, new Set());
    out.get(child)!.add(parent);
  }
  return out;
}

/**
 * Parents first. A cycle would have no valid order at all; rather than loop for
 * ever we stop and say so, because a dump in the wrong order fails on load and
 * that is a worse way to find out.
 */
function inLoadOrder(tables: string[], deps: Map<string, Set<string>>): string[] {
  const done = new Set<string>();
  const order: string[] = [];
  let left = [...tables].sort();
  while (left.length) {
    const ready = left.filter((t) => [...(deps.get(t) ?? [])].every((p) => done.has(p) || !tables.includes(p)));
    if (!ready.length) {
      throw new Error(`These tables refer to each other in a circle: ${left.join(', ')}`);
    }
    for (const t of ready) {
      order.push(t);
      done.add(t);
    }
    left = left.filter((t) => !done.has(t));
  }
  return order;
}

/** One value, written the way Postgres reads it back. */
function literal(value: unknown, type: string): string {
  if (value === null || value === undefined) return 'null';
  if (type === 'bytea') {
    // Uint8Array from one driver, Buffer from the other, a hex string already
    // from a third. All three end up as the same escaped literal.
    const hex =
      typeof value === 'string'
        ? value.replace(/^\\x/, '')
        : Buffer.from(value as Uint8Array).toString('hex');
    return `'\\x${hex}'::bytea`;
  }
  if (type === 'jsonb' || type === 'json') {
    return `${quote(JSON.stringify(value))}::${type}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (value instanceof Date) return quote(value.toISOString());
  return quote(String(value));
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function exportSql(write: (line: string) => void): Promise<number> {
  const tables = await tableNames();
  const order = inLoadOrder(tables, await dependencies());
  let total = 0;

  write('-- CEEDflow data, without its schema.');
  write('-- Load it into a database whose migrations have already run:');
  write('--   npm run migrate  &&  psql "$DATABASE_URL" -f this-file.sql');
  write('-- All or nothing: a failure anywhere leaves the target as it was.');
  write('begin;');

  for (const table of order) {
    const columns = await all<{ name: string; type: string }>(
      `select column_name as name, data_type as type from information_schema.columns
        where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table],
    );
    const rows = await all<Record<string, unknown>>(`select * from "${table}"`);
    write('');
    write(`-- ${table}: ${rows.length} row${rows.length === 1 ? '' : 's'}`);
    if (!rows.length) continue;

    const names = columns.map((c) => `"${c.name}"`).join(', ');
    for (const row of rows) {
      const values = columns.map((c) => literal(row[c.name], c.type)).join(', ');
      write(`insert into "${table}" (${names}) values (${values});`);
      total += 1;
    }
  }

  write('');
  write('commit;');
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lines: string[] = [];
  const total = await exportSql((line) => lines.push(line));
  process.stdout.write(lines.join('\n') + '\n');
  console.error(`${total} rows exported`);
  await (await db()).close();
}
