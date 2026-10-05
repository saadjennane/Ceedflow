/**
 * Dire à une startup ce qu'une sélection a décidé d'elle.
 *
 * One letter per outcome, and one send per audience — never all three at once.
 * A waiting list exists because the decision is not closed, and telling a
 * startup it is refused when it may be fished out a week later is worse than
 * the leak that sending everybody together would avoid.
 *
 * The letters carry the decision that was announced, not the rule as it stands
 * this second: a score arriving after the announcement does not change what has
 * already left somebody's inbox.
 */
import { type SelectionConfig, fillTemplate } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { appLink } from './deliverables.js';
import { suppressedAmong } from './mail.js';
import { selectionView, type SelectionCall } from './selection.js';
import type { Gate, NoticeSource, NoticeTargetRow } from './notices.js';

/** The notice kind for one outcome: what the screen launches and the row records. */
export const SELECTION_KINDS: Record<SelectionCall, string> = {
  pass: 'selection_pass',
  wait: 'selection_wait',
  fail: 'selection_fail',
};

/** Back the other way, for reading a kind off a stored notice. */
export const callOfKind = (kind: string): SelectionCall | null =>
  (Object.entries(SELECTION_KINDS).find(([, v]) => v === kind)?.[0] as SelectionCall | undefined) ?? null;

export const labelOf = (config: SelectionConfig, call: SelectionCall): string =>
  call === 'pass' ? config.passLabel : call === 'wait' ? config.waitLabel : config.failLabel;

/**
 * Who this outcome's letter would name, and what stands in the way.
 *
 * Read from the announced decision rather than from the live rule: a startup
 * whose score moved this morning has not been un-announced, and writing to it
 * as though it had would be the platform contradicting a letter it sent
 * yesterday.
 */
export async function selectionRoster(blockId: string, kind: string): Promise<NoticeTargetRow[]> {
  const call = callOfKind(kind);
  const view = await selectionView(blockId);
  if (!call || !view) return [];

  const announced = new Map((await repo.listOutcomes(blockId)).map((o) => [o.candidateId, o.outcome]));
  const mine = view.rows.filter((row) => (announced.get(row.candidate.id) ?? row.outcome) === call);
  const held = await suppressedAmong(mine.map((r) => r.candidate.email));

  return mine.map((row) => ({
    candidateId: row.candidate.id,
    email: row.candidate.email,
    toName: row.candidate.contactName,
    orgName: row.candidate.orgName,
    blocked: !row.candidate.email
      ? 'no_email'
      : held.has(row.candidate.email.trim().toLowerCase())
        ? 'suppressed'
        : /* No account is not a reason to withhold a refusal — there is
             nothing for them to log into and nothing to do. It only blocks a
             letter whose point is to send them somewhere. */
          call !== 'fail' && !row.candidate.accountState
          ? 'no_account'
          : '',
  }));
}

export const selectionNotices: NoticeSource = {
  roster: selectionRoster,

  /**
   * Who is still owed this letter at the hour it goes.
   *
   * A startup whose decision moved between the launch and the send hears
   * nothing from this notice: the other outcome's letter is its own act, and
   * telling somebody they are refused when the committee has just fished them
   * out is the one mistake this whole mechanism exists to prevent.
   */
  async filter(blockId, kind, candidateIds) {
    const roster = new Map((await selectionRoster(blockId, kind)).map((r) => [r.candidateId, r]));
    return new Map(candidateIds.map((id) => [id, roster.has(id) ? roster.get(id)!.blocked : 'decided otherwise']));
  },

  async gate(blockId): Promise<Gate> {
    const block = await repo.getBlock(blockId);
    if (!block || block.type !== 'selection') return { go: false, wait: false, why: 'The block no longer exists.' };
    /* Announcing is what records the decision. Writing to startups about a
       decision nobody has recorded would tell them something the platform
       cannot show them — so it waits for the announcement rather than
       abandoning, because scheduling the letters before announcing is an
       ordinary order to do things in. */
    if (!(block.config as SelectionConfig).publishedAt) {
      return { go: false, wait: true, why: 'The decision was never announced.' };
    }
    return { go: true };
  },

  async letter(blockId, kind, candidateId, body) {
    const call = callOfKind(kind);
    const block = await repo.getBlock(blockId);
    const candidate = await repo.getCandidate(candidateId);
    if (!call || !block || !candidate) return null;
    const config = block.config as SelectionConfig;
    return {
      kind,
      to: candidate.email,
      toName: candidate.contactName,
      subject: `${block.name} — ${candidate.orgName}`,
      body: fillTemplate(body, {
        startup: candidate.orgName,
        decision: labelOf(config, call),
        phase: block.name,
        lien: await appLink(),
      }),
    };
  },
};
