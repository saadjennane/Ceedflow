import { z } from 'zod';

/** How a cohort member's time in the program is going. */
export const COHORT_STATUSES = ['Active', 'At risk', 'Graduated'] as const;
export type CohortStatus = (typeof COHORT_STATUSES)[number];

export const COHORT_TONE: Record<CohortStatus, 'ok' | 'warn' | 'info'> = {
  Active: 'ok',
  'At risk': 'warn',
  Graduated: 'info',
};

/**
 * A candidate is the row that moves through the funnel. It is created by a
 * public application submission, or added by hand by the CEED team.
 */
export const CANDIDATE_STATUSES = [
  'Applied',
  'In review',
  'Shortlisted',
  'Selected',
  'Not selected',
  'Withdrawn',
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const candidateSchema = z.object({
  id: z.string(),
  editionId: z.string(),
  trackId: z.string(),
  /** Where the submission came in: the application block, or 'manual'. */
  originBlockId: z.string().nullable().default(null),
  /** The organisation this candidacy belongs to, in the directory. */
  orgId: z.string(),
  /** Who applied on its behalf, when somebody signed in did. */
  personId: z.string().nullable().default(null),
  /* The four below are read through the directory, not stored twice. */
  orgName: z.string().min(1),
  contactName: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  source: z.string().default(''),
  status: z.enum(CANDIDATE_STATUSES).default('Applied'),
  /** Who mentors it once it is in the cohort. Empty until someone is named. */
  mentor: z.string().default(''),
  cohortStatus: z.enum(COHORT_STATUSES).default('Active'),
  /** Answers to the application form, keyed by field id. */
  answers: z.record(z.unknown()).default({}),
  submittedAt: z.string(),
});

export type Candidate = z.infer<typeof candidateSchema>;

export const STATUS_TONE: Record<CandidateStatus, 'neutral' | 'info' | 'ok' | 'stop'> = {
  Applied: 'neutral',
  'In review': 'info',
  Shortlisted: 'info',
  Selected: 'ok',
  'Not selected': 'stop',
  Withdrawn: 'neutral',
};

/* ------------------------------------------------------------------ */
/* Evaluation scores                                                   */
/* ------------------------------------------------------------------ */

export const evaluationScoreSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  candidateId: z.string(),
  evaluatorId: z.string(),
  evaluatorName: z.string().default(''),
  /** Raw marks keyed by criterion id. */
  marks: z.record(z.number()).default({}),
  /** The status this evaluator named, when the block asks for a verdict. */
  verdict: z.string().default(''),
  comment: z.string().default(''),
  submittedAt: z.string().nullable().default(null),
});

export type EvaluationScore = z.infer<typeof evaluationScoreSchema>;

export interface ScoredCriterion {
  id: string;
  label: string;
  weight: number;
  max: number;
}

/** Weighted average on a 0-100 scale. Missing marks are skipped, not zeroed. */
export function normalisedScore(marks: Record<string, number>, criteria: ScoredCriterion[]): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const c of criteria) {
    const mark = marks[c.id];
    if (typeof mark !== 'number' || Number.isNaN(mark)) continue;
    weighted += (mark / c.max) * c.weight;
    totalWeight += c.weight;
  }
  if (totalWeight === 0) return null;
  return Math.round((weighted / totalWeight) * 1000) / 10;
}

/** Average of every submitted evaluator score for one candidate. */
export function consensusScore(scores: EvaluationScore[], criteria: ScoredCriterion[]): number | null {
  const values = scores
    .filter((s) => s.submittedAt)
    .map((s) => normalisedScore(s.marks, criteria))
    .filter((v): v is number => v !== null);
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Selection outcomes                                                  */
/* ------------------------------------------------------------------ */

/**
 * The status an evaluation or a committee put on a candidate. Separate from the
 * funnel decision a Selection makes — this one qualifies, it does not cut.
 */
export const blockOutcomeRowSchema = z.object({
  blockId: z.string(),
  candidateId: z.string(),
  outcomeId: z.string(),
  /** True once a human moved it away from what the score proposed. */
  overridden: z.boolean().default(false),
  decidedAt: z.string(),
});

export type BlockOutcomeRow = z.infer<typeof blockOutcomeRowSchema>;

export const selectionOutcomeSchema = z.object({
  blockId: z.string(),
  candidateId: z.string(),
  outcome: z.enum(['pass', 'fail']),
  /** True once a human changed the computed result — a repêchage, a withdrawal. */
  overridden: z.boolean().default(false),
  decidedAt: z.string(),
});

export type SelectionOutcome = z.infer<typeof selectionOutcomeSchema>;

export const setOutcomeInput = z.object({
  candidateId: z.string(),
  outcome: z.enum(['pass', 'fail']),
});

/** Applying is done signed in, as one of your organisations. */
export const submitApplicationInput = z.object({
  orgId: z.string().min(1, 'Choose which organisation is applying.'),
  source: z.string().default(''),
  answers: z.record(z.unknown()).default({}),
  /** Ids of the eligibility criteria ticked. */
  acknowledged: z.array(z.string()).default([]),
});

export type SubmitApplicationInput = z.input<typeof submitApplicationInput>;
