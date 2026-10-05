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
import { type SelectionConfig, fillTemplate, firstNameOf } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { appLink } from './deliverables.js';
import { accessFor } from './invitations.js';
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
/**
 * Everybody this outcome covers, with what stands in the way of writing to
 * them. No filtering on what has already been said — that is a question about
 * who to offer, and it belongs one level up.
 */
async function audienceOf(blockId: string, kind: string): Promise<NoticeTargetRow[]> {
  const call = callOfKind(kind);
  const view = await selectionView(blockId);
  if (!call || !view) return [];

  const announced = new Map((await repo.listOutcomes(blockId)).map((o) => [o.candidateId, o.outcome]));
  const mine = view.rows.filter((row) => (announced.get(row.candidate.id) ?? row.outcome) === call);
  const held = await suppressedAmong(mine.map((r) => r.candidate.email));

  return mine.map((row) => ({
    subjectId: row.candidate.id,
    as: 'candidate' as const,
    email: row.candidate.email,
    toName: row.candidate.contactName,
    orgName: row.candidate.orgName,
    blocked: !row.candidate.email
      ? 'no_email'
      : held.has(row.candidate.email.trim().toLowerCase())
        ? 'suppressed'
        : /* No account is no reason to withhold a refusal — there is nothing
             for them to log into and nothing to do. It only blocks a letter
             whose point is to send them somewhere. */
          call !== 'fail' && !row.candidate.accountState
          ? 'no_account'
          : '',
  }));
}

/**
 * Who this outcome's letter would name.
 *
 * Read from the announced decision rather than from the live rule: a startup
 * whose score moved this morning has not been un-announced, and writing to it
 * as though it had would be the platform contradicting a letter it sent
 * yesterday.
 *
 * `only` skips the "already told" exclusion on purpose — that exclusion builds
 * a list nobody has looked at, and somebody naming one startup has looked.
 */
export async function selectionRoster(blockId: string, kind: string, only?: string): Promise<NoticeTargetRow[]> {
  const all = await audienceOf(blockId, kind);
  if (only) return all.filter((r) => r.subjectId === only);
  const told = await toldAbout(blockId);
  return all.filter((r) => told.get(r.subjectId)?.kind !== kind);
}

/** Everybody this block has already written to, and what it told them. */
async function toldAbout(blockId: string): Promise<Map<string, { kind: string; at: string }>> {
  const out = new Map<string, { kind: string; at: string }>();
  for (const t of await repo.listNoticeTargets(blockId)) {
    if (!t.sentAt || t.skipped || !callOfKind(t.kind)) continue;
    out.set(t.subjectId, { kind: t.kind, at: t.sentAt });
  }
  return out;
}

/** One audience of a decision, as the screen lists it. */
export interface Audience {
  call: SelectionCall;
  kind: string;
  label: string;
  /** How many the announced decision puts here. */
  count: number;
  /** How many of those can actually be written to. */
  reachable: number;
  /** How many have already heard it, and when the last letter went. */
  told: number;
  lastToldAt: string | null;
}

/**
 * The three audiences, each with what is left to say to it.
 *
 * Read side by side on purpose: a gap between one audience told and another
 * still waiting is the thing worth seeing, and it is only visible next to its
 * neighbours.
 */
export async function selectionAudiences(blockId: string): Promise<{
  audiences: Audience[];
  published: boolean;
  /** Startups whose decision moved after they were written to. */
  contradicted: { candidateId: string; orgName: string; told: string; now: string }[];
}> {
  const block = await repo.getBlock(blockId);
  const view = await selectionView(blockId);
  if (!block || !view) return { audiences: [], published: false, contradicted: [] };
  const config = block.config as SelectionConfig;

  const announced = new Map((await repo.listOutcomes(blockId)).map((o) => [o.candidateId, o.outcome]));
  const told = await toldAbout(blockId);

  const calls: SelectionCall[] = config.waitOutcomeIds.length || view.waitCount > 0
    ? ['pass', 'wait', 'fail']
    : ['pass', 'fail'];

  const audiences: Audience[] = [];
  for (const call of calls) {
    const kind = SELECTION_KINDS[call];
    const mine = view.rows.filter((r) => (announced.get(r.candidate.id) ?? r.outcome) === call);
    const left = await selectionRoster(blockId, kind);
    const heard = mine.filter((r) => told.get(r.candidate.id)?.kind === kind);
    audiences.push({
      call,
      kind,
      label: labelOf(config, call),
      count: mine.length,
      reachable: left.filter((e) => !e.blocked).length,
      told: heard.length,
      lastToldAt: heard.map((r) => told.get(r.candidate.id)!.at).sort().pop() ?? null,
    });
  }

  /* Told one thing, and the decision has moved since. Nobody would think to
     look for this, and the person it happened to will phone about it. */
  const contradicted = view.rows
    .map((row) => {
      const letter = told.get(row.candidate.id);
      const now = announced.get(row.candidate.id) ?? row.outcome;
      if (!letter || letter.kind === SELECTION_KINDS[now]) return null;
      const was = callOfKind(letter.kind)!;
      return {
        candidateId: row.candidate.id,
        orgName: row.candidate.orgName,
        told: labelOf(config, was),
        now: labelOf(config, now),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return { audiences, published: view.published, contradicted };
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
  async filter(blockId, kind, subjectIds) {
    /* The audience, not the offer list: a startup already written to has
       dropped off the offer list, which is exactly the case an individual
       relaunch is for. */
    const here = new Map((await audienceOf(blockId, kind)).map((r) => [r.subjectId, r]));
    return new Map(subjectIds.map((id) => [id, here.has(id) ? here.get(id)!.blocked : 'decided otherwise']));
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
        prenom: firstNameOf(candidate.contactName, candidate.contactFirstName),
        acces: await accessFor(candidate.personId),
        startup: candidate.orgName,
        decision: labelOf(config, call),
        phase: block.name,
        lien: await appLink(),
      }),
    };
  },
};
