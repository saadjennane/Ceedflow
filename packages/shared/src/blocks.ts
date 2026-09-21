import { z } from 'zod';

/**
 * Block types. Only the five recruitment-and-selection types are implemented;
 * the rest are declared so the enum and the library are stable from day one.
 */
export const BLOCK_TYPES = [
  'sourcing',
  'application',
  'evaluation',
  'committee',
  'selection',
  'workshop',
  'mentoring',
  'deliverable',
  'event',
  'campaign',
  'meeting',
  'custom',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockTypeSchema = z.enum(BLOCK_TYPES);

/** The five types the builder can currently create and configure. */
export const IMPLEMENTED_BLOCK_TYPES = [
  'sourcing',
  'application',
  'evaluation',
  'committee',
  'selection',
] as const satisfies readonly BlockType[];

export type ImplementedBlockType = (typeof IMPLEMENTED_BLOCK_TYPES)[number];

export interface BlockTypeMeta {
  type: BlockType;
  label: string;
  /** One line, written from the operator's side of the screen. */
  blurb: string;
  icon: string;
  implemented: boolean;
}

export const BLOCK_TYPE_META: Record<BlockType, BlockTypeMeta> = {
  sourcing: {
    type: 'sourcing',
    label: 'Sourcing',
    blurb: 'Open the call and track where candidates come from.',
    icon: 'megaphone',
    implemented: true,
  },
  application: {
    type: 'application',
    label: 'Application',
    blurb: 'Publish a form. Every submission creates a candidate.',
    icon: 'form',
    implemented: true,
  },
  evaluation: {
    type: 'evaluation',
    label: 'Evaluation',
    blurb: 'Score candidates against weighted criteria.',
    icon: 'star',
    implemented: true,
  },
  committee: {
    type: 'committee',
    label: 'Selection committee',
    blurb: 'Say who reviews and which startups they take — on a date, or spread over days.',
    icon: 'gavel',
    implemented: true,
  },
  selection: {
    type: 'selection',
    label: 'Selection',
    blurb: 'Cut the funnel. Publishes who moves on and who does not.',
    icon: 'filter',
    implemented: true,
  },
  workshop: { type: 'workshop', label: 'Workshop', blurb: 'Coming later.', icon: 'presentation', implemented: false },
  mentoring: { type: 'mentoring', label: 'Mentoring', blurb: 'Coming later.', icon: 'compass', implemented: false },
  deliverable: { type: 'deliverable', label: 'Deliverables', blurb: 'Coming later.', icon: 'file', implemented: false },
  event: { type: 'event', label: 'Event', blurb: 'Coming later.', icon: 'calendar', implemented: false },
  campaign: { type: 'campaign', label: 'Campaign', blurb: 'Coming later.', icon: 'send', implemented: false },
  meeting: { type: 'meeting', label: 'Meeting', blurb: 'Coming later.', icon: 'users', implemented: false },
  custom: { type: 'custom', label: 'Custom', blurb: 'Coming later.', icon: 'square', implemented: false },
};

export const BLOCK_LIBRARY: { group: string; types: BlockType[] }[] = [
  { group: 'Recruitment & selection', types: ['sourcing', 'application', 'evaluation', 'committee', 'selection'] },
  { group: 'Program delivery', types: ['workshop', 'mentoring', 'deliverable', 'event'] },
  { group: 'Coordination', types: ['campaign', 'meeting', 'custom'] },
];

/* ------------------------------------------------------------------ */
/* Form fields — shared by the application questionnaire               */
/* ------------------------------------------------------------------ */

export const FIELD_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'url',
  'number',
  'date',
  'select',
  'multiselect',
  'file',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  short_text: 'Short answer',
  long_text: 'Long answer',
  email: 'Email',
  phone: 'Phone',
  url: 'Link',
  number: 'Number',
  date: 'Date',
  select: 'Single choice',
  multiselect: 'Multiple choice',
  file: 'File upload',
};

/** Anything bigger is refused rather than silently truncated. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const formFieldSchema = z.object({
  id: z.string(),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1),
  help: z.string().default(''),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  /** Shown as a column in the candidates table by default. */
  showInTable: z.boolean().default(false),
  /** Which page of the form the question sits on. Ignored on a one-page form. */
  pageId: z.string().default(''),
});

export type FormField = z.infer<typeof formFieldSchema>;

/** A step of a multi-page form. */
export const formPageSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  intro: z.string().default(''),
});

export type FormPage = z.infer<typeof formPageSchema>;

