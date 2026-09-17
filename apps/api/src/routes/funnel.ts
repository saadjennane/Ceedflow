import {
  candidateSchema,
  setOutcomeInput,
  submitApplicationInput,
  proposedOutcome,
  type ApplicationConfig,
  type EvaluationConfig,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../db/repo.js';
import { applyOutcomes, outcomesOf, scoresByCandidate } from '../services/scoring.js';
import { funnelFor, intakeFor, overrideOutcome, publishSelection, selectionView, unpublishSelection } from '../services/selection.js';
import { HttpError, notFound, parse } from './util.js';

const scoreInput = z.object({
  candidateId: z.string(),
  evaluatorId: z.string().min(1),
  evaluatorName: z.string().optional(),
  sessionId: z.string().nullable().optional(),
  marks: z.record(z.number()).default({}),
  comment: z.string().optional(),
  submit: z.boolean().optional(),
});

/** Candidates reaching a block, resolved through its track. */
async function intakeForBlock(blockId: string) {
  const context = await repo.blockContext(blockId);
  if (!context) return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail?.tracks.find((t) => t.id === context.trackId);
  if (!track) return null;
  const candidates = await repo.listCandidates(context.editionId, context.trackId);
  return { context, track, candidates, intake: await intakeFor(track, blockId, candidates) };
}

export async function funnelRoutes(app: FastifyInstance) {
  /* ---------------- candidates ---------------- */

  app.get('/api/editions/:id/candidates', async (req) => {
    const { id } = req.params as { id: string };
    const { trackId } = req.query as { trackId?: string };
    return repo.listCandidates(id, trackId);
  });

  app.get('/api/editions/:id/funnel', async (req) => {
    const { id } = req.params as { id: string };
    const { trackId } = req.query as { trackId?: string };
    const detail = await repo.getEditionDetail(id);
    const track = trackId ? detail?.tracks.find((t) => t.id === trackId) : detail?.tracks[0];
    return track ? funnelFor(id, track.id) : [];
  });

  app.post('/api/editions/:id/candidates', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(
      candidateSchema.pick({ trackId: true, orgName: true }).extend({
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        source: z.string().optional(),
        answers: z.record(z.unknown()).optional(),
      }),
      req.body,
    );
    reply.code(201);
    return repo.createCandidate({ ...input, editionId: id, source: input.source || 'Added by CEED' });
  });

  app.patch('/api/candidates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(
      candidateSchema
        .pick({ orgName: true, contactName: true, email: true, phone: true, source: true, status: true, trackId: true })
        .partial(),
      req.body,
    );
    return (await repo.updateCandidate(id, patch)) ?? notFound(reply, 'Candidate not found.');
  });

  app.delete('/api/candidates/:id', async (req, reply) => {
    await repo.deleteCandidate((req.params as { id: string }).id);
    reply.code(204);
  });

  /* ---------------- public application form ---------------- */

  app.get('/api/public/forms/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await repo.findPublicForm(token);
    if (!found) return notFound(reply, 'This form does not exist.');
    const config = found.block.config as ApplicationConfig;
    if (!config.published) throw new HttpError(403, 'This call for applications is not open.');
    const now = new Date().toISOString().slice(0, 10);
    const closed = Boolean(config.closesAt && config.closesAt < now);
    const notYetOpen = Boolean(config.opensAt && config.opensAt > now);
    return {
      programName: found.program?.name ?? '',
      editionName: found.edition?.name ?? '',
      colour: found.program?.colour ?? '#2F5BFF',
      blockName: found.block.name,
      intro: config.intro,
      fields: config.fields,
      opensAt: config.opensAt,
      closesAt: config.closesAt,
      state: closed ? 'closed' : notYetOpen ? 'not_open' : 'open',
    };
  });

  app.post('/api/public/forms/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await repo.findPublicForm(token);
    if (!found) return notFound(reply, 'This form does not exist.');
    const config = found.block.config as ApplicationConfig;
    const now = new Date().toISOString().slice(0, 10);
    if (!config.published || (config.closesAt && config.closesAt < now) || (config.opensAt && config.opensAt > now)) {
      throw new HttpError(403, 'This call for applications is closed.');
    }

    const input = parse(submitApplicationInput, req.body);
    const missing: Record<string, string> = {};
    for (const field of config.fields) {
      if (!field.required) continue;
      const value = input.answers[field.id];
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
      if (empty) missing[`answers.${field.id}`] = 'This answer is required.';
    }
    if (Object.keys(missing).length) throw new HttpError(422, 'Some answers are missing.', missing);

    const candidate = await repo.createCandidate({
      editionId: found.editionId,
      trackId: found.trackId,
      originBlockId: found.block.id,
      orgName: input.orgName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      source: input.source || 'Application form',
      answers: input.answers,
    });
    reply.code(201);
    return { confirmation: config.confirmation, candidateId: candidate.id };
  });

  /* ---------------- evaluation ---------------- */

  app.get('/api/blocks/:id/evaluation', async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await intakeForBlock(id);
    if (!found || found.context.block.type !== 'evaluation') return notFound(reply, 'Evaluation block not found.');
    const block = found.context.block;
    const config = block.config as EvaluationConfig;
    const outcomes = outcomesOf(block);
    const grouped = await scoresByCandidate(block);
    const stored = new Map((await repo.listBlockOutcomes(id)).map((o) => [o.candidateId, o]));
    return {
      block,
      criteria: config.criteria,
      evaluators: config.evaluators,
      requireComment: config.requireComment,
      outcomes,
      rows: found.intake
        .filter((c) => c.status !== 'Withdrawn')
        .map((candidate) => {
          const entry = grouped.get(candidate.id);
          const saved = stored.get(candidate.id);
          return {
            candidate,
            scores: entry?.scores ?? [],
            consensus: entry?.consensus ?? null,
            submitted: entry?.submitted ?? 0,
            outcomeId: saved?.outcomeId ?? null,
            proposedOutcomeId: proposedOutcome(entry?.consensus ?? null, outcomes),
            overridden: saved?.overridden ?? false,
          };
        }),
    };
  });

  /** Writes the status each score earns, leaving hand-made ones alone. */
  app.post('/api/blocks/:id/outcomes/apply', async (req, reply) => {
    const { id } = req.params as { id: string };
    const block = await repo.getBlock(id);
    if (!block) return notFound(reply, 'Block not found.');
    return { written: await applyOutcomes(block) };
  });

  app.post('/api/blocks/:id/outcomes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const block = await repo.getBlock(id);
    if (!block) return notFound(reply, 'Block not found.');
    const input = parse(z.object({ candidateId: z.string(), outcomeId: z.string() }), req.body);
    const grouped = await scoresByCandidate(block);
    const proposed = proposedOutcome(grouped.get(input.candidateId)?.consensus ?? null, outcomesOf(block));
    await repo.setBlockOutcome(id, input.candidateId, input.outcomeId, input.outcomeId !== proposed);
    reply.code(204);
  });

  app.post('/api/blocks/:id/scores', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(scoreInput, req.body);
    const block = await repo.getBlock(id);
    if (!block) return notFound(reply, 'Block not found.');
    const config = block.config as { requireComment?: boolean };
    if (input.submit && config.requireComment && !input.comment?.trim()) {
      throw new HttpError(422, 'This block asks every evaluator for a comment.', {
        comment: 'Add a comment before submitting.',
      });
    }
    return repo.upsertScore({ ...input, blockId: id });
  });

  /* ---------------- selection ---------------- */

  app.get('/api/blocks/:id/selection', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await selectionView(id)) ?? notFound(reply, 'Selection block not found.');
  });

  app.post('/api/blocks/:id/selection/publish', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await publishSelection(id)) ?? notFound(reply, 'Selection block not found.');
  });

  app.post('/api/blocks/:id/selection/unpublish', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await unpublishSelection(id)) ?? notFound(reply, 'Selection block not found.');
  });

  app.post('/api/blocks/:id/selection/outcome', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(setOutcomeInput, req.body);
    return (await overrideOutcome(id, input.candidateId, input.outcome)) ?? notFound(reply, 'Selection not found.');
  });
}
