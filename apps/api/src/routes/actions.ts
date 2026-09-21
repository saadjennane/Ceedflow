import {
  blockStatus,
  editionIsVisible,
  editionTakesInput,
  sessionSlots,
  type CommitteeConfig,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { markAsJury } from '../db/directory.js';
import * as repo from '../db/repo.js';
import { committeeView, seatOnFreeSlots } from '../services/committee.js';
import { outreachView } from '../services/sourcing.js';
import { HttpError, notFound, parse } from './util.js';
import { workspaceGuard } from './guard.js';

const clock = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM.');

const sessionInput = z.object({
  name: z.string().optional(),
  heldOn: z.string().nullable().optional(),
  windows: z.array(z.object({ startsAt: clock, endsAt: clock })).min(1).optional(),
  minutesPerStartup: z.number().int().min(5).optional(),
  location: z.string().optional(),
  jury: z.array(z.string()).optional(),
});

export async function actionRoutes(app: FastifyInstance) {
  // Everything below is the CEED workspace. Public routes name themselves.
  app.addHook('preHandler', workspaceGuard((url) => url.startsWith('/api/public/')));

  /* ---------------- selection committee ---------------- */

  app.get('/api/blocks/:id/committee', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await committeeView(id)) ?? notFound(reply, 'Committee block not found.');
  });

  app.post('/api/blocks/:id/sessions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const block = await repo.getBlock(id);
    if (!block || block.type !== 'committee') return notFound(reply, 'Committee block not found.');
    const input = parse(sessionInput, req.body);
    await repo.createSession(id, input);
    await markAsJury(input.jury ?? []);
    return committeeView(id);
  });

  app.patch('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const blockId = await repo.sessionBlockId(id);
    if (!blockId) return notFound(reply, 'Committee not found.');
    const input = parse(sessionInput, req.body);
    await repo.updateSession(id, input);
    await markAsJury(input.jury ?? []);
    return committeeView(blockId);
  });

  app.delete('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const blockId = await repo.sessionBlockId(id);
    await repo.deleteSession(id);
    if (!blockId) return notFound(reply, 'Committee not found.');
    return committeeView(blockId);
  });

  /** Assign startups to a sitting: by hand, or in one go from a status. */
  app.post('/api/sessions/:id/assign', async (req, reply) => {
    const { id } = req.params as { id: string };
    const blockId = await repo.sessionBlockId(id);
    if (!blockId) return notFound(reply, 'Committee not found.');
    const input = parse(z.object({ candidateIds: z.array(z.string()).min(1) }), req.body);
    const added = await seatOnFreeSlots(id, input.candidateIds);
    return { added, view: await committeeView(blockId) };
  });

  /** Drag a startup onto a slot. Whoever holds it trades places. */
  app.post('/api/assignments/:id/slot', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { slotIndex } = parse(z.object({ slotIndex: z.number().int().min(0).nullable() }), req.body);
    await repo.moveAssignmentToSlot(id, slotIndex);
    const assignment = await repo.findAssignmentById(id);
    if (!assignment) return notFound(reply, 'Assignment not found.');
    const blockId = await repo.sessionBlockId(assignment.sessionId);
    return blockId ? committeeView(blockId) : notFound(reply, 'Committee not found.');
  });

  app.delete('/api/assignments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await repo.unassign(id);
    reply.code(204);
  });

  /* ---------------- the startup's own booking page ---------------- */

  app.get('/api/public/book/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await repo.findAssignmentByToken(token);
    if (!found || !found.block) return notFound(reply, 'This invitation does not exist.');
    const config = found.block.config as CommitteeConfig;
    if (config.rsvpMode === 'none') {
      throw new HttpError(403, 'This committee is arranged by the team. You have nothing to answer here.');
    }
    const context = await repo.blockContext(found.block.id);
    const detail = context ? await repo.getEditionDetail(context.editionId) : null;
    // The third external door, and it answers to the edition like the other two:
    // a draft has no outside, and a completed edition is read, not answered.
    if (!detail || !editionIsVisible(detail.status)) return notFound(reply, 'This invitation does not exist.');
    const slots = sessionSlots(found.session);
    const taken = new Set(
      found.siblings
        .filter((a) => a.id !== found.assignment.id && a.slotIndex !== null)
        .map((a) => a.slotIndex as number),
    );

    return {
      programName: detail?.program.name ?? '',
      editionName: detail?.name ?? '',
      colour: detail?.program.colour ?? '#2F5BFF',
      orgName: found.candidate.orgName,
      blockName: found.block.name,
      mode: config.rsvpMode,
      deadline: config.rsvp.closesAt,
      session: {
        name: found.session.name,
        heldOn: found.session.heldOn,
        location: found.session.location,
        minutesPerStartup: found.session.minutesPerStartup,
      },
      slots: slots.map((slot) => ({ ...slot, taken: taken.has(slot.index) })),
      rsvpState: found.assignment.rsvpState,
      slotIndex: found.assignment.slotIndex,
      closed:
        !editionTakesInput(detail.status) ||
        blockStatus(found.block, 'rsvp', (await repo.listSessions(found.block.id)).length) !== 'live',
    };
  });

  app.post('/api/public/book/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await repo.findAssignmentByToken(token);
    if (!found || !found.block) return notFound(reply, 'This invitation does not exist.');
    const config = found.block.config as CommitteeConfig;
    const input = parse(
      z.object({
        rsvpState: z.enum(['confirmed', 'declined']),
        slotIndex: z.number().int().nullable().optional(),
      }),
      req.body,
    );

    const context = await repo.blockContext(found.block.id);
    const edition = context ? await repo.getEditionDetail(context.editionId) : null;
    if (!edition || !editionIsVisible(edition.status)) return notFound(reply, 'This invitation does not exist.');
    if (!editionTakesInput(edition.status)) {
      throw new HttpError(403, 'This edition is closed. Get in touch with the team.');
    }
    // The booking page has its own door: a panel a juror is already reading is
    // not the same thing as a slot picker the startups may still answer on.
    if (blockStatus(found.block, 'rsvp', (await repo.listSessions(found.block.id)).length) !== 'live') {
      throw new HttpError(403, 'The deadline to answer has passed. Get in touch with the team.');
    }

    if (config.rsvpMode === 'none') {
      throw new HttpError(403, 'This committee is arranged by the team. You have nothing to answer here.');
    }

    // Declining frees the time either way: the seat stays, the slot opens up.
    let slotIndex: number | null | undefined = input.rsvpState === 'declined' ? null : undefined;

    if (input.rsvpState === 'confirmed' && config.rsvpMode === 'slots') {
      if (input.slotIndex === null || input.slotIndex === undefined) {
        throw new HttpError(422, 'Pick a time before confirming.', { slotIndex: 'Pick a slot.' });
      }
      const slots = sessionSlots(found.session);
      if (!slots[input.slotIndex]) throw new HttpError(422, 'That time is not on offer.');
      const clash = found.siblings.some((a) => a.id !== found.assignment.id && a.slotIndex === input.slotIndex);
      if (clash) throw new HttpError(409, 'Someone took that time while you were choosing. Pick another.');
      slotIndex = input.slotIndex;
    }

    await repo.respondToAssignment(found.assignment.id, input.rsvpState, slotIndex);
    reply.code(200);
    const after = await repo.findAssignmentById(found.assignment.id);
    return { rsvpState: input.rsvpState, slotIndex: after?.slotIndex ?? null };
  });

  /* ---------------- sourcing outreach ---------------- */

  app.get('/api/blocks/:id/outreach', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await outreachView(id)) ?? notFound(reply, 'Sourcing block not found.');
  });

  /**
   * Records a prospecting send to the audience as it stands. Nothing leaves the
   * system yet — no mail provider is wired in — so this is the trace of what was
   * sent, to whom, and through which channel. The channel is the point: a
   * candidacy born of this mail comes back carrying it.
   */
  app.post('/api/blocks/:id/outreach/send', async (req, reply) => {
    const { id } = req.params as { id: string };
    const view = await outreachView(id);
    if (!view) return notFound(reply, 'Sourcing block not found.');
    const { outreach } = view.config;

    if (!outreach.subject.trim()) {
      throw new HttpError(422, 'Give the message a subject first.', { subject: 'A subject is required.' });
    }
    if (!view.audience.length) {
      throw new HttpError(422, 'Nobody in the audience has an email to write to.');
    }

    await repo.recordSend(
      id,
      outreach.subject,
      outreach.body,
      view.audience.map((p) => p.email),
      outreach.channelId,
    );
    reply.code(201);
    return outreachView(id);
  });
}
