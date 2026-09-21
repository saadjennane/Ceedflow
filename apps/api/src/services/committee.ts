import {
  evaluationForCommittee,
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
  type PersonRef,
  type TrackWithPhases,
} from '@ceed/shared';
import { peopleByIds } from '../db/directory.js';
import * as repo from '../db/repo.js';
import { outcomesByCandidate, outcomesOf, scoresByCandidate } from './scoring.js';
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
  /** The jury as people rather than ids, so no screen resolves them itself. */
  jury: PersonRef[];
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

// The rule lives in the shared model: a selection resolves a committee the same
// way, and the two must never drift apart.
export { evaluationForCommittee };

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
  const statuses = evaluation ? await outcomesByCandidate(evaluation) : null;

  // One lookup for every jury of every sitting rather than one per sitting.
  const jurors = await peopleByIds([...new Set(sessions.flatMap((s) => s.jury))]);

  const config = block.config as CommitteeConfig;
  const sessionViews: SessionView[] = sessions.map((session) => {
    // Asynchronous work has no timetable, so it has no slots to hand out.
    const slots = config.format === 'event' ? sessionSlots(session) : [];
    return {
      session,
      jury: session.jury.map((id) => jurors.find((j) => j.id === id)).filter((j): j is PersonRef => Boolean(j)),
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
        /* Placed ones read as the day runs; the rest keep the order they were
           put on the sitting, which is the order Fill slots follows. Saying so
           here rather than leaning on a stable sort: the tie between two
           unplaced rows used to be settled by luck. */
        .sort(
          (a, b) =>
            (a.assignment.slotIndex ?? Number.MAX_SAFE_INTEGER) -
              (b.assignment.slotIndex ?? Number.MAX_SAFE_INTEGER) ||
            a.assignment.position - b.assignment.position,
        ),
    };
  });

  const assigned = new Set(assignments.map((a) => a.candidateId));

  return {
    block,
    config,
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

/**
 * Puts startups on a sitting. They arrive without an hour, whoever owns the
 * timetable.
 *
 * It used to hand out the first free slots by itself whenever the team owned
 * the timetable, which was a reasonable shortcut when nothing else could place
 * them. Fill slots now does that on demand, in an order you can see — so doing
 * it silently only took the decision away, and left No time yet permanently
 * empty. Assigning and timing are two acts; this is the first one.
 */
export async function seatOnFreeSlots(sessionId: string, candidateIds: string[]): Promise<number> {
  return repo.assignToSession(sessionId, candidateIds);
}
