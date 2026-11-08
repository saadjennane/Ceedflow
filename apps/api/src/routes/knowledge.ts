/**
 * La Knowledge Base, réservée à l'équipe CEED : la garde de l'espace de
 * travail refuse tout compte qui n'en est pas — startup, mentor, juré —, même
 * en appelant l'API directement. Les droits fins (relire, valider, régler) se
 * vérifient dans le service.
 */
import {
  kbCategoryInput,
  kbCommentInput,
  kbCreateInput,
  kbDecideInput,
  kbEditInput,
  kbFlagInput,
  kbReviewInput,
  kbSettingsInput,
  kbUpdateInput,
  kbValidateInput,
} from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  changeCategory,
  commentOn,
  createCategory,
  createKnowledge,
  decideFinding,
  editVersion,
  flagFinding,
  kbEntry,
  kbHistory,
  kbOverview,
  kbSearch,
  kbSettings,
  listCategories,
  proposeUpdate,
  resubmit,
  retryAnalysis,
  reviewVersion,
  runAnalysis,
  saveKbSettings,
  testAi,
  validateVersion,
  type KbActor,
} from '../services/knowledge.js';
import { workspaceGuard } from './guard.js';
import { HttpError, notFound, parse } from './util.js';

const actorOf = (req: FastifyRequest): KbActor => {
  if (!req.staff) throw new HttpError(401, 'Sign in to the CEED workspace.');
  return { recordId: req.staff.recordId, role: req.staff.role };
};

/** L'analyse tourne à côté : la page répond tout de suite, et se met à jour quand elle a fini. */
const analyse = (versionId: string, actorId: string) => {
  void runAnalysis(versionId, actorId).catch((err) => console.error('knowledge analysis', err));
};

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  app.get('/api/kb', async (req) => kbOverview(actorOf(req)));

  app.get('/api/kb/search', async (req) => {
    const { q = '' } = req.query as { q?: string };
    return { entryIds: await kbSearch(q) };
  });

  app.get('/api/kb/history', async (req) => {
    const { limit } = req.query as { limit?: string };
    return kbHistory(limit ? Number(limit) : 300);
  });

  app.get('/api/kb/entries/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await kbEntry(id, actorOf(req))) ?? notFound(reply, 'Knowledge not found.');
  });

  app.post('/api/kb/entries', async (req, reply) => {
    const actor = actorOf(req);
    const made = await createKnowledge(parse(kbCreateInput, req.body), actor);
    analyse(made.versionId, actor.recordId);
    reply.code(201);
    return made;
  });

  app.post('/api/kb/entries/:id/versions', async (req, reply) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const made = await proposeUpdate(id, parse(kbUpdateInput, req.body), actor);
    analyse(made.versionId, actor.recordId);
    reply.code(201);
    return made;
  });

  app.patch('/api/kb/versions/:id', async (req) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const done = await editVersion(id, parse(kbEditInput, req.body), actor);
    if (done.reanalyse) analyse(id, actor.recordId);
    return done;
  });

  app.post('/api/kb/versions/:id/analyse', async (req) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    await retryAnalysis(id, actor);
    analyse(id, actor.recordId);
    return { ok: true };
  });

  app.post('/api/kb/versions/:id/review', async (req) => {
    const { id } = req.params as { id: string };
    await reviewVersion(id, parse(kbReviewInput, req.body), actorOf(req));
    return { ok: true };
  });

  app.post('/api/kb/versions/:id/resubmit', async (req) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    await resubmit(id, actor);
    analyse(id, actor.recordId);
    return { ok: true };
  });

  app.post('/api/kb/versions/:id/validate', async (req) => {
    const { id } = req.params as { id: string };
    await validateVersion(id, parse(kbValidateInput, req.body), actorOf(req));
    return { ok: true };
  });

  app.post('/api/kb/versions/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    await commentOn(id, parse(kbCommentInput, req.body).body, actorOf(req));
    reply.code(201);
    return { ok: true };
  });

  app.post('/api/kb/versions/:id/findings', async (req, reply) => {
    const { id } = req.params as { id: string };
    await flagFinding(id, parse(kbFlagInput, req.body), actorOf(req));
    reply.code(201);
    return { ok: true };
  });

  app.post('/api/kb/findings/:id/decision', async (req) => {
    const { id } = req.params as { id: string };
    await decideFinding(id, parse(kbDecideInput, req.body), actorOf(req));
    return { ok: true };
  });

  /* ---- Réglages ---- */

  app.get('/api/kb/categories', async () => listCategories());
  app.post('/api/kb/categories', async (req, reply) => {
    const out = await createCategory(parse(kbCategoryInput, req.body), actorOf(req));
    reply.code(201);
    return out;
  });
  app.patch('/api/kb/categories/:id', async (req) => {
    const { id } = req.params as { id: string };
    return changeCategory(id, parse(kbCategoryInput.partial(), req.body), actorOf(req));
  });

  app.get('/api/kb/settings', async () => kbSettings());
  app.put('/api/kb/settings', async (req) => saveKbSettings(parse(kbSettingsInput, req.body), actorOf(req)));
  app.post('/api/kb/settings/test', async (req) => {
    if (actorOf(req).role !== 'admin') throw new HttpError(403, 'Only a CEED administrator tests the connection.');
    return testAi();
  });
}
