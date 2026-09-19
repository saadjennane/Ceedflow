import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { MAX_UPLOAD_BYTES } from '@ceed/shared';
import Fastify from 'fastify';
import { migrate } from './db/client.js';
import { actionRoutes } from './routes/actions.js';
import { authRoutes } from './routes/auth.js';
import { builderRoutes } from './routes/builder.js';
import { directoryRoutes } from './routes/directory.js';
import { funnelRoutes } from './routes/funnel.js';
import { programRoutes } from './routes/programs.js';
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
  return reply.code(500).send({ error: 'Something went wrong on our side.' });
});

app.get('/api/health', async () => ({ ok: true }));

await app.register(programRoutes);
await app.register(builderRoutes);
await app.register(funnelRoutes);
await app.register(actionRoutes);
await app.register(directoryRoutes);
await app.register(authRoutes);

await migrate();

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '127.0.0.1' });
console.log(`api ready on http://127.0.0.1:${port}`);