/* ------------------------------------------------------------------ */
/* Per-type configuration                                              */
/* ------------------------------------------------------------------ */

/**
 * A status a block can put on a candidate. Configurable per block, because the
 * vocabulary differs between a screening and a jury day.
 */
export const blockOutcomeSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  tone: z.enum(['ok', 'warn', 'stop', 'neutral']).default('neutral'),
  /** Proposed automatically once the score reaches this. Null = never proposed. */
  minScore: z.number().nullable().default(null),
  /**
   * What a panel that did not agree lands on. Designated rather than inferred:
   * the fallback of a score grid is its worst band, and "we did not agree" must
   * not mean "rejected".
   */
  whenSplit: z.boolean().default(false),
});

export type BlockOutcome = z.infer<typeof blockOutcomeSchema>;

export const DEFAULT_OUTCOMES: BlockOutcome[] = [
  { id: 'retained', label: 'Retained', tone: 'ok', minScore: 70, whenSplit: false },
  { id: 'hold', label: 'Waitlist', tone: 'warn', minScore: 55, whenSplit: true },
  { id: 'rejected', label: 'Not retained', tone: 'stop', minScore: null, whenSplit: false },
];

/**
 * How a panel's votes become one status. A strict majority of the votes cast —
 * more than half, not merely the most — or everybody agreeing. Anything else
 * lands on the status marked `whenSplit`.
 */
export const VOTE_RULES = ['majority', 'unanimous'] as const;
export type VoteRule = (typeof VOTE_RULES)[number];

export interface VoteTally {
  outcomeId: string | null;
  votes: number;
  cast: number;
  /** True when the rule was not met and the fallback answered instead. */
  split: boolean;
}

export function tallyVotes(votes: string[], outcomes: BlockOutcome[], rule: VoteRule): VoteTally {
  const cast = votes.filter(Boolean).length;
  const fallback = outcomes.find((o) => o.whenSplit)?.id ?? null;
  if (!cast) return { outcomeId: null, votes: 0, cast: 0, split: false };

  const counts = new Map<string, number>();
  for (const vote of votes.filter(Boolean)) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  const [top, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  const met = rule === 'unanimous' ? count === cast : count > cast / 2;
  return met
    ? { outcomeId: top, votes: count, cast, split: false }
    : { outcomeId: fallback, votes: count, cast, split: true };
}

/**
 * Whether reviewers may still file anything. An empty date is no deadline —
 * never a closed door, which is why both sides are checked separately.
 */
export function windowState(
  opensAt: string | null,
  closesAt: string | null,
  today = new Date().toISOString().slice(0, 10),
): 'open' | 'not_open' | 'closed' {
  if (opensAt && opensAt > today) return 'not_open';
  if (closesAt && closesAt < today) return 'closed';
  return 'open';
}

/**
 * Who decides whether a brick is open to the outside. `auto` reads the dates,
 * which is the normal case; the other two are a hand laid on it, and a hand
 * beats a plan in **both** directions — forcing it open is the only way to let
 * one latecomer through without moving a deadline already published.
 */
export const BRICK_VISIBILITY = ['auto', 'open', 'closed'] as const;
export type BrickVisibility = (typeof BRICK_VISIBILITY)[number];

/** The window and the override a brick carries, whatever kind of brick it is. */
export interface BrickWindow {
  opensAt: string | null;
  closesAt: string | null;
  visibility: BrickVisibility;
  /** When the override was set, which is the date a visitor is shown. */
  visibilitySetAt: string | null;
  /**
   * The first time this door was ever open. Never cleared.
   *
   * Without it a brick that has been live and is shut again falls back to
   * *scheduled*, which reads as never started. Closed is a state you reach, and
   * reaching it has to be remembered.
   */
  openedAt: string | null;
}

/**
 * Where a brick stands, in one word. Four, and each earns its place: the first
 * says the brick has nothing in it yet, and the other three say whether the
 * door is passable today and — when it is not — which side of the window we are
 * on. Derived, never stored.
 */
export const BRICK_STATUSES = ['not_configured', 'scheduled', 'live', 'closed'] as const;
export type BrickStatus = (typeof BRICK_STATUSES)[number];

export const BRICK_STATUS_LABEL: Record<BrickStatus, string> = {
  not_configured: 'Not configured',
  scheduled: 'Scheduled',
  live: 'Live',
  closed: 'Closed',
};

export const BRICK_STATUS_TONE: Record<BrickStatus, 'ok' | 'info' | 'warn' | ''> = {
  not_configured: '',
  scheduled: 'info',
  live: 'ok',
  closed: 'warn',
};

/**
 * Where a configured brick stands against its own window.
 *
 * A lifecycle rather than a reading of dates: **closed is a state you reach**,
 * not the one you start in. A brick that has what it needs but has never been
 * opened is *scheduled* — ready and waiting — whether or not a date says when.
 * Calling that one "closed" read as *finished* and made a jury day planned for
 * the 28th look like a round that was already over.
 *
 * Closing it by hand is the exception, and an honest one: you meant it.
 *
 * It still takes a date or a hand to open a brick. Silence is not consent — it
 * is simply no longer mistaken for an ending.
 */
export function brickStatus(
  config: BrickWindow,
  configured: boolean,
  today = new Date().toISOString().slice(0, 10),
): BrickStatus {
  if (!configured) return 'not_configured';
  if (config.visibility === 'open') return 'live';
  if (config.visibility === 'closed') return 'closed';
  if (config.opensAt && config.opensAt > today) return 'scheduled';
  if (config.closesAt && config.closesAt < today) return 'closed';
  if (config.opensAt || config.closesAt) return 'live';
  // No dates and nothing held: shut. Which word depends on whether this door
  // has ever been open — never started is not the same as over.
  return config.openedAt ? 'closed' : 'scheduled';
}

/** The date to show beside a closed brick: the act if there was one, else the plan. */
export const brickClosedOn = (config: BrickWindow): string | null =>
  config.visibility === 'closed' ? config.visibilitySetAt : config.closesAt;

/** The fields every brick with a window carries, with their defaults. */
export const brickWindowFields = {
  opensAt: z.string().nullable().default(null),
  closesAt: z.string().nullable().default(null),
  visibility: z.enum(BRICK_VISIBILITY).default('auto'),
  visibilitySetAt: z.string().nullable().default(null),
  openedAt: z.string().nullable().default(null),
};


/** The status a score earns: the best band it reaches. No score, no status. */
export function proposedOutcome(score: number | null, outcomes: BlockOutcome[]): string | null {
  if (score === null) return null;
  const bands = outcomes
    .filter((o) => o.minScore !== null)
    .sort((a, b) => (b.minScore ?? 0) - (a.minScore ?? 0));
  return bands.find((o) => score >= (o.minScore ?? 0))?.id ?? outcomes[outcomes.length - 1]?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Sourcing — the outreach that opens the call                         */
/* ------------------------------------------------------------------ */

/** A channel's id travels in the form's ?via=, so it has to survive a URL. */
export function channelSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'channel'
  );
}

