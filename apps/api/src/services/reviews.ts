import {
  gridLeaves,
  normalisedScore,
  orderedBlocks,
  blockStatus,
  brickClosedOn,
  editionIsVisible,
  editionTakesInput,
  type ApplicationConfig,
  type BlockOutcome,
  type Candidate,
  type CriterionLeaf,
  type EvaluationConfig,
  type EvaluationCriterion,
  type EvaluationMethod,
  type EvaluationScale,
  type FormField,
  profileOf,
  profileStarted,
  type OrgProfile,
} from '@ceed/shared';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { committeeView, evaluationForCommittee } from './committee.js';
import { outcomesOf } from './scoring.js';

/**
 * A startup as a juror is allowed to know it: its name, who filed, and what the
 * form was answered with. Deliberately not the `Candidate` row — that carries
 * the founder's phone and email, the acquisition channel, the mentor, and the
 * internal status. A juror who can read "Shortlisted" before scoring is not
 * being asked for a judgement, they are being told one.
 */
export interface ReviewSubject {
  id: string;
  orgName: string;
  contactName: string;
}

/** One startup as the person reviewing it sees it. */
export interface ReviewItem {
  candidate: ReviewSubject;
  /** The application, with its questions labelled. */
  answers: { label: string; value: unknown; type: string }[];
  /**
   * La fiche de la startup, quand elle existe.
   *
   * What is true of the company whichever call it answered: the sector, the
   * stage, the size of the team. Null when the candidacy has no organisation
   * attached, or when nobody has filled anything in — ten dashes in front of a
   * juror would read as a fault of the startup's.
   *
   * Still no email and no phone. A juror reads a company, not a contact list.
   */
  profile: OrgProfile | null;
  /** Only ever this reviewer's own marks. Nobody sees anybody else's. */
  mine: { marks: Record<string, number>; verdict: string; comment: string; submittedAt: string | null } | null;
  score: number | null;
}

/** Narrowed on the way out, so nothing downstream has to remember to. */
const subjectOf = (c: Candidate): ReviewSubject => ({
  id: c.id,
  orgName: c.orgName,
  contactName: c.contactName,
});

/**
 * Nobody judges their own. A juror is often an alumnus or an operator, so this
 * is an ordinary case rather than an edge one: the candidacy simply leaves their
 * list, silently — telling them what they may not score would name the very
 * thing being kept from them.
 */
export function conflicted(
  candidate: Pick<Candidate, 'personId' | 'orgId'>,
  recordId: string,
  ownOrgs: Set<string>,
): boolean {
  if (candidate.personId === recordId) return true;
  return Boolean(candidate.orgId && ownOrgs.has(candidate.orgId));
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
    /** What a number is marked out of. Stars are always out of five. */
    markedOutOf: number;
    criteria: EvaluationCriterion[];
    leaves: CriterionLeaf[];
    outcomes: BlockOutcome[];
    requireComment: boolean;
  } | null;
  items: ReviewItem[];
  done: number;
  /** Open, shut by the evaluation's own dates, or shut by CEED. */
  state: 'open' | 'not_open' | 'closed';
  opensAt: string | null;
  closesAt: string | null;
  /** Set when CEED closed it by hand, which is what a juror is told. */
  closedAt: string | null;
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
  // Read once for the whole walk rather than per candidacy.
  const ownOrgs = await dir.orgIdsOf(recordId);
  /* Une fiche lue une fois : la même startup revient sur plusieurs séances. */
  const profiles = new Map<string, OrgProfile | null>();
  const profileOfOrg = async (orgId: string | null): Promise<OrgProfile | null> => {
    if (!orgId) return null;
    if (!profiles.has(orgId)) {
      const record = await dir.getRecord(orgId);
      const profile = record ? profileOf(record) : null;
      profiles.set(orgId, profile && profileStarted(profile) ? profile : null);
    }
    return profiles.get(orgId) ?? null;
  };

  for (const program of programs) {
    for (const edition of program.editions) {
      // A draft edition has no outside at all — not even for the people it
      // would eventually ask to review.
      if (!editionIsVisible(edition.status)) continue;
      const detail = await repo.getEditionDetail(edition.id);
      if (!detail) continue;

      for (const track of detail.tracks) {
        const blocks = orderedBlocks(track);
        const questions = questionsFor(blocks);

        for (const block of blocks.filter((b) => b.type === 'committee')) {
          const view = await committeeView(block.id);
          if (!view) continue;

          // The committee decides whether a juror sees the panel at all; the
          // evaluation below decides whether they may mark it. Two doors, and
          // reading through the first one without the second is the ordinary
          // case — a jury studying its list before scoring opens.
          if (blockStatus(block, 'main', view.sessions.length) !== 'live') continue;

          const mine = view.sessions.filter((s) => s.session.jury.includes(recordId));
          if (!mine.length) continue;

          const evaluationBlock = evaluationForCommittee(track, block.id);
          const config = evaluationBlock ? (evaluationBlock.config as EvaluationConfig) : null;
          const leaves = config ? gridLeaves(config.criteria, config.markedOutOf) : [];
          const scores = evaluationBlock ? await repo.listScores(evaluationBlock.id) : [];

          for (const session of mine) {
            // Without assignment every panel reviews the whole intake.
            const candidates = (
              view.config.assign
                ? session.assignments.map((a) => a.candidate)
                : view.pool.map((p) => p.candidate)
            ).filter((c) => !conflicted(c, recordId, ownOrgs));

            const items: ReviewItem[] = await Promise.all(candidates.map(async (candidate) => {
              const own = scores.find((s) => s.candidateId === candidate.id && s.evaluatorId === recordId) ?? null;
              return {
                candidate: subjectOf(candidate),
                profile: await profileOfOrg(candidate.orgId),
                answers: questions
                  .filter((q) => candidate.answers[q.id] !== undefined && candidate.answers[q.id] !== '')
                  .map((q) => ({ label: q.label, value: candidate.answers[q.id], type: q.type })),
                mine: own
                  ? { marks: own.marks, verdict: own.verdict, comment: own.comment, submittedAt: own.submittedAt }
                  : null,
                score: own ? normalisedScore(own.marks, leaves) : null,
              };
            }));

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
                      markedOutOf: config.markedOutOf,
                      criteria: config.criteria,
                      leaves,
                      outcomes: outcomesOf(evaluationBlock),
                      requireComment: config.requireComment,
                    }
                  : null,
              items,
              done: items.filter((i) => i.mine?.submittedAt).length,
              // Completed shuts the door whatever the evaluation's own window says.
              // The marks already given stay readable, which is the point of it.
              state: !editionTakesInput(edition.status)
                ? 'closed'
                : evaluationBlock
                  ? ((st) => (st === 'live' ? 'open' : st === 'scheduled' ? 'not_open' : 'closed'))(
                      blockStatus(evaluationBlock),
                    )
                  : 'closed',
              opensAt: config?.opensAt ?? null,
              closesAt: config?.closesAt ?? null,
              closedAt: config ? brickClosedOn(config) : null,
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

/**
 * Why a panel did not come back. Telling a juror who sat on it yesterday that
 * they "are not on that panel" is not discretion, it is a false statement —
 * they know they are on it. Somebody who was never on it still learns nothing.
 */
export type PanelRefusal = 'closed' | 'stranger';

export async function whyNoPanel(recordId: string, sessionId: string): Promise<PanelRefusal> {
  const session = await repo.findSessionById(sessionId);
  if (!session || !session.jury.includes(recordId)) return 'stranger';
  return 'closed';
}
