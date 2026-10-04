import {
  DEFAULT_OUTCOMES,
  DELIVERABLE_FAIL,
  DELIVERABLE_PASS,
  deliverableOutcomes,
  consensusScore,
  gridLeaves,
  markCounts,
  normalisedScore,
  proposedOutcome,
  tallyVotes,
  type Block,
  type BlockOutcome,
  type CriterionLeaf,
  type EvaluationConfig,
  type EvaluationCriterion,
  type DeliverableConfig,
  type EvaluationScore,
} from '@ceed/shared';
import * as repo from '../db/repo.js';
/* This closes a cycle — scoring → deliverables → selection → scoring — which
   ESM carries because every use sits inside a function and nothing reads an
   import at module-evaluation time. Keep it that way: a top-level use of any
   of these would break the server at boot, not at the call. */
import { deliverableView } from './deliverables.js';

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
  // A due diligence hands down two words of its own rather than bands.
  if (block.type === 'deliverable') return deliverableOutcomes(block.config as DeliverableConfig);
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
    entry.submitted = entry.scores.filter(markCounts).length;
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
  /* A due diligence does not score: a file is in order or it is not, and the
     word follows from whether every required item has been accepted. A call
     made by hand still outranks it, the same way it outranks a grid. */
  if (block.type === 'deliverable') {
    const stored = new Map((await repo.listBlockOutcomes(block.id)).map((o) => [o.candidateId, o]));
    const view = await deliverableView(block.id);
    const result = new Map<string, CandidateOutcome>();
    for (const row of view?.rows ?? []) {
      result.set(row.candidate.id, {
        outcomeId: row.complete ? DELIVERABLE_PASS : DELIVERABLE_FAIL,
        overridden: false,
      });
    }
    for (const [candidateId, row] of stored) {
      result.set(candidateId, { outcomeId: row.outcomeId, overridden: true });
    }
    return result;
  }

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
          entry.scores.filter(markCounts).map((s) => s.verdict),
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
