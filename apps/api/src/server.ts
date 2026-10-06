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
import { mailRoutes } from './routes/mail.js';
import { builderRoutes } from './routes/builder.js';
import { directoryRoutes } from './routes/directory.js';
import { funnelRoutes } from './routes/funnel.js';
import { programRoutes } from './routes/programs.js';
import { staffRoutes } from './routes/staff.js';
import { bootstrapAdmin } from './services/bootstrap.js';
import { noteOrigin } from './services/platform.js';
import { sendDueNotices } from './services/notices.js';
import { KEPT_DAYS, purgeExpired } from './services/trash.js';
import { flush, sendingIsLive } from './services/mail.js';
import { HttpError } from './routes/util.js';

const app = Fastify({
  logger: { transport: undefined, level: 'warn' },
  /* Behind a platform's proxy every request arrives from the same place, so
     `req.ip` would be the proxy for everybody — and a limit counted per
     address would lock out the whole world at once, or nobody. Trusting the
     forwarded header is only sound because the proxy sets it; run this
     directly on the open internet and it becomes a claim anyone can make. */
  trustProxy: process.env.NODE_ENV === 'production',
});

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof HttpError) {
    return reply.code(error.status).send({ error: error.message, fields: error.details ?? null });
  }
  /* Fastify's own refusals — a body that is not the JSON it claims to be, a
     missing content type, a payload too large — already carry the right
     status. Passing them through as 500 said "our side" for something that
     was never ours, and sent anybody debugging it to the server logs. */
  const given = (error as { statusCode?: number }).statusCode;
  if (typeof given === 'number' && given >= 400 && given < 500) {
    return reply.code(given).send({ error: (error as Error).message, fields: null });
  }

  app.log.error(error);
  // In development the cause travels with the refusal. A generic 500 sends
  // whoever is working on it hunting through a log they may not be able to see.
  return reply.code(500).send({
    error: 'Something went wrong on our side.',
    detail: process.env.NODE_ENV === 'production' ? undefined : (error as Error).message,
  });
});

/* The platform learns its own address from what it is asked on, so a letter
   saying "go to your space" has somewhere to point without anybody setting a
   variable for it. Health checks and internal names are ignored inside. */
app.addHook('onRequest', async (req) => {
  /* Only the proxy's own word on the scheme is passed on. `req.protocol`
     would always answer something — 'http', for the connection this process
     actually accepted — and that is the socket in front of it, not how
     anybody reached the site. Saying nothing lets the sender assume https,
     which is the safe way to be wrong about a link going into a letter. */
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]!.trim();
  void noteOrigin(forwarded || undefined, req.headers.host);
});

app.get('/api/health', async () => ({ ok: true }));

await app.register(programRoutes);
await app.register(builderRoutes);
await app.register(funnelRoutes);
await app.register(actionRoutes);
await app.register(directoryRoutes);
await app.register(staffRoutes);
await app.register(authRoutes);
await app.register(mailRoutes);

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

/*
 * Notices whose hour has come. This one runs wherever the server runs, not
 * only where sending is live: it writes rows into the outbox, and `post()`
 * marks them held when nothing is going out. The whole chain can therefore be
 * exercised against four hundred real addresses without one of them hearing
 * about it.
 */
{
  const EVERY = 60_000;
  const tick = async () => {
    try {
      const { sent, held } = await sendDueNotices();
      if (sent || held) app.log.info({ sent, held }, 'notices');
    } catch (err) {
      app.log.error(err, 'notices');
    }
  };
  setInterval(() => void tick(), EVERY).unref();
  void tick();
}

/*
 * The outbox is emptied on a timer rather than at the moment a message is
 * written. Two reasons, and the second is the one that matters: a provider
 * being slow must not make a password reset slow, and a provider being down
 * must not make it fail — the message waits and goes out when it can.
 *
 * Nothing runs at all where sending is not live, so a development machine
 * never so much as looks at the queue.
 */
if (sendingIsLive()) {
  const EVERY = 20_000;
  const tick = async () => {
    try {
      const { sent, failed } = await flush();
      if (sent || failed) app.log.info({ sent, failed }, 'outbox');
    } catch (err) {
      app.log.error(err, 'outbox');
    }
  };
  setInterval(() => void tick(), EVERY).unref();
  void tick();
}

/*
 * Le trentième jour, pour de bon.
 *
 * Hourly rather than daily, because "daily" on a process that restarts twice a
 * day is a sweep that never runs at all. It only ever finds rows older than
 * thirty days, so running it sixty times over costs sixty empty queries.
 */
{
  const EVERY = 3_600_000;
  const tick = async () => {
    try {
      const dropped = await purgeExpired();
      if (dropped) app.log.info({ dropped, days: KEPT_DAYS }, 'trash purged');
    } catch (err) {
      app.log.error(err, 'trash');
    }
  };
  setInterval(() => void tick(), EVERY).unref();
  void tick();
}
