/**
 * L'assistant de réunion, réservé à l'équipe CEED : un compte rendu peut être
 * confidentiel, aucune startup ni aucun compte externe n'y accède.
 */
import { createSuggestionsInput, meetingInput, suggestionPatch } from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { one } from '../db/client.js';
import {
  addSuggestion,
  changeSuggestion,
  createFromBacklog,
  createFromSuggestions,
  deleteMeeting,
  meetingBacklog,
  createMeeting,
  listMeetings,
  meetingOptions,
  meetingView,
  reanalyse,
  removeSuggestion,
  runMeetingAnalysis,
  type MeetingActor,
} from '../services/meetingAssistant.js';
import { workspaceGuard } from './guard.js';
import { HttpError, notFound, parse } from './util.js';

const actorOf = async (req: FastifyRequest): Promise<MeetingActor> => {
  if (!req.staff) throw new HttpError(401, 'Sign in to the CEED workspace.');
  const who = await one<{ name: string }>('select name from records where id = $1', [req.staff.recordId]);
  return { recordId: req.staff.recordId, name: who?.name ?? '', role: req.staff.role };
};

/** L'analyse tourne à côté : la page répond tout de suite, et se met à jour quand elle a fini. */
const analyse = (id: string) => {
  void runMeetingAnalysis(id).catch((err) => console.error('meeting analysis', id, (err as Error).message));
};

export async function meetingAssistantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  app.get('/api/meeting-assistant/options', async (req) => meetingOptions(await actorOf(req)));
  app.get('/api/meeting-assistant/meetings', async () => listMeetings());
  app.get('/api/meeting-assistant/backlog', async () => meetingBacklog());
  app.post('/api/meeting-assistant/backlog/create', async (req) =>
    createFromBacklog(parse(createSuggestionsInput, req.body), await actorOf(req)),
  );
  app.delete('/api/meeting-assistant/meetings/:id', async (req) => {
    const { id } = req.params as { id: string };
    await deleteMeeting(id, await actorOf(req));
    return { ok: true };
  });

  app.post('/api/meeting-assistant/meetings', async (req, reply) => {
    const made = await createMeeting(parse(meetingInput, req.body), await actorOf(req));
    analyse(made.id);
    reply.code(201);
    return made;
  });

  app.get('/api/meeting-assistant/meetings/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await meetingView(id)) ?? notFound(reply, 'Meeting not found.');
  });

  app.post('/api/meeting-assistant/meetings/:id/analyse', async (req) => {
    const { id } = req.params as { id: string };
    await reanalyse(id, await actorOf(req));
    analyse(id);
    return { ok: true };
  });

  app.post('/api/meeting-assistant/meetings/:id/suggestions', async (req, reply) => {
    const { id } = req.params as { id: string };
    reply.code(201);
    return addSuggestion(id, await actorOf(req));
  });

  app.patch('/api/meeting-assistant/suggestions/:id', async (req) => {
    const { id } = req.params as { id: string };
    await changeSuggestion(id, parse(suggestionPatch, req.body), await actorOf(req));
    return { ok: true };
  });

  app.delete('/api/meeting-assistant/suggestions/:id', async (req) => {
    const { id } = req.params as { id: string };
    await removeSuggestion(id, await actorOf(req));
    return { ok: true };
  });

  app.post('/api/meeting-assistant/meetings/:id/create', async (req) => {
    const { id } = req.params as { id: string };
    return createFromSuggestions(id, parse(createSuggestionsInput, req.body), await actorOf(req));
  });
}