/**
 * Where the call is pushed. A channel is a thing rather than a tag because it
 * carries a link: the form stamps the candidate with it, so attribution stops
 * depending on what an applicant remembers.
 */
export const sourcingChannelSchema = z.preprocess(
  // Channels used to be bare strings. An old block still reads.
  (raw) => (typeof raw === 'string' ? { id: channelSlug(raw), label: raw } : raw),
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
  }),
);

export type SourcingChannel = z.infer<typeof sourcingChannelSchema>;

/**
 * Who the call is written to, as a question asked of the directory rather than a
 * list of addresses. Roles and tags widen it; named records add to whatever they
 * catch.
 */
export const sourcingAudienceSchema = z.object({
  roles: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  /** Organisations or people picked one by one, on top of the filter. */
  recordIds: z.array(z.string()).default([]),
});

export type SourcingAudience = z.infer<typeof sourcingAudienceSchema>;

export const sourcingConfigSchema = z.object({
  channels: z.array(sourcingChannelSchema).default([]),
  audience: sourcingAudienceSchema.default({ roles: [], tags: [], recordIds: [] }),
  outreach: z
    .object({
      subject: z.string().default(''),
      body: z.string().default(''),
      /** Which channel a mailed invitation counts as, so its link goes in. */
      channelId: z.string().nullable().default(null),
    })
    .default({ subject: '', body: '', channelId: null }),
});

/** Where the form's link for one channel points. */
export function applyLink(token: string, channelId: string | null, origin = ''): string {
  const path = `/apply/${token}`;
  const url = channelId ? `${path}?via=${encodeURIComponent(channelId)}` : path;
  return origin ? origin.replace(/\/$/, '') + url : url;
}

/**
 * A condition the applicant ticks before starting. Informative ones are read and
 * acknowledged; a gate holds the form shut until every box is ticked.
 */
export const eligibilitySchema = z.object({
  mode: z.enum(['informative', 'gate']).default('informative'),
  criteria: z.array(z.object({ id: z.string(), label: z.string().min(1) })).default([]),
});

