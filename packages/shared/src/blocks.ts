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
    blurb: 'Convene a jury on a date and assign the candidates they review.',
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
  { group: 'Programme delivery', types: ['workshop', 'mentoring', 'deliverable', 'event'] },
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
};

export const formFieldSchema = z.object({
  id: z.string(),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1),
  help: z.string().default(''),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  /** Shown as a column in the candidates table by default. */
  showInTable: z.boolean().default(false),
});

export type FormField = z.infer<typeof formFieldSchema>;

/* ------------------------------------------------------------------ */
/* Per-type configuration                                              */
/* ------------------------------------------------------------------ */

export const sourcingConfigSchema = z.object({
  opensAt: z.string().nullable().default(null),
  closesAt: z.string().nullable().default(null),
  target: z.number().int().min(0).default(0),
  channels: z.array(z.string()).default([]),
  eligibility: z.string().default(''),
});

export const applicationConfigSchema = z.object({
  opensAt: z.string().nullable().default(null),
  closesAt: z.string().nullable().default(null),
  intro: z.string().default(''),
  confirmation: z.string().default('Thank you. Your application has been received.'),
  /** Public form is reachable at /apply/:token while true. */
  published: z.boolean().default(false),
  publicToken: z.string().default(''),
  fields: z.array(formFieldSchema).default([]),
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
  /** Who scores. Names for now; they become directory references later. */
  evaluators: z.array(z.string()).default([]),
  /** Evaluators see each other's scores once they have submitted their own. */
  revealPeers: z.boolean().default(false),
  requireComment: z.boolean().default(false),
  /** Which candidates land here: everyone still in the funnel, or an explicit list. */
  intake: z.enum(['funnel', 'explicit']).default('funnel'),
});

export const committeeConfigSchema = z.object({
  heldAt: z.string().nullable().default(null),
  location: z.string().default(''),
  durationMinutes: z.number().int().min(0).default(120),
  juryIds: z.array(z.string()).default([]),
  /** Empty means every candidate still in the funnel. */
  candidateIds: z.array(z.string()).default([]),
  agenda: z.string().default(''),
});

export const SELECTION_METHODS = ['threshold', 'top_n', 'manual'] as const;
export type SelectionMethod = (typeof SELECTION_METHODS)[number];

export const selectionConfigSchema = z.object({
  /** A shortlist keeps the funnel open. A cohort closes it and forms the promotion. */
  outputKind: z.enum(['shortlist', 'cohort']).default('shortlist'),
  method: z.enum(SELECTION_METHODS).default('threshold'),
  threshold: z.number().min(0).default(70),
  topN: z.number().int().min(1).default(10),
  /** Which evaluation block feeds the score. Null = the most recent one before this block. */
  sourceBlockId: z.string().nullable().default(null),
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
