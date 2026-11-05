/**
 * Les One to One, du côté de l'équipe CEED.
 *
 * Planifier, déplacer, annuler, et écrire un compte rendu à la place d'un
 * interlocuteur qui l'a dicté. L'interlocuteur, lui, passe par son espace
 * (/api/me/meetings, dans auth.ts) et ne voit que ses rendez-vous.
 */
import { dayInput, meetingPatch, planMeetingsInput, reportInput } from '@ceed/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as dir from '../db/directory.js';
import { z } from 'zod';
import {
  answerInvitation,
  bookSlot,
  cancelFollowing,
  createDay,
  deleteDay,
  informAll,
  updateDay,
  historyOf,
  invitationFor,
  tellMeeting,
  changeMeeting,
  dropMeeting,
  getMeeting,
  oneToOneView,
  planMeetings,
  saveReport,
  savePrep,
  publicInvitation,
  invitationPreview,
  inviteToBook,
} from '../services/oneToOne.js';
import { workspaceGuard } from './guard.js';
import { post } from '../services/mail.js';
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
    const { scope } = req.query as { scope?: string };
    const patch = parse(meetingPatch, req.body);
    /* Annuler cette séance et les suivantes d'une série. */
    if (scope === 'following' && patch.status === 'cancelled') {
      if (!(await getMeeting(id))) return notFound(reply, 'Meeting not found.');
      await cancelFollowing(id);
      return getMeeting(id);
    }
    return (await changeMeeting(id, patch)) ?? notFound(reply, 'Meeting not found.');
  });

  /** Écrire à nouveau — après un changement d'heure, ou une lettre restée sans réponse. */
  app.post('/api/meetings/:id/tell', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getMeeting(id))) return notFound(reply, 'Meeting not found.');
    const who = parse(z.object({ startup: z.boolean().default(false), person: z.boolean().default(false) }), req.body);
    return tellMeeting(id, who);
  });

  /* Les journées de la brique : comme les séances d'un comité. */
  app.post('/api/blocks/:id/days', async (req, reply) => {
    const { id } = req.params as { id: string };
    const day = await createDay(id, parse(dayInput, req.body));
    reply.code(201);
    return day;
  });

  app.patch('/api/one-to-one-days/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await updateDay(id, parse(dayInput.partial(), req.body))) ?? notFound(reply, 'Day not found.');
  });

  app.delete('/api/one-to-one-days/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await deleteDay(id))) return notFound(reply, 'Day not found.');
    reply.code(204);
  });

  /** La lettre d'invitation à réserver, en aperçu — et en test, à soi-même. */
  app.post('/api/blocks/:id/one-to-one/invite-preview', async (req) => {
    const { id } = req.params as { id: string };
    const { candidateId } = parse(z.object({ candidateId: z.string() }), req.body);
    return invitationPreview(id, candidateId);
  });
  app.post('/api/blocks/:id/one-to-one/invite-test', async (req) => {
    const { id } = req.params as { id: string };
    const { candidateId } = parse(z.object({ candidateId: z.string() }), req.body);
    const letter = await invitationPreview(id, candidateId);
    const to = req.staff?.email ?? '';
    if (!to) throw new HttpError(422, 'No address to send the test to.');
    await post({ kind: 'one_to_one_test', to, toName: '', blockId: id, subject: `[Test] ${letter.subject}`, body: letter.body });
    return { to };
  });
  /** Inviter à réserver — ou réinviter celles qui l'ont déjà été. */
  app.post('/api/blocks/:id/one-to-one/invite', async (req) => {
    const { id } = req.params as { id: string };
    const input = parse(
      z.object({ candidateIds: z.array(z.string()).min(1, 'Pick at least one startup.'), personId: z.string().nullable().default(null), tell: z.boolean().default(true) }),
      req.body,
    );
    return inviteToBook(id, input.candidateIds, input.personId, input.tell);
  });

  /** Prévenir tous ceux d'une journée (ou de la brique) qui ne l'ont pas été. */
  app.post('/api/blocks/:id/one-to-one/inform', async (req) => {
    const { id } = req.params as { id: string };
    const { dayId } = parse(z.object({ dayId: z.string().nullable().default(null) }), req.body);
    return informAll(id, dayId);
  });

  /* L'histoire des rendez-vous d'une startup : une candidature, ou toute l'organisation. */
  app.get('/api/candidates/:id/meetings', async (req) => {
    const { id } = req.params as { id: string };
    return historyOf({ candidateId: id });
  });

  app.get('/api/records/:id/meetings', async (req) => {
    const { id } = req.params as { id: string };
    return historyOf({ orgId: id });
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

  /** La préparation de la startup, corrigée ou complétée par CEED. */
  app.put('/api/meetings/:id/prep', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getMeeting(id))) return notFound(reply, 'Meeting not found.');
    const { answers } = parse(reportInput, req.body);
    return savePrep(id, answers, { side: 'team', name: (await actor(req)).name });
  });
}

/**
 * La porte de la startup : lire le rendez-vous proposé, et y répondre.
 * Hors de la garde de l'espace de travail — le lien suffit, comme celui du comité.
 */
export async function oneToOnePublicRoutes(app: FastifyInstance) {
  app.get('/api/public/meet/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await invitationFor(token);
    return found ? publicInvitation(found.page) : notFound(reply, 'This invitation does not exist.');
  });

  app.post('/api/public/meet/:token', async (req) => {
    const { token } = req.params as { token: string };
    const body = parse(
      z.object({
        accept: z.boolean().optional(),
        /** Un mot en refusant, facultatif. */
        note: z.string().max(1000, 'A thousand characters at most.').optional(),
        dayId: z.string().optional(),
        startTime: z.string().optional(),
        personId: z.string().optional(),
      }),
      req.body,
    );
    /* Une case choisie, ou un oui ou non à l'heure proposée. */
    if (body.dayId && body.startTime && body.personId) {
      return publicInvitation(await bookSlot(token, { dayId: body.dayId, startTime: body.startTime, personId: body.personId }));
    }
    if (body.accept === undefined) throw new HttpError(422, 'Pick a time, or answer.');
    return publicInvitation(await answerInvitation(token, body.accept, body.note ?? ''));
  });
}
