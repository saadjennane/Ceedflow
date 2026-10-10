import { z } from 'zod';
import { ACCOUNT_STATES } from './directory.js';

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
  /* Decided, and deliberately not final: a startup a committee is keeping
     within reach. It is its own status rather than an absence of one, because
     a programme has to be able to say "you are on the waiting list" — and a
     startup left with no word while the retained ones are told is the thing a
     waiting list exists to avoid. */
  'Waitlisted',
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
  /** Son logo, pour que les écrans qui la nomment puissent la montrer. */
  orgLogoUploadId: z.string().nullable().default(null),
  contactName: z.string().default(''),
  /** Read from the record rather than cut out of the full name: "Marie-Claire"
      and "Abdel Karim" are not the same kind of word, and a letter that opens
      on the wrong half of somebody's name is worse than one that opens on all
      of it. */
  contactFirstName: z.string().default(''),
  contactLastName: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  source: z.string().default(''),
  /**
   * Where the contact stands on having their own way in. Read through the join
   * like the three fields above it — never stored on this row, and never
   * patched from here.
   */
  accountState: z.enum(ACCOUNT_STATES).nullable().default(null),
  status: z.enum(CANDIDATE_STATUSES).default('Applied'),
  /** Who mentors it once it is in the cohort. Empty until someone is named. */
  mentor: z.string().default(''),
  cohortStatus: z.enum(COHORT_STATUSES).default('Active'),
  /** Answers to the application form, keyed by field id. */
  answers: z.record(z.unknown()).default({}),
  submittedAt: z.string(),
});

export type Candidate = z.infer<typeof candidateSchema>;

export const STATUS_TONE: Record<CandidateStatus, 'neutral' | 'info' | 'ok' | 'warn' | 'stop'> = {
  Applied: 'neutral',
  'In review': 'info',
  Shortlisted: 'info',
  Selected: 'ok',
  // Held, not refused: the warn tone is the one that means "not finished".
  Waitlisted: 'warn',
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
  /**
   * Set when this mark was taken out of the count — its author left the panel
   * and CEED said their marks should go with them. The row stays: a jury's
   * decisions can be contested, and who said what is what you need then.
   */
  withdrawnAt: z.string().nullable().default(null),
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
/**
 * Whether a mark has a say.
 *
 * Sent and not withdrawn — both halves, everywhere. Written once because the
 * average, the tally and the "3 of 5 scored" count must agree: a rule of this
 * kind restated in three places is a rule that will disagree with itself.
 */
export const markCounts = (s: EvaluationScore) => Boolean(s.submittedAt) && !s.withdrawnAt;

export function consensusScore(scores: EvaluationScore[], criteria: ScoredCriterion[]): number | null {
  const values = scores
    .filter(markCounts)
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
  /* Three, not two: a waiting list is a decision of its own, and only `pass`
     opens the door downstream. */
  outcome: z.enum(['pass', 'wait', 'fail']),
  /** True once a human changed the computed result — a repêchage, a withdrawal. */
  overridden: z.boolean().default(false),
  decidedAt: z.string(),
});

export type SelectionOutcome = z.infer<typeof selectionOutcomeSchema>;

export const setOutcomeInput = z.object({
  candidateId: z.string(),
  outcome: z.enum(['pass', 'wait', 'fail']),
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
