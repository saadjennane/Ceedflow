import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_UPLOAD_BYTES } from '@ceed/shared';
import Fastify from 'fastify';
import { migrate } from './db/client.js';
import { actionRoutes } from './routes/actions.js';
import { authRoutes } from './routes/auth.js';
import { builderRoutes } from './routes/builder.js';
import { directoryRoutes } from './routes/directory.js';
import { funnelRoutes } from './routes/funnel.js';
import { programRoutes } from './routes/programs.js';
import { staffRoutes } from './routes/staff.js';
import { bootstrapAdmin } from './services/bootstrap.js';
import { HttpError } from './routes/util.js';

const app = Fastify({ logger: { transport: undefined, level: 'warn' } });

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof HttpError) {
    return reply.code(error.status).send({ error: error.message, fields: error.details ?? null });
  }
  app.log.error(error);
  // In development the cause travels with the refusal. A generic 500 sends
  // whoever is working on it hunting through a log they may not be able to see.
  return reply.code(500).send({
    error: 'Something went wrong on our side.',
    detail: process.env.NODE_ENV === 'production' ? undefined : (error as Error).message,
  });
});

app.get('/api/health', async () => ({ ok: true }));

await app.register(programRoutes);
await app.register(builderRoutes);
await app.register(funnelRoutes);
await app.register(actionRoutes);
await app.register(directoryRoutes);
await app.register(staffRoutes);
await app.register(authRoutes);

/* A deployment that owns the schema step sets SKIP_MIGRATE and runs
   `npm run migrate` before starting anything, so the schema settles once while
   nothing is serving. Left unset — which is local work — the server still
   brings itself up to date, and the lock inside makes that safe either way. */
if (!process.env.SKIP_MIGRATE) await migrate();
await bootstrapAdmin((message) => console.log(message));

/* ------------------------------------------------------------------ */
/* The built front, served from here                                    */
/* ------------------------------------------------------------------ */

/**
 * One origin for the whole thing.
 *
 * In development Vite proxies `/api` to this server, so the browser only ever
 * talks to one host. A built front has no proxy, and the session cookie is
 * `sameSite: lax` — served from a second domain it would simply not be sent.
 * So the API serves the front it belongs to: one origin, no CORS, and a cookie
 * that works the way it was written to.
 *
 * Absent — which is every development run — nothing below happens and the
 * server stays the API alone.
 */
const here = dirname(fileURLToPath(import.meta.url));
const front = process.env.WEB_DIST ?? join(here, '../../web/dist');

if (existsSync(join(front, 'index.html'))) {
  await app.register(fastifyStatic, { root: front, wildcard: false });
  // Anything that is not a file and not the API is a route of the app itself:
  // the browser asked for /editions/… and only the front knows what that is.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found.' });
    }
    return reply.sendFile('index.html');
  });
  console.log(`serving the front from ${front}`);
}

const port = Number(process.env.PORT ?? 4000);
/* A container reaches its process from outside, so binding to the loopback
   would refuse every request that matters. Local runs stay on the loopback:
   a development server has no business being reachable from the network. */
const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
await app.listen({ port, host });
console.log(`api ready on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