export type Eligibility = z.infer<typeof eligibilitySchema>;

export const applicationConfigSchema = z.object({
  ...brickWindowFields,
  /** What somebody arriving late is told. Empty falls back to a plain sentence. */
  closedMessage: z.string().default(''),
  intro: z.string().default(''),
  confirmation: z.string().default('Thank you. Your application has been received.'),
  publicToken: z.string().default(''),
  /** Everything on one page, or split into named steps. */
  layout: z.enum(['single', 'paged']).default('single'),
  pages: z.array(formPageSchema).default([]),
  fields: z.array(formFieldSchema).default([]),
  eligibility: eligibilitySchema.default({ mode: 'informative', criteria: [] }),

  /* ---- Settings ---- */
  /** Applicants may reopen and change what they sent, while the call is open. */
  allowEditAfterSubmit: z.boolean().default(false),
  /** Waits on a mail provider. Recorded as intent until one is connected. */
  confirmationEmail: z.boolean().default(true),
  notifyOnSubmit: z.array(z.string()).default([]),
  /** Refuse a second application from the same organisation. */
  onePerOrganisation: z.boolean().default(true),
});

/** What is actually marked. A section's children are these. */
export const criterionLeafSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  help: z.string().default(''),
  /**
   * What share of the final mark this criterion carries, as a percentage, or
   * null for "take an equal cut of whatever is left".
   *
   * It replaces a pair of numbers that looked alike and were not: a weight,
   * which decided, and a `marked out of`, which was divided out before any
   * weighing and decided nothing — so a criterion marked out of 20 read as
   * twice as important and was not. The scale is now one decision for the whole
   * grid, and this is the only dial that moves anything.
   */
  share: z.number().min(0).max(100).nullable().default(null),
  /** Read from grids written before the scale moved onto the block. */
  weight: z.number().min(0).default(1),
  max: z.number().min(1).default(10),
});

/**
 * A criterion is marked directly, or it is a **section** whose children are.
 * One level only: deeper than that is a spreadsheet, not a grid.
 */
export const evaluationCriterionSchema = criterionLeafSchema.extend({
  children: z.array(criterionLeafSchema).default([]),
});

export type CriterionLeaf = z.infer<typeof criterionLeafSchema>;
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;

/** The default scale of a grid, and what a new evaluation is marked out of. */
export const DEFAULT_MARKED_OUT_OF = 10;

/**
 * What each criterion really carries, as a percentage of the final mark.
 *
 * A criterion you left blank takes an equal cut of whatever the ones you set
 * have not claimed — so a grid nobody has weighted is an even average, which is
 * the common case and needs no thought. When every criterion is set and they do
 * not add up to a hundred, they are scaled to fit rather than refused: the rule
 * is ours, the last word is yours.
 */
export function criterionShares(criteria: EvaluationCriterion[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!criteria.length) return out;
  const set = criteria.filter((c) => c.share !== null);
  const blank = criteria.filter((c) => c.share === null);
  const claimed = set.reduce((n, c) => n + (c.share ?? 0), 0);

  if (blank.length) {
    const left = Math.max(0, 100 - claimed) / blank.length;
    for (const c of set) out.set(c.id, c.share ?? 0);
    for (const c of blank) out.set(c.id, left);
    return out;
  }
  // All of them set: scale to a hundred so the arithmetic still holds.
  for (const c of set) out.set(c.id, claimed ? ((c.share ?? 0) / claimed) * 100 : 0);
  return out;
}

/** What is left to hand out, and to how many criteria. Null when none is blank. */
export function sharesLeft(criteria: EvaluationCriterion[]): { left: number; among: number } | null {
  const blank = criteria.filter((c) => c.share === null);
  if (!blank.length) return null;
  const claimed = criteria.reduce((n, c) => n + (c.share ?? 0), 0);
  return { left: Math.max(0, 100 - claimed), among: blank.length };
}

/** More than a hundred handed out, which the grid will scale back. */
export function sharesOver(criteria: EvaluationCriterion[]): number {
  return Math.max(0, criteria.reduce((n, c) => n + (c.share ?? 0), 0) - 100);
}

/**
 * The things a mark is given on, each carrying the share of the final mark it
 * really has. A criterion's mark is the plain average of its sub-criteria —
 * they are points to consider under one heading, not weights of their own.
 */
