import cors from '@fastify/cors';
import Fastify from 'fastify';
import { migrate } from './db/client.js';
import { builderRoutes } from './routes/builder.js';
import { funnelRoutes } from './routes/funnel.js';
import { programRoutes } from './routes/programs.js';
import { HttpError } from './routes/util.js';

const app = Fastify({ logger: { transport: undefined, level: 'warn' } });

await app.register(cors, { origin: true });

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

await migrate();

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '127.0.0.1' });
console.log(`api ready on http://127.0.0.1:${port}`);
