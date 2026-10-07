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
import { ACCESS_SAMPLE, type SelectionConfig, fillTemplate, firstNameOf } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { appLink } from './deliverables.js';
import { accessFor, wouldAccess } from './invitations.js';
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
        : /* Avoir un compte n'est plus une condition.
             It was one while a letter could only point at a door the startup
             had no key to. The letter now carries the key — `{{acces}}` opens
             the account and hands over the password — so refusing to write is
             refusing the very thing that would let them in. And it refused it
             exactly where it hurts: a cohort told it is retained is, almost by
             definition, a cohort that has never signed in. What is left is a
             question about the wording, which the send window asks by name:
             somebody with no account and a letter that never says how to get
             in. */
          '',
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
  async preview(blockId, kind, subjectId): Promise<Record<string, string>> {
    const call = callOfKind(kind);
    const block = await repo.getBlock(blockId);
    const candidate = await repo.getCandidate(subjectId);
    if (!call || !block || !candidate) return {};
    const config = block.config as SelectionConfig;
    return {
      prenom: firstNameOf(candidate.contactName, candidate.contactFirstName),
      acces: (await wouldAccess(candidate.personId))
        ? ACCESS_SAMPLE(candidate.email, config.messages.access)
        : '',
      startup: candidate.orgName,
      decision: labelOf(config, call),
      phase: block.name,
      lien: await appLink(),
    };
  },

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
    /* Nothing else to wait for. Launching the send is what announced this
       audience — the decision was written down before the first letter was
       composed, so there is no state left for the letter to get ahead of. */
    return { go: true };
  },

  async letter(blockId, kind, candidateId, body) {
    const call = callOfKind(kind);
    const block = await repo.getBlock(blockId);
    const candidate = await repo.getCandidate(candidateId);
    if (!call || !block || !candidate) return null;
    const config = block.config as SelectionConfig;
    const values = {
      prenom: firstNameOf(candidate.contactName, candidate.contactFirstName),
      acces: await accessFor(candidate.personId, config.messages.access),
      startup: candidate.orgName,
      decision: labelOf(config, call),
      phase: block.name,
      lien: await appLink(),
    };
    /* L'objet par audience : « retenue » et « non retenue » ne s'annoncent pas
       de la même façon dans une boîte mail, et c'est la seule ligne qu'on lit
       avant de décider d'ouvrir. */
    const written = config.messages.subjects[call];
    return {
      kind,
      to: candidate.email,
      toName: candidate.contactName,
      subject: fillTemplate(written, values).trim() || block.name,
      body: fillTemplate(body, values),
    };
  },
};