export function gridLeaves(
  criteria: EvaluationCriterion[],
  markedOutOf = DEFAULT_MARKED_OUT_OF,
): CriterionLeaf[] {
  const shares = criterionShares(criteria);
  return criteria.flatMap((criterion) => {
    const share = shares.get(criterion.id) ?? 0;
    if (!criterion.children.length) {
      return [{ ...criterion, weight: share, max: markedOutOf }];
    }
    return criterion.children.map((child) => ({
      ...child,
      weight: share / criterion.children.length,
      max: markedOutOf,
    }));
  });
}

/** What share of the final score a leaf carries, as a percentage. */
export function leafShare(criteria: EvaluationCriterion[], leafId: string): number {
  const leaves = gridLeaves(criteria);
  const total = leaves.reduce((n, l) => n + l.weight, 0);
  const leaf = leaves.find((l) => l.id === leafId);
  return total && leaf ? Math.round((leaf.weight / total) * 100) : 0;
}

/**
 * What an evaluator gives. A **score** is marks on a grid, weighted into a
 * number out of 100. A **verdict** is the status itself: the panel votes in the
 * same words the block produces, and a majority — or unanimity — settles it.
 */
export const EVALUATION_METHODS = ['score', 'verdict'] as const;
export type EvaluationMethod = (typeof EVALUATION_METHODS)[number];

/** How a mark is given. Stars are a rendering of a mark out of five. */
export const EVALUATION_SCALES = ['points', 'stars'] as const;
export type EvaluationScale = (typeof EVALUATION_SCALES)[number];

/**
 * A grid written before the scale moved onto the block, read without changing
 * what it decided.
 *
 * Two things are carried across. The weights, which used to be relative
 * numbers, become the shares they amounted to — leaving them behind would
 * quietly flatten a grid where Team counted three times Impact. And the scale,
 * which used to sit on each criterion, is taken from them when they agree:
 * marks are stored raw, so reading a mark of 8 against the wrong maximum is how
 * a score changes meaning without anybody touching it.
 */
const carryOldGrid = (value: unknown): unknown => {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return v;
  const criteria = Array.isArray(v.criteria) ? (v.criteria as Record<string, unknown>[]) : null;
  if (!criteria?.length) return v;
  const out = { ...v };

  if (out.markedOutOf === undefined) {
    const maxes = new Set(criteria.map((c) => (typeof c.max === 'number' ? c.max : DEFAULT_MARKED_OUT_OF)));
    out.markedOutOf = maxes.size === 1 ? [...maxes][0] : DEFAULT_MARKED_OUT_OF;
  }

  return out;
};

/**
 * Stars are a scale of five. Nothing said so, so a grid marked in stars was
 * divided by whatever `marked out of` happened to be — ten by default, which
 * made a perfect five stars worth fifty out of a hundred. The scale follows the
 * way of marking rather than being asked twice.
 */
const starsAreFive = (value: unknown): unknown => {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return v;
  return v.scale === 'stars' ? { ...v, markedOutOf: 5 } : v;
};

const carryWeights = (value: unknown): unknown => {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return v;
  const criteria = Array.isArray(v.criteria) ? (v.criteria as Record<string, unknown>[]) : null;
  if (!criteria?.length) return v;
  const out = { ...v };
  const untouched = criteria.every((c) => c.share === undefined || c.share === null);
  const weights = criteria.map((c) => (typeof c.weight === 'number' ? c.weight : 1));
  const total = weights.reduce((n, w) => n + w, 0);
  // Equal weights already mean "equal", which is what a blank share says.
  if (untouched && total > 0 && new Set(weights).size > 1) {
    out.criteria = criteria.map((c, i) => ({ ...c, share: Math.round((weights[i] / total) * 1000) / 10 }));
  }
  return out;
};

export const evaluationConfigSchema = z.preprocess(
  (value) => starsAreFive(carryWeights(carryOldGrid(value))),
  z.object({
  method: z.enum(EVALUATION_METHODS).default('score'),
  scale: z.enum(EVALUATION_SCALES).default('points'),
  /**
   * What every criterion is marked out of. One decision for the grid rather
   * than one per line: the number never decided importance anyway, so asking it
   * again on each criterion only made it look as though it did.
   */
  markedOutOf: z.number().int().min(2).max(100).default(DEFAULT_MARKED_OUT_OF),
  voteRule: z.enum(VOTE_RULES).default('majority'),
  /** Empty dates mean no deadline at all; the override beats them either way. */
  ...brickWindowFields,
  criteria: z.array(evaluationCriterionSchema).default([]),
  requireComment: z.boolean().default(false),
  /** The statuses this evaluation can put on a candidate. */
  outcomes: z.array(blockOutcomeSchema).default(DEFAULT_OUTCOMES),
  /**
   * The committee whose panels this evaluation scores. Null resolves to one in
   * the same phase, which is how dropping the two together works; name a block
   * to pin it elsewhere. An evaluation with no committee has nobody to score
   * it — who reviews is the committee's to say, always.
   */
    scopeBlockId: z.string().nullable().default(null),
  }),
);

