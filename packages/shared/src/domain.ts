import { z } from 'zod';
import { blockTypeSchema, type AnyBlockConfig, type BlockType } from './blocks.js';

/* ------------------------------------------------------------------ */
/* Programme                                                           */
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
  createdAt: z.string(),
});

export type Program = z.infer<typeof programSchema>;

/* ------------------------------------------------------------------ */
/* Edition                                                             */
/* ------------------------------------------------------------------ */

export const EDITION_STATUSES = ['Draft', 'Published', 'Running', 'Completed'] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];

export const editionSchema = z.object({
  id: z.string(),
  programId: z.string(),
  name: z.string().min(1),
  status: z.enum(EDITION_STATUSES).default('Draft'),
  startsOn: z.string().nullable().default(null),
  endsOn: z.string().nullable().default(null),
  city: z.string().default(''),
  seats: z.number().int().min(0).default(0),
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
  name: z.string().min(1, 'Give the programme a name.'),
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
      seats: z.number().int().min(0).optional(),
      template: z.enum(['blank', 'selection_funnel']).optional(),
    })
    .optional(),
});

export type CreateProgramInput = z.input<typeof createProgramInput>;

export const updateProgramInput = createProgramInput.omit({ edition: true }).partial();

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

/** Blocks in funnel order across the whole track. */
export function orderedBlocks(track: TrackWithPhases): Block[] {
  return [...track.phases]
    .sort((a, b) => a.position - b.position)
    .flatMap((p) => [...p.blocks].sort((a, b) => a.position - b.position));
}
