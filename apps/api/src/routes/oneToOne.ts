/**
 * Les One to One, du côté de l'équipe CEED.
 *
 * Planifier, déplacer, annuler, et écrire un compte rendu à la place d'un
 * interlocuteur qui l'a dicté. L'interlocuteur, lui, passe par son espace
 * (/api/me/meetings, dans auth.ts) et ne voit que ses rendez-vous.
 */
import { meetingPatch, planMeetingsInput, reportInput } from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as dir from '../db/directory.js';
import { z } from 'zod';
import {
  answerInvitation,
  invitationFor,
  changeMeeting,
  dropMeeting,
  getMeeting,
  oneToOneView,
  planMeetings,
  saveReport,
} from '../services/oneToOne.js';
import { workspaceGuard } from './guard.js';
import { HttpError, notFound, parse } from './util.js';

/** Le collègue qui écrit, tel qu'on l'inscrit sur le compte rendu. */
const actor = async (req: FastifyRequest) => {
  if (!req.staff) throw new HttpError(401, 'Sign in to the CEED workspace.');
  const record = await dir.getRecord(req.staff.recordId);
  return { id: req.staff.recordId, name: record?.name?.trim() || req.staff.email };
};

export async function oneToOneRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  app.get('/api/blocks/:id/one-to-one', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await oneToOneView(id)) ?? notFound(reply, 'One to One not found.');
  });

  app.post('/api/blocks/:id/meetings', async (req, reply) => {
    const { id } = req.params as { id: string };
    const made = await planMeetings(id, parse(planMeetingsInput, req.body));
    reply.code(201);
    return made;
  });

  app.patch('/api/meetings/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await changeMeeting(id, parse(meetingPatch, req.body))) ?? notFound(reply, 'Meeting not found.');
  });

  app.delete('/api/meetings/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await dropMeeting(id))) return notFound(reply, 'Meeting not found.');
    reply.code(204);
  });

  /** Le compte rendu écrit par CEED : dicté au téléphone, ou repris d'une note. */
  app.put('/api/meetings/:id/report', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getMeeting(id))) return notFound(reply, 'Meeting not found.');
    const { answers, submit } = parse(reportInput, req.body);
    return saveReport(id, answers, submit, await actor(req));
  });
}

/**
 * La porte de la startup : lire le rendez-vous proposé, et y répondre.
 * Hors de la garde de l'espace de travail — le lien suffit, comme celui du comité.
 */
export async function oneToOnePublicRoutes(app: FastifyInstance) {
  app.get('/api/public/meet/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    return (await invitationFor(token))?.page ?? notFound(reply, 'This invitation does not exist.');
  });

  app.post('/api/public/meet/:token', async (req) => {
    const { token } = req.params as { token: string };
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    return answerInvitation(token, accept);
  });
}
