import { z } from 'zod';
import {
  blockOutcomeSchema,
  blockTypeSchema,
  type AnyBlockConfig,
  type BlockType,
  type EvaluationConfig,
  type SelectionConfig,
} from './blocks.js';

/* ------------------------------------------------------------------ */
/* Program                                                           */
/* ------------------------------------------------------------------ */

export const PROGRAM_TYPES = [
  'Incubation',
  'Acceleration',
  'Pre-incubation',
  'Bootcamp',
  'Competition',
  'Mentoring',
] as const;

export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const programSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  code: z.string().default(''),
  type: z.string().default('Incubation'),
  summary: z.string().default(''),
  partner: z.string().default(''),
  colour: z.string().default('#2F5BFF'),
  /**
   * The words this programme judges in. An evaluation inherits them when it is
   * created and then owns its copy — changing them here never rewrites a round
   * already judged in the old ones. Empty falls back to the built-in set.
   */
  statuses: z.array(blockOutcomeSchema).default([]),
  createdAt: z.string(),
});

export type Program = z.infer<typeof programSchema>;

/* ------------------------------------------------------------------ */
/* Edition                                                             */
/* ------------------------------------------------------------------ */

/**
 * Where an edition stands, and it decides something — which is what separates
 * this from the four it replaces, where `Published` and `Running` differed by a
 * word on a badge and neither was ever read.
 *
 * Draft hides every external door. Live opens them, each still subject to its
 * own window. Completed leaves the edition readable while nothing more can be
 * filed: a juror still reads the marks they gave, a startup still sees the form
 * it answered.
 */
export const EDITION_STATUSES = ['Draft', 'Live', 'Completed'] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];

export const EDITION_STATUS_HINT: Record<EditionStatus, string> = {
  Draft: 'Nothing outside CEED can see this edition.',
  Live: 'The forms, the booking page and the evaluator space are reachable.',
  Completed: 'Still readable from outside. Nothing more can be filed.',
};

/** Whether an external door may be reached at all. */
export const editionIsVisible = (status: EditionStatus) => status !== 'Draft';
/** Whether anything may still be filed through one. */
export const editionTakesInput = (status: EditionStatus) => status === 'Live';

export const editionSchema = z.object({
  id: z.string(),
  programId: z.string(),
  name: z.string().min(1),
  status: z.enum(EDITION_STATUSES).default('Draft'),
  startsOn: z.string().nullable().default(null),
  endsOn: z.string().nullable().default(null),
  city: z.string().default(''),
  /** The mentors this edition can draw on. Names for now. */
  mentors: z.array(z.string()).default([]),
  position: z.number().int().default(0),
  createdAt: z.string(),
});

export type Edition = z.infer<typeof editionSchema>;

/* ------------------------------------------------------------------ */
/* Track — every edition has at least one                              */
/* ------------------------------------------------------------------ */

export const trackSchema = z.object({
  id: z.string(),
  editionId: z.string(),
  name: z.string().min(1),
  /** The track created with the edition. Cannot be deleted, can be renamed. */
  isDefault: z.boolean().default(false),
  position: z.number().int().default(0),
});

export type Track = z.infer<typeof trackSchema>;

/* ------------------------------------------------------------------ */
/* Phase and block                                                     */
/* ------------------------------------------------------------------ */

export const phaseSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  name: z.string().min(1),
  startsOn: z.string().nullable().default(null),
  endsOn: z.string().nullable().default(null),
  position: z.number().int().default(0),
});

export type Phase = z.infer<typeof phaseSchema>;

export const blockSchema = z.object({
  id: z.string(),
  phaseId: z.string(),
  type: blockTypeSchema,
  name: z.string().min(1),
  position: z.number().int().default(0),
  config: z.record(z.unknown()).default({}),
});

export type BlockRow = z.infer<typeof blockSchema>;

export interface Block extends Omit<BlockRow, 'config'> {
  config: AnyBlockConfig;
  /**
   * How many sittings hang off a committee. Read alongside the block because a
   * committee with none has nothing behind its door, and a badge that cannot
   * see that would call an empty committee ready.
   */
  sittings?: number;
  /**
   * The first sitting of a committee, which doubles as the date its panel
   * opens when no date was set on the door itself. A jury day planned for the
   * 28th is *scheduled*, not closed.
   */
  nextSittingOn?: string | null;
}

/* ------------------------------------------------------------------ */
/* Read models returned by the API                                     */
/* ------------------------------------------------------------------ */

export interface PhaseWithBlocks extends Phase {
  blocks: Block[];
}

export interface TrackWithPhases extends Track {
  phases: PhaseWithBlocks[];
}

export interface EditionDetail extends Edition {
  program: Program;
  tracks: TrackWithPhases[];
}

export interface ProgramWithEditions extends Program {
  editions: Edition[];
}

/* ------------------------------------------------------------------ */
/* Write payloads                                                      */
/* ------------------------------------------------------------------ */

export const createProgramInput = z.object({
  name: z.string().min(1, 'Give the program a name.'),
  code: z.string().optional(),
  type: z.string().optional(),
  summary: z.string().optional(),
  partner: z.string().optional(),
  colour: z.string().optional(),
  edition: z
    .object({
      name: z.string().min(1),
      startsOn: z.string().nullable().optional(),
      endsOn: z.string().nullable().optional(),
      city: z.string().optional(),
      template: z.enum(['blank', 'selection_funnel']).optional(),
    })
    .optional(),
});

