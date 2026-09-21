import {
  blockStatus,
  brickClosedOn,
  newId,
  canApplyFor,
  candidateSchema,
  editionIsVisible,
  editionTakesInput,
  setOutcomeInput,
  submitApplicationInput,
  formPages,
  proposedOutcome,
  type ApplicationConfig,
  type Candidate,
  type EditionStatus,
  type EvaluationConfig,
  type SourcingChannel,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as dir from '../db/directory.js';
import { peopleByIds } from '../db/directory.js';
import * as repo from '../db/repo.js';
import { SESSION_COOKIE, accountForToken } from '../services/auth.js';
import { committeeForEvaluation, committeeView } from '../services/committee.js';
import { reviewsFor } from '../services/reviews.js';
import { outcomesByCandidate, outcomesOf, scoresByCandidate, setOutcomeByHand } from '../services/scoring.js';
import {
  funnelFor,
  intakeFor,
  overrideOutcome,
  publishSelection,
  rosterAt,
  selectionView,
} from '../services/selection.js';
import { HttpError, notFound, parse } from './util.js';
import { workspaceGuard } from './guard.js';

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
  // Everything below is the CEED workspace. Public routes name themselves.
  app.addHook('preHandler', workspaceGuard((url) => url.startsWith('/api/public/') || url === '/api/uploads/:id'));

  /* ---------------- candidates ---------------- */

  app.get('/api/editions/:id/candidates', async (req) => {
    const { id } = req.params as { id: string };
    const { trackId } = req.query as { trackId?: string };
    return repo.listCandidates(id, trackId);
  });

  /** One step of the funnel, opened: who stands there and under which word. */
  app.get('/api/blocks/:id/roster', async (req, reply) => {
    const { id } = req.params as { id: string };
    const context = await repo.blockContext(id);
    if (!context) return notFound(reply, 'Block not found.');
    return rosterAt(context.editionId, context.trackId, id);
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
        /** Who applied on its behalf. A candidacy with nobody on it is unreachable. */
        personId: z.string().optional(),
        /**
         * Which call this came in through. Naming it is what lets the "one
         * application per organisation" rule see a candidacy that was imported
         * rather than typed into the form.
         */
        originBlockId: z.string().optional(),
        source: z.string().optional(),
        answers: z.record(z.unknown()).optional(),
        /**
         * Who filed, and who else is behind the startup. These used to be typed
         * into the form and thrown away by this schema — the three fields were
         * not declared, and zod drops what it does not know.
         *
         * They do not belong in `answers`: a founder and a team are people in
         * the directory, affiliated to the organisation. That is the same place
         * the founder's own team page writes to.
         */
        contact: z
          .object({
            name: z.string().default(''),
            email: z.string().default(''),
            phone: z.string().default(''),
            role: z.string().default('Founder'),
          })
          .optional(),
        team: z
          .array(z.object({ name: z.string().min(1), email: z.string().default(''), role: z.string().default('') }))
          .default([]),
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

    /** The email tells two people apart when they share a name. */
    const personFor = async (name: string, email: string, phone = '', origin: 'manual' | 'team' = 'manual') => {
      const clean = name.trim();
      if (!clean) return null;
      const found =
        (email.trim() ? await dir.findByEmail('person', email) : null) ?? (await dir.findByName('person', clean));
      return (
        found ??
        (await dir.createRecord({ kind: 'person', name: clean, email: email.trim(), phone, country: 'Morocco', origin }))
      );
    };

    let personId = input.personId;
    if (!personId && input.contact?.name.trim()) {
      const person = await personFor(input.contact.name, input.contact.email, input.contact.phone);
      if (person) {
        personId = person.id;
        await dir.linkRecords({ personId: person.id, orgId, role: input.contact.role, access: 'admin' });
      }
    }

    for (const mate of input.team) {
      const person = await personFor(mate.name, mate.email, '', 'team');
      if (person) await dir.linkRecords({ personId: person.id, orgId, role: mate.role, access: 'member' });
    }

    reply.code(201);
    return repo.createCandidate({
      trackId: input.trackId,
      orgId,
      personId,
      originBlockId: input.originBlockId,
      answers: input.answers,
      editionId: id,
      source: input.source || 'Added by CEED',
    });
  });

  app.patch('/api/candidates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    // `answers` is patchable now: a candidacy typed in by hand is rarely right
    // the first time, and correcting it meant deleting and starting over.
    const patch = parse(
      candidateSchema
        .pick({
          source: true, status: true, trackId: true, mentor: true, cohortStatus: true,
          personId: true, originBlockId: true, answers: true,
        })
        .partial(),
      req.body,
    );
    return (await repo.updateCandidate(id, patch)) ?? notFound(reply, 'Candidate not found.');
  });

  app.delete('/api/candidates/:id', async (req, reply) => {
    await repo.deleteCandidate((req.params as { id: string }).id);
    reply.code(204);
  });

  /**
   * A new public link, which retires the old one immediately. This is what
   * makes a late applicant safe to let in: reopen the call, send the fresh link
   * to that one person, shut it again once they are through — and everybody who
   * kept the address from the first round finds nothing at it.
   */
  app.post('/api/blocks/:id/application/token', async (req, reply) => {
    const { id } = req.params as { id: string };
    const block = await repo.getBlock(id);
    if (!block || block.type !== 'application') return notFound(reply, 'Application block not found.');
    const config = block.config as ApplicationConfig;
    // Minted the same way the block's first token was, so the two are
    // indistinguishable to anything that reads them.
    const fresh = newId('form').replace('form_', '');
    const updated = await repo.updateBlock(id, { config: { ...config, publicToken: fresh } });
    return updated ?? notFound(reply, 'Application block not found.');
  });

  /* ---------------- public application form ---------------- */

  /**
   * Three layers, from the outside in: the edition decides whether this door
   * exists at all, the block decides whether it is switched on, and its own
   * window decides whether it is open today. A draft edition and an unpublished
   * block give the same answer as a wrong link, because neither is something a
   * stranger should learn about; a closed call says so, and says when.
   */
  const formState = (edition: { status: EditionStatus } | null, block: { type: 'application'; config: ApplicationConfig }) => {
    // A brick with nothing in it has no public existence, exactly like a draft
    // edition: the link resolves to nothing rather than to an empty form.
    const status = blockStatus(block);
    if (!edition || !editionIsVisible(edition.status) || status === 'not_configured') return null;
    if (!editionTakesInput(edition.status)) return 'closed' as const;
    return status === 'live' ? ('open' as const) : status === 'scheduled' ? ('not_open' as const) : ('closed' as const);
  };

  app.get('/api/public/forms/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await repo.findPublicForm(token);
    if (!found) return notFound(reply, 'This form does not exist.');
    const config = found.block.config as ApplicationConfig;
    const state = formState(found.edition, { type: 'application', config });
    if (!state) return notFound(reply, 'This form does not exist.');
    const closed = state === 'closed';
    const notYetOpen = state === 'not_open';
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
      // The date somebody arriving late is shown: the act if there was one, the
      // deadline otherwise. An edition marked completed has neither.
      closesAt: brickClosedOn(config),
      closedMessage: config.closedMessage,
      state: closed ? 'closed' : notYetOpen ? 'not_open' : 'open',
    };
  });

  /** A channel arrives as its id and is stored under its name, so the Startups
   *  table stays readable and attribution still matches either way. */
  const channelLabel = (channels: SourcingChannel[], source: string): string => {
    const trimmed = source.trim();
    if (!trimmed) return '';
    return channels.find((c) => c.id === trimmed)?.label ?? trimmed;
  };

  app.post('/api/public/forms/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await repo.findPublicForm(token);
    if (!found) return notFound(reply, 'This form does not exist.');
    const config = found.block.config as ApplicationConfig;
    if (formState(found.edition, { type: 'application', config }) !== 'open') {
      throw new HttpError(403, config.closedMessage || 'This call for applications is closed.');
    }

    // Applying is done signed in: the form knows who is filling it, so nothing
    // about the applicant is retyped and a candidacy points at a real record.
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) throw new HttpError(401, 'Sign in to apply.');
    // A provisional password opens one door, and it is not this one.
    if (account.mustChangePassword) {
      throw new HttpError(403, 'Choose your own password before applying.', { mustChangePassword: 'true' });
    }

    const input = parse(submitApplicationInput, req.body);
    // An application commits the organisation and carries the figures it declares,
    // so it stays with whoever holds the page. The team drafts; the founder signs.
    const access = await dir.accessOf(account.recordId, input.orgId);
    if (!access) throw new HttpError(403, 'You can only apply for an organisation you belong to.');
    if (!canApplyFor(access)) {
      throw new HttpError(403, 'Only an administrator of this organisation can submit its application.');
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
      // The form stamps the channel it came through: ?via= on the link, or the
      // question it asks when the link carried nothing.
      source: channelLabel(found.channels, input.source),
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

  /**
   * Outside the workspace guard because a juror reads these and is not staff.
   * An attachment is somebody's business plan, so it opens for three people and
   * no others: CEED, the organisation it belongs to, and a juror with that
   * candidacy on their own list.
   */
  app.get('/api/uploads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const account = await accountForToken(req.cookies[SESSION_COOKIE]);
    if (!account) throw new HttpError(401, 'Sign in to open this file.');
    if (account.mustChangePassword) {
      throw new HttpError(403, 'Choose your own password before going further.', { mustChangePassword: 'true' });
    }

    const upload = await repo.getUpload(id);
    if (!upload) return notFound(reply, 'File not found.');

    if (!account.staffRole) {
      const ownOrgs = await dir.orgIdsOf(account.recordId);
      const mine = Boolean(upload.orgId && ownOrgs.has(upload.orgId));
      const reviewing =
        !mine &&
        Boolean(upload.candidateId) &&
        (await reviewsFor(account.recordId)).some((panel) =>
          panel.items.some((item) => item.candidate.id === upload.candidateId),
        );
      // The same answer as a missing file: whoever asked has no business
      // knowing that this one exists.
      if (!mine && !reviewing) return notFound(reply, 'File not found.');
    }

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
        markedOutOf: config.markedOutOf,
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
      markedOutOf: config.markedOutOf,
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
  app.post('/api/blocks/:id/selection/outcome', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parse(setOutcomeInput, req.body);
    return (await overrideOutcome(id, input.candidateId, input.outcome)) ?? notFound(reply, 'Selection not found.');
  });
}
