import {
  candidateSchema,
  setOutcomeInput,
  submitApplicationInput,
  formPages,
  proposedOutcome,
  type ApplicationConfig,
  type Candidate,
  type EvaluationConfig,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as dir from '../db/directory.js';
import { peopleByIds } from '../db/directory.js';
import * as repo from '../db/repo.js';
import { SESSION_COOKIE, accountForToken } from '../services/auth.js';
import { committeeForEvaluation, committeeView } from '../services/committee.js';
import { outcomesByCandidate, outcomesOf, scoresByCandidate, setOutcomeByHand } from '../services/scoring.js';
import {
  addToSelection,
  funnelFor,
  intakeFor,
  overrideOutcome,
  publishSelection,
  removeFromSelection,
  selectionView,
} from '../services/selection.js';
import { HttpError, notFound, parse } from './util.js';

const scoreInput = z.object({
  candidateId: z.string(),
  evaluatorId: z.string().min(1),
  evaluatorName: z.string().optional(),
  sessionId: z.string().nullable().optional(),
  marks: z.record(z.number()).default({}),
  /** The status named, when the block asks for a verdict rather than marks. */
  verdict: z.string().optional(),
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
      z.object({
        trackId: z.string(),
        /** Either an organisation already in the directory, or a name to add. */
        orgId: z.string().optional(),
        orgName: z.string().optional(),
        source: z.string().optional(),
        answers: z.record(z.unknown()).optional(),
      }),
      req.body,
    );

    // Adding a candidate by hand puts its organisation in the directory too —
    // there is nowhere else for a candidacy to point.
    let orgId = input.orgId;
    if (!orgId) {
      const name = (input.orgName ?? '').trim();
      if (!name) throw new HttpError(422, 'A name is required.', { orgName: 'A name is required.' });
      const found = await dir.findByName('org', name);
      orgId = (found ?? (await dir.createRecord({ kind: 'org', name, roles: ['Startup'], origin: 'manual' }))).id;
    }

    reply.code(201);
    return repo.createCandidate({
      trackId: input.trackId,
      orgId,
      answers: input.answers,
      editionId: id,
      source: input.source || 'Added by CEED',
    });
  });

  app.patch('/api/candidates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(
      candidateSchema
        .pick({ source: true, status: true, trackId: true, mentor: true, cohortStatus: true })
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
      eligibility: config.eligibility,
      channels: found.channels,
      layout: config.layout,
      pages: formPages(config).map(({ page, fields }) => ({ ...page, fields })),
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

    // Applying is done signed in: the form knows who is filling it, so nothing
    // about the applicant is retyped and a candidacy points at a real record.
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) throw new HttpError(401, 'Sign in to apply.');

    const input = parse(submitApplicationInput, req.body);
    const person = await dir.getRecord(account.recordId);
    const mine = person ? await dir.linksOf(person) : [];
    if (!mine.some((l) => l.record.id === input.orgId)) {
      throw new HttpError(403, 'You can only apply for an organisation you belong to.');
    }

    if (config.onePerOrganisation) {
      const already = (await repo.listCandidates(found.editionId)).find(
        (c) => c.orgId === input.orgId && c.originBlockId === found.block.id,
      );
      if (already) throw new HttpError(422, 'This organisation has already applied to this call.');
    }

    // A gate holds the form shut until every criterion is ticked; an
    // informative list only has to have been read.
    if (config.eligibility.mode === 'gate') {
      const unticked = config.eligibility.criteria.filter((c) => !input.acknowledged.includes(c.id));
      if (unticked.length) throw new HttpError(422, 'Every eligibility criterion has to be confirmed.');
    }

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
      orgId: input.orgId,
      personId: account.recordId,
      source: input.source || 'Application form',
      answers: input.answers,
    });
    // Attachments are uploaded before the form is sent, so they are claimed here.
    await repo.claimUploads(candidate.id, input.answers);
    reply.code(201);
    return { confirmation: config.confirmation, candidateId: candidate.id };
  });

  /**
   * An attachment is uploaded before the form is sent, so it exists on its own
   * until submitting claims it. Signing in is required: files are not a place
   * for anonymous writes.
   */
  app.post('/api/public/uploads', async (req, reply) => {
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) throw new HttpError(401, 'Sign in to attach a file.');

    const file = await req.file();
    if (!file) throw new HttpError(422, 'No file received.');
    const bytes = await file.toBuffer();
    if (!bytes.length) throw new HttpError(422, 'That file is empty.');

    reply.code(201);
    return repo.saveUpload({
      filename: file.filename,
      mime: file.mimetype,
      bytes,
      fieldId: (file.fields.fieldId as { value?: string } | undefined)?.value ?? '',
    });
  });

  app.get('/api/uploads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const upload = await repo.getUpload(id);
    if (!upload) return notFound(reply, 'File not found.');
    reply.header('content-type', upload.mime);
    reply.header('content-disposition', `inline; filename="${upload.filename.replace(/"/g, '')}"`);
    return reply.send(upload.bytes);
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
    const statuses = await outcomesByCandidate(block);

    const row = (candidate: Candidate) => {
      const entry = grouped.get(candidate.id);
      const status = statuses.get(candidate.id);
      return {
        candidate,
        scores: entry?.scores ?? [],
        consensus: entry?.consensus ?? null,
        submitted: entry?.submitted ?? 0,
        outcomeId: status?.outcomeId ?? null,
        proposedOutcomeId: proposedOutcome(entry?.consensus ?? null, outcomes),
        overridden: status?.overridden ?? false,
      };
    };

    // An evaluation sitting in a committee's phase scores that committee: its
    // candidates are the ones on each sitting, and each jury scores its own panel.
    const committee = committeeForEvaluation(found.track, id);
    if (committee) {
      const view = await committeeView(committee.id);
      return {
        block,
        criteria: config.criteria,
        method: config.method,
        scale: config.scale,
        voteRule: config.voteRule,
        requireComment: config.requireComment,
        outcomes,
        scope: { blockId: committee.id, name: committee.name },
        groups: await Promise.all(
          (view?.sessions ?? []).map(async (session) => ({
            sessionId: session.session.id,
            name: session.session.name,
            heldOn: session.session.heldOn,
            evaluators: await peopleByIds(session.session.jury),
            // Without assignment, every panel reviews the whole intake — the
            // plain case of colleagues reading everything.
            rows: (view?.config.assign
              ? session.assignments.map((a) => a.candidate)
              : found.intake.filter((c) => c.status !== 'Withdrawn')
            ).map(row),
          })),
        ),
      };
    }

    // Who reviews is a committee's to say. Without one, nobody scores this grid.
    return {
      block,
      criteria: config.criteria,
      method: config.method,
      scale: config.scale,
      voteRule: config.voteRule,
      requireComment: config.requireComment,
      outcomes,
      scope: null,
      groups: [],
    };
  });

  app.post('/api/blocks/:id/outcomes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const block = await repo.getBlock(id);
    if (!block) return notFound(reply, 'Block not found.');
    const input = parse(z.object({ candidateId: z.string(), outcomeId: z.string() }), req.body);
    await setOutcomeByHand(block, input.candidateId, input.outcomeId);
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
    // The evaluator is a person in the directory. The name is written alongside
    // as a snapshot of who scored that day, never as the link itself.
    const [person] = await peopleByIds([input.evaluatorId]);
    if (!person) throw new HttpError(422, 'That evaluator is not in the directory.');
    return repo.upsertScore({ ...input, blockId: id, evaluatorName: person.name });
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

  /** Put startups on the list the funnel did not send: by name, or by status. */
  app.post('/api/blocks/:id/selection/add', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(
      z
        .object({
          candidateIds: z.array(z.string()).optional(),
          fromOutcomeIds: z.array(z.string()).optional(),
          fromBlockId: z.string().nullable().optional(),
          outcome: z.enum(['pass', 'fail']).optional(),
        })
        .refine((v) => v.candidateIds?.length || v.fromOutcomeIds?.length, {
          message: 'Choose at least one startup or one status.',
        }),
      req.body,
    );
    return (await addToSelection(id, input)) ?? notFound(reply, 'Selection block not found.');
  });

  app.post('/api/blocks/:id/selection/remove', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { candidateId } = parse(z.object({ candidateId: z.string() }), req.body);
    return (await removeFromSelection(id, candidateId)) ?? notFound(reply, 'Selection block not found.');
  });

  app.post('/api/blocks/:id/selection/outcome', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(setOutcomeInput, req.body);
    return (await overrideOutcome(id, input.candidateId, input.outcome)) ?? notFound(reply, 'Selection not found.');
  });
}
