import {
  DEFAULT_OUTCOMES,
  consensusScore,
  gridLeaves,
  normalisedScore,
  proposedOutcome,
  tallyVotes,
  type Block,
  type BlockOutcome,
  type CriterionLeaf,
  type EvaluationConfig,
  type EvaluationCriterion,
  type EvaluationScore,
} from '@ceed/shared';
import * as repo from '../db/repo.js';

/** Only an Evaluation scores. A committee organises the sittings it scores in. */
export function isScoringBlock(block: Block): boolean {
  return block.type === 'evaluation';
}

export function criteriaOf(block: Block): EvaluationCriterion[] {
  if (!isScoringBlock(block)) return [];
  return (block.config as EvaluationConfig).criteria ?? [];
}

/** What is actually marked, with each leaf's real share and the grid's scale. */
export function scoredLeaves(block: Block): CriterionLeaf[] {
  if (!isScoringBlock(block)) return [];
  return gridLeaves(criteriaOf(block), (block.config as EvaluationConfig).markedOutOf);
}

const methodOf = (block: Block) => (block.config as EvaluationConfig).method ?? 'score';

export function outcomesOf(block: Block): BlockOutcome[] {
  if (!isScoringBlock(block)) return [];
  const outcomes = (block.config as EvaluationConfig).outcomes;
  return outcomes?.length ? outcomes : DEFAULT_OUTCOMES;
}

export interface CandidateScores {
  scores: (EvaluationScore & { normalised: number | null })[];
  consensus: number | null;
  submitted: number;
}

/** Every score recorded against a block, grouped by candidate. */
export async function scoresByCandidate(block: Block): Promise<Map<string, CandidateScores>> {
  // Marks are given on the leaves; a section only shares its weight out.
  const criteria = scoredLeaves(block);
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

export interface CandidateOutcome {
  outcomeId: string | null;
  /** True when a human chose it rather than the score earning it. */
  overridden: boolean;
}

/**
 * The status each candidate carries. It follows from the score — the bands are
 * the whole point of configuring them — so nothing is stored until a human
 * disagrees. That removes the class of bugs where a score moved and a status
 * stayed behind.
 */
export async function outcomesByCandidate(block: Block): Promise<Map<string, CandidateOutcome>> {
  const outcomes = outcomesOf(block);
  const grouped = await scoresByCandidate(block);
  const stored = new Map((await repo.listBlockOutcomes(block.id)).map((o) => [o.candidateId, o]));

  const result = new Map<string, CandidateOutcome>();
  const verdictMode = methodOf(block) === 'verdict';
  const rule = (block.config as EvaluationConfig).voteRule ?? 'majority';

  for (const [candidateId, entry] of grouped) {
    // A grid earns a band; a panel names the status itself and votes on it.
    const outcomeId = verdictMode
      ? tallyVotes(
          entry.scores.filter((s) => s.submittedAt).map((s) => s.verdict),
          outcomes,
          rule,
        ).outcomeId
      : proposedOutcome(entry.consensus, outcomes);
    result.set(candidateId, { outcomeId, overridden: false });
  }
  for (const [candidateId, row] of stored) {
    result.set(candidateId, { outcomeId: row.outcomeId, overridden: true });
  }
  return result;
}

/** Sets a status by hand — or clears it, when the choice is what the score said anyway. */
export async function setOutcomeByHand(block: Block, candidateId: string, outcomeId: string): Promise<void> {
  const derived = await outcomesByCandidate(block);
  const proposed = derived.get(candidateId)?.overridden ? null : (derived.get(candidateId)?.outcomeId ?? null);
  if (outcomeId === proposed) await repo.clearBlockOutcome(block.id, candidateId);
  else await repo.setBlockOutcome(block.id, candidateId, outcomeId, true);
}
