/**
 * Loads back what `npm run export` wrote.
 *
 * `psql` would do this too, and the file says so at the top. This exists
 * because the machine that needs to restore is not always the machine that has
 * Postgres client tools installed — and a backup you cannot load on the day
 * you need it is not a backup.
 *
 *   npm run migrate                         # the schema first
 *   npm run import -w apps/api -- dump.sql  # then the rows
 *
 * All or nothing: the whole file runs in one transaction, so a failure halfway
 * leaves the target exactly as it was rather than half-filled.
 */
import { readFile } from 'node:fs/promises';
import { db } from './client.js';

export async function importSql(text: string): Promise<number> {
  /* The file wraps itself in begin/commit for psql. We are already going to
     run it inside a transaction of our own, and a driver that pools
     connections refuses a bare `begin` anyway. */
  const body = text
    .replace(/^\s*begin\s*;\s*$/im, '')
    .replace(/^\s*commit\s*;\s*$/im, '');

  const statements = body
    .split(/\n(?=insert into )/i)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));

  const conn = await db();
  let done = 0;
  await conn.tx(async () => {
    for (const statement of statements) {
      await conn.exec(statement);
      done += (statement.match(/^insert into /gim) ?? []).length;
    }
  });
  return done;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('Which file? usage: npm run import -w apps/api -- dump.sql');
    process.exit(1);
  }
  try {
    const rows = await importSql(await readFile(file, 'utf8'));
    console.log(`${rows} rows loaded from ${file}`);
  } catch (err) {
    console.error('nothing was loaded — the database was left as it was');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await (await db()).close();
  }
}
