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
});

export type BlockOutcome = z.infer<typeof blockOutcomeSchema>;

export const DEFAULT_OUTCOMES: BlockOutcome[] = [
  { id: 'retained', label: 'Retained', tone: 'ok', minScore: 70 },
  { id: 'hold', label: 'On hold', tone: 'warn', minScore: 55 },
  { id: 'rejected', label: 'Not retained', tone: 'stop', minScore: null },
];

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

export const outreachRecipientsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('list'), emails: z.array(z.string()).default([]) }),
  /** Reserved for the directory's audience engine. Not selectable yet. */
  z.object({ kind: z.literal('audience'), query: z.string().default('') }),
]);

export type OutreachRecipients = z.infer<typeof outreachRecipientsSchema>;

export const sourcingConfigSchema = z.object({
  opensAt: z.string().nullable().default(null),
  closesAt: z.string().nullable().default(null),
  channels: z.array(z.string()).default([]),
  outreach: z
    .object({
      subject: z.string().default(''),
      body: z.string().default(''),
      recipients: outreachRecipientsSchema.default({ kind: 'list', emails: [] }),
    })
    .default({ subject: '', body: '', recipients: { kind: 'list', emails: [] } }),
});

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
  opensAt: z.string().nullable().default(null),
  closesAt: z.string().nullable().default(null),
  intro: z.string().default(''),
  confirmation: z.string().default('Thank you. Your application has been received.'),
  /** Public form is reachable at /apply/:token while true. */
  published: z.boolean().default(false),
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

export const evaluationCriterionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  help: z.string().default(''),
  weight: z.number().min(0).default(1),
  max: z.number().min(1).default(10),
});

export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;

export const evaluationConfigSchema = z.object({
  opensAt: z.string().nullable().default(null),
  closesAt: z.string().nullable().default(null),
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
});

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

export const committeeConfigSchema = z.object({
  format: z.enum(COMMITTEE_FORMATS).default('event'),
  /**
   * Startups split across panels, or every startup reviewed by every panel.
   * Off is the plain case: three colleagues reading the whole intake.
   */
  assign: z.boolean().default(true),
  /** Only meaningful for an event: nobody is invited to asynchronous work. */
  rsvpMode: z.enum(RSVP_MODES).default('slots'),
  rsvpDeadline: z.string().nullable().default(null),
});

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
  respondedAt: z.string().nullable().default(null),
});

export type CommitteeAssignment = z.infer<typeof committeeAssignmentSchema>;

export const SELECTION_METHODS = ['threshold', 'top_n', 'manual'] as const;
export type SelectionMethod = (typeof SELECTION_METHODS)[number];

export const selectionConfigSchema = z.object({
  /** A shortlist keeps the funnel open. A cohort closes it and forms the promotion. */
  outputKind: z.enum(['shortlist', 'cohort']).default('shortlist'),
  method: z.enum(SELECTION_METHODS).default('threshold'),
  threshold: z.number().min(0).default(70),
  topN: z.number().int().min(1).default(10),
  /** Which scoring block feeds it — an evaluation or a committee. Null = the nearest one upstream. */
  sourceBlockId: z.string().nullable().default(null),
  /**
   * Startups put on the list by hand, whatever the funnel did with them. This is
   * how a repêchage or a wildcard gets in without reopening the block upstream.
   */
  includeCandidateIds: z.array(z.string()).default([]),
  /**
   * Statuses that put a startup on the list on their own — the cut stops being
   * driven by points alone.
   */
  includeOutcomeIds: z.array(z.string()).default([]),
  /**
   * Whose statuses those are. Null = the block the score comes from. Pointing it
   * at an earlier block is what lets a startup the funnel dropped be fished back.
   */
  includeFromBlockId: z.string().nullable().default(null),
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
