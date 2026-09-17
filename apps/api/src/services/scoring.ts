import {
  DEFAULT_OUTCOMES,
  consensusScore,
  normalisedScore,
  proposedOutcome,
  type Block,
  type BlockOutcome,
  type CommitteeConfig,
  type EvaluationConfig,
  type EvaluationCriterion,
  type EvaluationScore,
} from '@ceed/shared';
import * as repo from '../db/repo.js';

/** Evaluation and committee both score against a grid held on the block. */
export function isScoringBlock(block: Block): boolean {
  return block.type === 'evaluation' || block.type === 'committee';
}

export function criteriaOf(block: Block): EvaluationCriterion[] {
  if (!isScoringBlock(block)) return [];
  return ((block.config as EvaluationConfig | CommitteeConfig).criteria ?? []) as EvaluationCriterion[];
}

export function outcomesOf(block: Block): BlockOutcome[] {
  if (!isScoringBlock(block)) return [];
  const outcomes = (block.config as EvaluationConfig | CommitteeConfig).outcomes;
  return outcomes?.length ? outcomes : DEFAULT_OUTCOMES;
}

export interface CandidateScores {
  scores: (EvaluationScore & { normalised: number | null })[];
  consensus: number | null;
  submitted: number;
}

/** Every score recorded against a block, grouped by candidate. */
export async function scoresByCandidate(block: Block): Promise<Map<string, CandidateScores>> {
  const criteria = criteriaOf(block);
  const rows = await repo.listScores(block.id);
  const grouped = new Map<string, CandidateScores>();
  for (const row of rows) {
    const entry = grouped.get(row.candidateId) ?? { scores: [], consensus: null, submitted: 0 };
    entry.scores.push({ ...row, normalised: normalisedScore(row.marks, criteria) });
    grouped.set(row.candidateId, entry);
  }
  for (const entry of grouped.values()) {
    entry.consensus = consensusScore(entry.scores, criteria);
    entry.submitted = entry.scores.filter((s) => s.submittedAt).length;
  }
  return grouped;
}

/**
 * Writes the status the score earns onto every scored candidate, leaving alone
 * any a human has already moved by hand.
 */
export async function applyOutcomes(block: Block): Promise<number> {
  const outcomes = outcomesOf(block);
  const grouped = await scoresByCandidate(block);
  const stored = new Map((await repo.listBlockOutcomes(block.id)).map((o) => [o.candidateId, o]));
  let written = 0;
  for (const [candidateId, entry] of grouped) {
    if (stored.get(candidateId)?.overridden) continue;
    const proposed = proposedOutcome(entry.consensus, outcomes);
    if (!proposed) continue;
    await repo.setBlockOutcome(block.id, candidateId, proposed, false);
    written++;
  }
  return written;
}