/* ------------------------------------------------------------------ */
/* Selection committee — one block, N sittings                          */
/* ------------------------------------------------------------------ */

/**
 * How a seated startup gets its time.
 * - 'slots'   the startup picks from what is free, Calendly-style.
 * - 'confirm' the team gives it a time, the startup confirms or declines it.
 * - 'none'    no invitation at all; the team places everyone and tells them how it likes.
 */
export const RSVP_MODES = ['none', 'confirm', 'slots'] as const;
export type RsvpMode = (typeof RSVP_MODES)[number];

/**
 * The committee organises the sittings. It does not score — an Evaluation block
 * in the same phase does that, per committee.
 */
/**
 * Reviewing happens two ways. An **event** is situated: a date, hours, a slot
 * per startup, invitations. **Asynchronous** work is spread out — people call,
 * read and qualify from their desk over days. Both need the same thing from the
 * model: who reviews, and which startups.
 */
export const COMMITTEE_FORMATS = ['event', 'async'] as const;
export type CommitteeFormat = (typeof COMMITTEE_FORMATS)[number];

/**
 * Two doors hang off a committee, and they are not the same door.
 *
 * The block's own window says whether a juror sees the panel and the startups
 * on it — reading, not marking, because what may be marked is the evaluation's
 * business. The `rsvp` window says whether the startups themselves may pick a
 * slot. A jury can be looking at its list days before the booking page opens,
 * and the booking page shuts long before the sitting.
 */
export const committeeConfigSchema = z.preprocess(
  (value) => {
    // `rsvpDeadline` was the booking page's only date before it had a window of
    // its own. Carried across on read so nothing configured is lost.
    const v = value as Record<string, unknown> | null;
    if (!v || typeof v !== 'object') return v;
    const legacy = v.rsvpDeadline;
    if (!legacy || (v.rsvp as Record<string, unknown> | undefined)?.closesAt) return v;
    return { ...v, rsvp: { ...(v.rsvp as object ?? {}), closesAt: legacy } };
  },
  z.object({
    format: z.enum(COMMITTEE_FORMATS).default('event'),
    /**
     * Startups split across panels, or every startup reviewed by every panel.
     * Off is the plain case: three colleagues reading the whole intake.
     */
    assign: z.boolean().default(true),
    /** Only meaningful for an event: nobody is invited to asynchronous work. */
    rsvpMode: z.enum(RSVP_MODES).default('slots'),
    /** The panel as a juror sees it: the list, open or not. */
    ...brickWindowFields,
    /** The booking page the startups answer on. Its own door, its own dates. */
    rsvp: z
      .object(brickWindowFields)
      .default({ opensAt: null, closesAt: null, visibility: 'auto', visibilitySetAt: null, openedAt: null }),
  }),
);

/** A stretch of the day a sitting actually pitches in. A day has several. */
export const timeWindowSchema = z.object({
  startsAt: z.string().default('09:00'),
  endsAt: z.string().default('12:00'),
});

export type TimeWindow = z.infer<typeof timeWindowSchema>;

/** One sitting. Its slots are derived from its windows and the time per startup. */
/**
 * A panel: who reviews, and — when the committee is an event — when they sit.
 * The dates and hours below mean nothing for asynchronous work and are ignored.
 */
export const committeeSessionSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  name: z.string().min(1),
  heldOn: z.string().nullable().default(null),
  /** 'HH:MM', local to the edition's city. A day can run several stretches. */
  windows: z.array(timeWindowSchema).default([{ startsAt: '09:00', endsAt: '12:00' }]),
  minutesPerStartup: z.number().int().min(5).default(25),
  location: z.string().default(''),
  /** Ids of people in the directory, resolved for display by the committee view. */
  jury: z.array(z.string()).default([]),
  position: z.number().int().default(0),
});

export type CommitteeSession = z.infer<typeof committeeSessionSchema>;

