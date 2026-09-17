import {
  orderedBlocks,
  sessionSlots,
  type Block,
  type BlockOutcome,
  type Candidate,
  type CommitteeAssignment,
  type CommitteeConfig,
  type CommitteeSession,
  type CommitteeSlot,
  type EvaluationCriterion,
  type TrackWithPhases,
} from '@ceed/shared';
import * as repo from '../db/repo.js';
import { criteriaOf, outcomesOf, scoresByCandidate, type CandidateScores } from './scoring.js';
import { intakeFor } from './selection.js';

export interface AssignmentView {
  assignment: CommitteeAssignment;
  candidate: Candidate;
  slot: CommitteeSlot | null;
  score: number | null;
  submitted: number;
  outcomeId: string | null;
  overridden: boolean;
}

export interface SessionView {
  session: CommitteeSession;
  slots: CommitteeSlot[];
  assignments: AssignmentView[];
  /** Sittings are full when every slot is taken. */
  capacity: number;
}

export interface CommitteeView {
  block: Block;
  config: CommitteeConfig;
  criteria: EvaluationCriterion[];
  outcomes: BlockOutcome[];
  sessions: SessionView[];
  /** Candidates that reached this block and are not on any sitting yet. */
  pool: { candidate: Candidate; outcomeId: string | null }[];
  /** The evaluation whose statuses drive bulk assignment. */
  source: { blockId: string; name: string; outcomes: BlockOutcome[] } | null;
}

function trackOf(tracks: TrackWithPhases[], blockId: string): TrackWithPhases | null {
  return tracks.find((t) => t.phases.some((p) => p.blocks.some((b) => b.id === blockId))) ?? null;
}

/** The evaluation a committee draws its statuses from: explicit, else nearest upstream. */
function resolveSource(track: TrackWithPhases, block: Block): Block | null {
  const config = block.config as CommitteeConfig;
  const ordered = orderedBlocks(track);
  if (config.sourceBlockId) return ordered.find((b) => b.id === config.sourceBlockId) ?? null;
  const index = ordered.findIndex((b) => b.id === block.id);
  return (
    ordered
      .slice(0, index === -1 ? ordered.length : index)
      .filter((b) => b.type === 'evaluation')
      .pop() ?? null
  );
}

export async function committeeView(blockId: string): Promise<CommitteeView | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'committee') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail ? trackOf(detail.tracks, blockId) : null;
  if (!track) return null;

  const block = context.block;
  const config = block.config as CommitteeConfig;
  const everyone = await repo.listCandidates(context.editionId, track.id);
  const intake = (await intakeFor(track, blockId, everyone)).filter((c) => c.status !== 'Withdrawn');
  const byId = new Map(everyone.map((c) => [c.id, c]));

  const sessions = await repo.listSessions(blockId);
  const assignments = await repo.listAssignments(blockId);
  const grouped: Map<string, CandidateScores> = await scoresByCandidate(block);
  const outcomes = new Map((await repo.listBlockOutcomes(blockId)).map((o) => [o.candidateId, o]));

  const sessionViews: SessionView[] = sessions.map((session) => {
    const slots = sessionSlots(session);
    const mine = assignments.filter((a) => a.sessionId === session.id);
    return {
      session,
      slots,
      capacity: slots.length,
      assignments: mine
        .map((assignment) => {
          const candidate = byId.get(assignment.candidateId);
          if (!candidate) return null;
          const scores = grouped.get(candidate.id);
          const outcome = outcomes.get(candidate.id);
          return {
            assignment,
            candidate,
            slot: assignment.slotIndex === null ? null : (slots[assignment.slotIndex] ?? null),
            score: scores?.consensus ?? null,
            submitted: scores?.submitted ?? 0,
            outcomeId: outcome?.outcomeId ?? null,
            overridden: outcome?.overridden ?? false,
          };
        })
        .filter((row): row is AssignmentView => row !== null)
        .sort((a, b) => (a.assignment.slotIndex ?? 99) - (b.assignment.slotIndex ?? 99)),
    };
  });

  const assigned = new Set(assignments.map((a) => a.candidateId));
  const source = resolveSource(track, block);
  const sourceOutcomes = source ? new Map((await repo.listBlockOutcomes(source.id)).map((o) => [o.candidateId, o])) : null;

  return {
    block,
    config,
    criteria: criteriaOf(block),
    outcomes: outcomesOf(block),
    sessions: sessionViews,
    pool: intake
      .filter((c) => !assigned.has(c.id))
      .map((candidate) => ({
        candidate,
        outcomeId: sourceOutcomes?.get(candidate.id)?.outcomeId ?? null,
      })),
    source: source ? { blockId: source.id, name: source.name, outcomes: outcomesOf(source) } : null,
  };
}

/** Bulk assignment: everyone the source evaluation gave one of these statuses. */
export async function assignByOutcome(sessionId: string, outcomeIds: string[]): Promise<number> {
  const blockId = await repo.sessionBlockId(sessionId);
  if (!blockId) return 0;
  const view = await committeeView(blockId);
  if (!view) return 0;
  const wanted = new Set(outcomeIds);
  const ids = view.pool.filter((p) => p.outcomeId && wanted.has(p.outcomeId)).map((p) => p.candidate.id);
  return repo.assignToSession(sessionId, ids);
}
