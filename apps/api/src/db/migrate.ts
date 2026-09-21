/**
 * Brings the schema up to date and stops.
 *
 * This is what a deployment runs before it starts the new version: the schema
 * moves once, under one lock, while nothing is serving. The server still
 * migrates on boot for local work, where there is only ever one of it — but a
 * platform that starts the new instance before stopping the old one wants the
 * schema settled first, not settled twice.
 *
 *   npm run migrate -w apps/api
 */
import { db, migrate } from './client.js';

try {
  await migrate();
  console.log('schema up to date');
} catch (err) {
  console.error('migration failed — the schema was left as it was');
  console.error(err);
  process.exitCode = 1;
} finally {
  await (await db()).close();
}