export interface CommitteeSlot {
  index: number;
  startsAt: string;
  endsAt: string;
  /** Which stretch of the day it belongs to, so the UI can show the breaks. */
  windowIndex: number;
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Slots are never stored — the windows and the time per startup are the truth. */
export function sessionSlots(session: Pick<CommitteeSession, 'windows' | 'minutesPerStartup'>): CommitteeSlot[] {
  const step = Math.max(5, session.minutesPerStartup);
  const slots: CommitteeSlot[] = [];
  let index = 0;
  session.windows.forEach((window, windowIndex) => {
    const end = toMinutes(window.endsAt);
    for (let at = toMinutes(window.startsAt); at + step <= end; at += step) {
      slots.push({ index: index++, startsAt: toClock(at), endsAt: toClock(at + step), windowIndex });
    }
  });
  return slots;
}

/** Total pitching time on offer, in minutes. */
export function windowMinutes(windows: TimeWindow[]): number {
  return windows.reduce((n, w) => n + Math.max(0, toMinutes(w.endsAt) - toMinutes(w.startsAt)), 0);
}

export const RSVP_STATES = ['pending', 'confirmed', 'declined'] as const;
export type RsvpState = (typeof RSVP_STATES)[number];

export const committeeAssignmentSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  candidateId: z.string(),
  /** The candidate's personal link to confirm or pick a slot. */
  token: z.string(),
  rsvpState: z.enum(RSVP_STATES).default('pending'),
  slotIndex: z.number().int().nullable().default(null),
  /**
   * Where it sits in the order they were put on this sitting, which is the
   * order Fill slots follows. Stored, because the row order of a table that is
   * edited all day is not an order.
   */
  position: z.number().int().default(0),
  respondedAt: z.string().nullable().default(null),
});

export type CommitteeAssignment = z.infer<typeof committeeAssignmentSchema>;

/**
 * A selection is a funnel, nothing more: the statuses of one block decide who
 * reaches the next phase. The band that earns a status lives in the Evaluation,
 * so a score is turned into a decision in exactly one place.
 */
export const selectionConfigSchema = z.object({
  /** A shortlist keeps the funnel open. A cohort closes it and forms the promotion. */
  outputKind: z.enum(['shortlist', 'cohort']).default('shortlist'),
  /** Whose statuses decide. Null = the nearest evaluation before this block. */
  fromBlockId: z.string().nullable().default(null),
  /** The statuses that move on. None picked means the rule passes nobody. */
  passOutcomeIds: z.array(z.string()).default([]),
  passLabel: z.string().default('Shortlisted'),
  failLabel: z.string().default('Not selected'),
  publishedAt: z.string().nullable().default(null),
});

export const blockConfigSchemas = {
  sourcing: sourcingConfigSchema,
  application: applicationConfigSchema,
  evaluation: evaluationConfigSchema,
  committee: committeeConfigSchema,
  selection: selectionConfigSchema,
} as const;

export type SourcingConfig = z.infer<typeof sourcingConfigSchema>;
export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;
export type EvaluationConfig = z.infer<typeof evaluationConfigSchema>;
export type CommitteeConfig = z.infer<typeof committeeConfigSchema>;
export type SelectionConfig = z.infer<typeof selectionConfigSchema>;

export type BlockConfigMap = {
  sourcing: SourcingConfig;
  application: ApplicationConfig;
  evaluation: EvaluationConfig;
  committee: CommitteeConfig;
  selection: SelectionConfig;
};

export type AnyBlockConfig = BlockConfigMap[ImplementedBlockType] | Record<string, unknown>;

/**
 * The form as the applicant walks it. One page or several, both sides read it
 * the same way, and a question whose page was deleted still shows up on the first.
 */
export function formPages(config: ApplicationConfig): { page: FormPage; fields: FormField[] }[] {
  if (config.layout !== 'paged' || !config.pages.length) {
    return [{ page: { id: '', name: 'Your application', intro: '' }, fields: config.fields }];
  }
  const known = new Set(config.pages.map((p) => p.id));
  return config.pages.map((page, index) => ({
    page,
    fields: config.fields.filter(
      (field) => field.pageId === page.id || (index === 0 && !known.has(field.pageId)),
    ),
  }));
}

/* ------------------------------------------------------------------ */
/* A block's door                                                      */
/* ------------------------------------------------------------------ */

/** A committee carries two doors; everything else carries one. */
export type BlockDoor = 'main' | 'rsvp';

/**
 * Whether there is anything behind the door yet.
 *
 * Content only — a date is not required, and that is a deliberate choice about
 * who is in charge. An internal review has no schedule: it happens when it
 * happens, and the toggle is how it opens. A rule that guides is useful; the
 * same rule made blocking would have left a perfectly ready block unopenable.
 *
 * Deliberately the lowest bar that is still true: one question, one criterion,
 * one sitting. Judging whether the questions are *good* is not this function's
 * business.
 */
