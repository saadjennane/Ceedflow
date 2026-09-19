import {
  gridLeaves,
  normalisedScore,
  orderedBlocks,
  type ApplicationConfig,
  type BlockOutcome,
  type Candidate,
  type CriterionLeaf,
  type EvaluationConfig,
  type EvaluationCriterion,
  type EvaluationMethod,
  type EvaluationScale,
  type FormField,
} from '@ceed/shared';
import * as repo from '../db/repo.js';
import { committeeView, evaluationForCommittee } from './committee.js';
import { outcomesOf } from './scoring.js';

/** One startup as the person reviewing it sees it. */
export interface ReviewItem {
  candidate: Candidate;
  /** The application, with its questions labelled. */
  answers: { label: string; value: unknown; type: string }[];
  /** Only ever this reviewer's own marks. Nobody sees anybody else's. */
  mine: { marks: Record<string, number>; verdict: string; comment: string; submittedAt: string | null } | null;
  score: number | null;
}

export interface ReviewPanel {
  sessionId: string;
  sessionName: string;
  heldOn: string | null;
  format: string;
  programName: string;
  editionName: string;
  editionId: string;
  committeeName: string;
  /** The grid to apply. Null when nothing scores this panel yet. */
  evaluation: {
    blockId: string;
    name: string;
    method: EvaluationMethod;
    scale: EvaluationScale;
    criteria: EvaluationCriterion[];
    leaves: CriterionLeaf[];
    outcomes: BlockOutcome[];
    requireComment: boolean;
  } | null;
  items: ReviewItem[];
  done: number;
}

/** The questions an application asked, so an answer is more than a key. */
function questionsFor(blocks: { type: string; config: unknown }[]): FormField[] {
  const application = blocks.find((b) => b.type === 'application');
  return application ? ((application.config as ApplicationConfig).fields ?? []) : [];
}

/**
 * Every panel this person sits on, across every edition, with the startups they
 * have to review. Walking the whole product is affordable here and keeps one
 * rule: you review what a committee put you on, nothing else.
 */
export async function reviewsFor(recordId: string): Promise<ReviewPanel[]> {
  const panels: ReviewPanel[] = [];
  const programs = await repo.listPrograms();

  for (const program of programs) {
    for (const edition of program.editions) {
      const detail = await repo.getEditionDetail(edition.id);
      if (!detail) continue;

      for (const track of detail.tracks) {
        const blocks = orderedBlocks(track);
        const questions = questionsFor(blocks);

        for (const block of blocks.filter((b) => b.type === 'committee')) {
          const view = await committeeView(block.id);
          if (!view) continue;

          const mine = view.sessions.filter((s) => s.session.jury.includes(recordId));
          if (!mine.length) continue;

          const evaluationBlock = evaluationForCommittee(track, block.id);
          const config = evaluationBlock ? (evaluationBlock.config as EvaluationConfig) : null;
          const leaves = config ? gridLeaves(config.criteria) : [];
          const scores = evaluationBlock ? await repo.listScores(evaluationBlock.id) : [];

          for (const session of mine) {
            // Without assignment every panel reviews the whole intake.
            const candidates = view.config.assign
              ? session.assignments.map((a) => a.candidate)
              : view.pool.map((p) => p.candidate);

            const items: ReviewItem[] = candidates.map((candidate) => {
              const own = scores.find((s) => s.candidateId === candidate.id && s.evaluatorId === recordId) ?? null;
              return {
                candidate,
                answers: questions
                  .filter((q) => candidate.answers[q.id] !== undefined && candidate.answers[q.id] !== '')
                  .map((q) => ({ label: q.label, value: candidate.answers[q.id], type: q.type })),
                mine: own
                  ? { marks: own.marks, verdict: own.verdict, comment: own.comment, submittedAt: own.submittedAt }
                  : null,
                score: own ? normalisedScore(own.marks, leaves) : null,
              };
            });

            panels.push({
              sessionId: session.session.id,
              sessionName: session.session.name,
              heldOn: session.session.heldOn,
              format: view.config.format,
              programName: program.name,
              editionName: edition.name,
              editionId: edition.id,
              committeeName: block.name,
              evaluation:
                evaluationBlock && config
                  ? {
                      blockId: evaluationBlock.id,
                      name: evaluationBlock.name,
                      method: config.method,
                      scale: config.scale,
                      criteria: config.criteria,
                      leaves,
                      outcomes: outcomesOf(evaluationBlock),
                      requireComment: config.requireComment,
                    }
                  : null,
              items,
              done: items.filter((i) => i.mine?.submittedAt).length,
            });
          }
        }
      }
    }
  }

  return panels;
}

/** One panel, or null when this person does not sit on it. */
export async function panelFor(recordId: string, sessionId: string): Promise<ReviewPanel | null> {
  return (await reviewsFor(recordId)).find((p) => p.sessionId === sessionId) ?? null;
}
