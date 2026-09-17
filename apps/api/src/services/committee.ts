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
  type EvaluationConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import * as repo from '../db/repo.js';
import { outcomesOf, scoresByCandidate } from './scoring.js';
import { intakeFor } from './selection.js';

export interface AssignmentView {
  assignment: CommitteeAssignment;
  candidate: Candidate;
  slot: CommitteeSlot | null;
  /** From the Evaluation that scores this committee, if there is one. */
  score: number | null;
  submitted: number;
  outcomeId: string | null;
}

export interface SessionView {
  session: CommitteeSession;
  slots: CommitteeSlot[];
  assignments: AssignmentView[];
  /** A sitting is full when every slot is taken. */
  capacity: number;
}

export interface CommitteeView {
  block: Block;
  config: CommitteeConfig;
  sessions: SessionView[];
  /** Who reached this committee and is not on a sitting yet. */
  pool: { candidate: Candidate }[];
  /** Where the pool comes from, named so the screen can say it. */
  intakeFrom: string | null;
  /** The Evaluation that scores these sittings. */
  evaluation: { blockId: string; name: string; criteria: number; outcomes: BlockOutcome[] } | null;
}

function trackOf(tracks: TrackWithPhases[], blockId: string): TrackWithPhases | null {
  return tracks.find((t) => t.phases.some((p) => p.blocks.some((b) => b.id === blockId))) ?? null;
}

/**
 * The Evaluation that scores this committee: one sitting in the same phase, which
 * is how dropping the two together links them, unless a block names it explicitly.
 */
export function evaluationForCommittee(track: TrackWithPhases, committeeId: string): Block | null {
  const pinned = orderedBlocks(track).find(
    (b) => b.type === 'evaluation' && (b.config as EvaluationConfig).scopeBlockId === committeeId,
  );
  if (pinned) return pinned;
  const phase = track.phases.find((p) => p.blocks.some((b) => b.id === committeeId));
  return (
    phase?.blocks.find(
      (b) => b.type === 'evaluation' && (b.config as EvaluationConfig).scopeBlockId === null,
    ) ?? null
  );
}

/** The committee a scoped Evaluation scores, resolved the same way. */
export function committeeForEvaluation(track: TrackWithPhases, evaluationId: string): Block | null {
  const evaluation = orderedBlocks(track).find((b) => b.id === evaluationId);
  if (!evaluation) return null;
  const scope = (evaluation.config as EvaluationConfig).scopeBlockId;
  if (scope === 'standalone') return null;
  if (scope) return orderedBlocks(track).find((b) => b.id === scope && b.type === 'committee') ?? null;
  const phase = track.phases.find((p) => p.blocks.some((b) => b.id === evaluationId));
  return phase?.blocks.find((b) => b.type === 'committee') ?? null;
}

/** What the last published selection upstream sent here. */
function intakeLabel(track: TrackWithPhases, blockId: string): string | null {
  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === blockId);
  const upstream = ordered
    .slice(0, index === -1 ? ordered.length : index)
    .filter((b) => b.type === 'selection' && (b.config as { publishedAt?: string | null }).publishedAt)
    .pop();
  return upstream?.name ?? null;
}

export async function committeeView(blockId: string): Promise<CommitteeView | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'committee') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail ? trackOf(detail.tracks, blockId) : null;
  if (!track) return null;

  const block = context.block;
  const everyone = await repo.listCandidates(context.editionId, track.id);
  const intake = (await intakeFor(track, blockId, everyone)).filter((c) => c.status !== 'Withdrawn');
  const byId = new Map(everyone.map((c) => [c.id, c]));

  const sessions = await repo.listSessions(blockId);
  const assignments = await repo.listAssignments(blockId);

  const evaluation = evaluationForCommittee(track, blockId);
  const grouped = evaluation ? await scoresByCandidate(evaluation) : null;
  const statuses = evaluation
    ? new Map((await repo.listBlockOutcomes(evaluation.id)).map((o) => [o.candidateId, o]))
    : null;

  const sessionViews: SessionView[] = sessions.map((session) => {
    const slots = sessionSlots(session);
    return {
      session,
      slots,
      capacity: slots.length,
      assignments: assignments
        .filter((a) => a.sessionId === session.id)
        .map((assignment) => {
          const candidate = byId.get(assignment.candidateId);
          if (!candidate) return null;
          const scores = grouped?.get(candidate.id);
          return {
            assignment,
            candidate,
            slot: assignment.slotIndex === null ? null : (slots[assignment.slotIndex] ?? null),
            score: scores?.consensus ?? null,
            submitted: scores?.submitted ?? 0,
            outcomeId: statuses?.get(candidate.id)?.outcomeId ?? null,
          };
        })
        .filter((row): row is AssignmentView => row !== null)
        // Unplaced startups sit at the end, where they are obvious.
        .sort(
          (a, b) =>
            (a.assignment.slotIndex ?? Number.MAX_SAFE_INTEGER) - (b.assignment.slotIndex ?? Number.MAX_SAFE_INTEGER),
        ),
    };
  });

  const assigned = new Set(assignments.map((a) => a.candidateId));

  return {
    block,
    config: block.config as CommitteeConfig,
    sessions: sessionViews,
    pool: intake.filter((c) => !assigned.has(c.id)).map((candidate) => ({ candidate })),
    intakeFrom: intakeLabel(track, blockId),
    evaluation: evaluation
      ? {
          blockId: evaluation.id,
          name: evaluation.name,
          criteria: ((evaluation.config as EvaluationConfig).criteria ?? []).length,
          outcomes: outcomesOf(evaluation),
        }
      : null,
  };
}

/** Seats startups on the first free slots of a sitting, in the order given. */
export async function seatOnFreeSlots(sessionId: string, candidateIds: string[]): Promise<number> {
  const added = await repo.assignToSession(sessionId, candidateIds);
  const blockId = await repo.sessionBlockId(sessionId);
  if (!blockId) return added;
  const view = await committeeView(blockId);
  const sv = view?.sessions.find((s) => s.session.id === sessionId);
  if (!sv) return added;

  const taken = new Set(sv.assignments.map((a) => a.assignment.slotIndex).filter((i): i is number => i !== null));
  const free = sv.slots.map((s) => s.index).filter((i) => !taken.has(i));
  for (const row of sv.assignments.filter((a) => a.assignment.slotIndex === null)) {
    const next = free.shift();
    if (next === undefined) break;
    await repo.moveAssignmentToSlot(row.assignment.id, next);
  }
  return added;
}