export function blockConfigured(
  block: { type: BlockType; config: unknown },
  door: BlockDoor = 'main',
  sittings = 0,
): boolean {
  switch (block.type) {
    case 'application':
      return (block.config as ApplicationConfig).fields.length > 0;
    case 'evaluation': {
      const c = block.config as EvaluationConfig;
      return c.method === 'verdict' ? c.outcomes.length > 0 : gridLeaves(c.criteria).length > 0;
    }
    case 'committee': {
      const c = block.config as CommitteeConfig;
      // The booking page needs somebody to invite before it means anything.
      if (door === 'rsvp') return c.rsvpMode !== 'none' && sittings > 0;
      return sittings > 0;
    }
    default:
      return true;
  }
}

/**
 * The window a door reads from.
 *
 * A committee's panel falls back to its first sitting when no date was set on
 * the door: a jury day planned for the 28th is scheduled for the 28th, and a
 * date on the door itself overrides that to open the list earlier.
 */
export function blockWindow(
  block: { type: BlockType; config: unknown; nextSittingOn?: string | null },
  door: BlockDoor = 'main',
): BrickWindow {
  if (block.type === 'committee' && door === 'rsvp') return (block.config as CommitteeConfig).rsvp;
  const window = block.config as BrickWindow;
  if (block.type === 'committee' && !window.opensAt && block.nextSittingOn) {
    return { ...window, opensAt: block.nextSittingOn };
  }
  return window;
}

/**
 * One reading for the whole product: the badge on the canvas, the public form,
 * the booking page and the evaluator space all ask this and get the same
 * answer.
 */
export function blockStatus(
  block: { type: BlockType; config: unknown; nextSittingOn?: string | null },
  door: BlockDoor = 'main',
  sittings = 0,
  today = new Date().toISOString().slice(0, 10),
): BrickStatus {
  return brickStatus(blockWindow(block, door), blockConfigured(block, door, sittings), today);
}

/** What a door is still waiting for, in one line, or null when it is ready. */
export function blockMissing(
  block: { type: BlockType; config: unknown; nextSittingOn?: string | null },
  door: BlockDoor = 'main',
  sittings = 0,
): string | null {
  if (blockConfigured(block, door, sittings)) return null;
  if (block.type === 'application') return 'Add a question';
  if (block.type === 'evaluation') {
    return (block.config as EvaluationConfig).method === 'verdict' ? 'Name a status' : 'Add a criterion';
  }
  if (block.type === 'committee') return 'Create a sitting';
  return null;
}

export function isImplemented(type: BlockType): type is ImplementedBlockType {
  return (IMPLEMENTED_BLOCK_TYPES as readonly string[]).includes(type);
}

/** Parse a stored JSONB config, filling in every default. Unknown types pass through. */
export function parseBlockConfig(type: BlockType, raw: unknown): AnyBlockConfig {
  if (!isImplemented(type)) return (raw ?? {}) as Record<string, unknown>;
  return blockConfigSchemas[type].parse(raw ?? {}) as AnyBlockConfig;
}

export function defaultBlockConfig(type: BlockType): AnyBlockConfig {
  return parseBlockConfig(type, {});
}

export function defaultBlockName(type: BlockType): string {
  return BLOCK_TYPE_META[type].label;
}

/**
 * Where the work is, among bricks of one kind. A work screen opens on this one
 * unless somebody picked another.
 *
 * Reading order settles ties, so the funnel still reads left to right; what it
 * does not do is decide on its own. Opening on the first brick meant landing on
 * a round closed weeks ago while the jury day planned for next week sat two
 * clicks away.
 */
const AT_WORK: Record<BrickStatus, number> = {
  live: 0,        // happening now
  scheduled: 1,   // next up
  closed: 2,      // done, still readable
  not_configured: 3, // nothing there yet
};

export function rankAtWork(
  block: { type: BlockType; config: unknown; sittings?: number; nextSittingOn?: string | null },
  today = new Date().toISOString().slice(0, 10),
): number {
  return AT_WORK[blockStatus(block, 'main', block.sittings ?? 0, today)];
}

export function blockAtWork<T extends { type: BlockType; config: unknown; sittings?: number; nextSittingOn?: string | null }>(
  blocks: T[],
  today = new Date().toISOString().slice(0, 10),
): T | null {
  if (!blocks.length) return null;
  return blocks.reduce((best, block) =>
    rankAtWork(block, today) < rankAtWork(best, today) ? block : best,
  );
}