export type CreateProgramInput = z.input<typeof createProgramInput>;

export const updateProgramInput = createProgramInput
  .omit({ edition: true })
  .extend({ statuses: z.array(blockOutcomeSchema).optional() })
  .partial();

/** What a brand-new edition starts with. */
export const EDITION_TEMPLATES = ['blank', 'selection_funnel'] as const;
export type EditionTemplate = (typeof EDITION_TEMPLATES)[number];

export const createEditionInput = z.object({
  name: z.string().min(1, 'Give the edition a name.'),
  startsOn: z.string().nullable().optional(),
  endsOn: z.string().nullable().optional(),
  city: z.string().optional(),
  seats: z.number().int().min(0).optional(),
  template: z.enum(EDITION_TEMPLATES).optional(),
  /** Copy the phases and blocks of an existing edition. */
  copyFromEditionId: z.string().optional(),
});

export type CreateEditionInput = z.input<typeof createEditionInput>;

export const updateEditionInput = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(EDITION_STATUSES).optional(),
  mentors: z.array(z.string()).optional(),
  startsOn: z.string().nullable().optional(),
  endsOn: z.string().nullable().optional(),
  city: z.string().optional(),
  seats: z.number().int().min(0).optional(),
});

export const createPhaseInput = z.object({
  trackId: z.string(),
  name: z.string().min(1).optional(),
  position: z.number().int().optional(),
});

export const updatePhaseInput = z.object({
  name: z.string().min(1).optional(),
  startsOn: z.string().nullable().optional(),
  endsOn: z.string().nullable().optional(),
});

export const createBlockInput = z.object({
  phaseId: z.string(),
  type: blockTypeSchema,
  name: z.string().min(1).optional(),
  position: z.number().int().optional(),
});

export const updateBlockInput = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
});

export const moveBlockInput = z.object({
  phaseId: z.string(),
  position: z.number().int().min(0),
});

export const reorderInput = z.object({
  ids: z.array(z.string()).min(1),
});

/* ------------------------------------------------------------------ */
/* Helpers shared by both sides                                        */
/* ------------------------------------------------------------------ */

export function blocksOfType<T extends BlockType>(track: TrackWithPhases, type: T): Block[] {
  return track.phases.flatMap((p) => p.blocks.filter((b) => b.type === type));
}

/**
 * The Evaluation that scores a committee: one sitting in the same phase, which is
 * how dropping the two together links them, unless a block names it explicitly.
 */
export function evaluationForCommittee(track: TrackWithPhases, committeeId: string): Block | null {
  const pinned = orderedBlocks(track).find(
    (b) => b.type === 'evaluation' && (b.config as EvaluationConfig).scopeBlockId === committeeId,
  );
  if (pinned) return pinned;
  const phase = track.phases.find((p) => p.blocks.some((b) => b.id === committeeId));
  return (
    phase?.blocks.find((b) => b.type === 'evaluation' && (b.config as EvaluationConfig).scopeBlockId === null) ?? null
  );
}

/**
 * Whose statuses a selection reads: the block it names, else the nearest
 * evaluation before it. Naming a committee lands on the evaluation that scores
 * it — a committee says who reviews, never what a startup is worth.
 */
export function selectionSource(track: TrackWithPhases, block: Block): Block | null {
  const named = (block.config as SelectionConfig).fromBlockId;
  const ordered = orderedBlocks(track);
  if (named) {
    const found = ordered.find((b) => b.id === named) ?? null;
    return found?.type === 'committee' ? evaluationForCommittee(track, found.id) : found;
  }
  const index = ordered.findIndex((b) => b.id === block.id);
  return ordered.slice(0, index === -1 ? undefined : index).filter((b) => b.type === 'evaluation').pop() ?? null;
}

/**
 * A moment of the funnel: what measured, and what cut. An evaluation followed by
 * a selection is one act split across two blocks, and the screen shows it as one.
 */
export interface FunnelMoment {
  id: string;
  label: string;
  evaluation: Block | null;
  selection: Block | null;
}

export function funnelMoments(track: TrackWithPhases): FunnelMoment[] {
  const ordered = orderedBlocks(track);
  const claimed = new Set<string>();
  const moments: { at: number; moment: FunnelMoment }[] = [];

  ordered.forEach((block, index) => {
    if (block.type !== 'selection') return;
    const source = selectionSource(track, block);
    if (source) claimed.add(source.id);
    moments.push({
      at: source ? ordered.indexOf(source) : index,
      moment: {
        id: block.id,
        label: source ? `${source.name} → ${block.name}` : block.name,
        evaluation: source,
        selection: block,
      },
    });
  });

  // An evaluation nothing cuts on is a moment of its own.
  ordered.forEach((block, index) => {
    if (block.type !== 'evaluation' || claimed.has(block.id)) return;
    moments.push({ at: index, moment: { id: block.id, label: block.name, evaluation: block, selection: null } });
  });

  return moments.sort((a, b) => a.at - b.at).map((m) => m.moment);
}

/** Blocks in funnel order across the whole track. */
export function orderedBlocks(track: TrackWithPhases): Block[] {
  return [...track.phases]
    .sort((a, b) => a.position - b.position)
    .flatMap((p) => [...p.blocks].sort((a, b) => a.position - b.position));
}
