/**
 * Prévenir, pour n'importe quelle brique.
 *
 * Writing to a list of startups is one act with one shape, whichever brick
 * asks for it: freeze who it names so somebody can read the list, filter every
 * target against the present at the hour it goes, claim each one so a restart
 * cannot send twice, and say in words why a letter did not leave. None of that
 * is about deliverables — a Selection announcing its outcomes needs it word for
 * word, and a committee calling its jury will too.
 *
 * So the machinery lives here and each brick supplies only what is genuinely
 * its own: who is on the list, whether this is a moment to send at all, and
 * what fills the letter.
 */
import { newId } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { fillTemplate } from '@ceed/shared';
import { flushOne, post, sendingIsLive } from './mail.js';
import { deliverableNotices } from './deliverables.js';
import { selectionNotices } from './selectionNotices.js';
import { committeeNotices } from './committeeNotices.js';
import { sourcingNotices } from './sourcingNotices.js';

/** One person a notice could name, and what stands in the way. */
export interface NoticeTargetRow {
  /** A candidacy or a directory record — whichever this audience is made of. */
  subjectId: string;
  /** Which of the two, so the target row names the right column. */
  as: 'candidate' | 'person';
  email: string;
  toName: string;
  orgName: string;
  /** '' when nothing does. Anything else is said on screen, by name. */
  blocked: string;
}

/** Why a notice cannot go out now, in words somebody reads. */
export type Gate = { go: true } | { go: false; wait: boolean; why: string };

/**
 * What a brick knows about writing to its own startups.
 *
 * Three questions, and nothing else. Everything a notice does besides these is
 * the same everywhere, which is the point of the interface.
 */
export interface NoticeSource {
  /**
   * Who this kind of notice would name, as the screen shows them.
   *
   * `only` names one startup and skips the list's own filters: they exist to
   * build a list nobody has looked at, and somebody pressing a button on one
   * row has looked.
   */
  roster(blockId: string, kind: string, only?: string): Promise<NoticeTargetRow[]>;
  /**
   * Why each of these can no longer be written to, at the hour it would go.
   * '' means send. The words are the brick's own — 'withdrawn' and 'not_owed'
   * say something a screen can print, where a single 'gone' says nothing.
   */
  filter(blockId: string, kind: string, subjectIds: string[]): Promise<Map<string, string>>;
  /**
   * Whether the moment has come. `wait` asks the tick to try again later
   * rather than give up — a notice scheduled before its block was ready is an
   * ordinary mistake, and going out early is worse than going out late.
   */
  gate(blockId: string, kind: string): Promise<Gate>;
  /**
   * The substitutions one letter would make, with nothing changed by asking.
   *
   * One place per brick, read by three: the list the window shows, the preview
   * that steps through recipients, and the test send. A value assembled a
   * second time is a preview of a letter nobody receives — which is the one
   * thing this window exists to prevent.
   */
  preview(blockId: string, kind: string, subjectId: string): Promise<Record<string, string>>;
  /**
   * The letter for one startup: the envelope and what goes in it.
   *
   * The recipient comes from here rather than from the roster, because the
   * roster is a list of who to offer and a startup already written to has
   * dropped off it — which is exactly the case an individual relaunch is for.
   */
  letter(
    blockId: string,
    kind: string,
    subjectId: string,
    body: string,
  ): Promise<{ kind: string; to: string; toName: string; subject: string; body: string } | null>;
}

const SOURCES: Record<string, NoticeSource> = {
  deliverable: deliverableNotices,
  selection: selectionNotices,
  committee: committeeNotices,
  sourcing: sourcingNotices,
};

/**
 * The hour of day a notice dated for a given day goes out.
 *
 * A door compares date strings and the builder only offers a day, but a notice
 * is an instant. `new Date('2026-11-15')` is midnight UTC — one in the morning
 * in Casablanca — so the hour is said out loud rather than inherited.
 */
const SEND_HOUR_UTC = Number(process.env.SEND_HOUR_UTC ?? 7);

/** A day as the builder writes it, at the hour letters go out. */
export const sendingInstant = (day: string): Date =>
  new Date(`${day.slice(0, 10)}T${String(SEND_HOUR_UTC).padStart(2, '0')}:00:00Z`);

/** How long a notice waits for a block that is not ready yet. */
const WAIT_DAYS = 7;

/** Kinds that exist to be repeated. Everything else is said once. */
const REPEATABLE = new Set(['reminder']);

export async function launchNotice(
  blockId: string,
  input: {
    kind: string;
    scheduledFor?: string | null;
    body: string;
    by?: { id: string; name: string };
    /** One startup, named by somebody looking at its row. */
    only?: string;
  },
): Promise<void> {
  const block = await repo.getBlock(blockId);
  const source = block && SOURCES[block.type];
  if (!source) return;

  const roster = await source.roster(blockId, input.kind, input.only);
  // Only those who can actually hear it are named. The rest are shown on the
  // screen by name, which is the point of looking before sending.
  const named = roster
    .filter((r) => !r.blocked)
    .map((r) => (r.as === 'candidate' ? { candidateId: r.subjectId } : { recordId: r.subjectId }));
  if (!named.length) return;

  /* Writing to one startup again is a deliberate act, so it supersedes the
     slot that stops a block saying the same thing to it twice. The old target
     keeps its date and its letter — what was done stays on the record — but it
     no longer bars this. */
  if (input.only) await repo.releaseTargets(blockId, input.only, input.kind);

  await repo.createNotice(
    {
      id: newId('dnt'),
      blockId,
      kind: input.kind,
      body: input.body,
      scheduledFor: (input.scheduledFor ? sendingInstant(input.scheduledFor) : new Date()).toISOString(),
      createdBy: input.by?.id ?? null,
      createdByName: input.by?.name ?? '',
    },
    named,
    !REPEATABLE.has(input.kind),
  );
}

/**
 * Sends what is due.
 *
 * Every non-send carries a reason a human reads. Nothing goes out silently and
 * nothing is abandoned silently.
 */
/**
 * Une lettre d'essai, à une adresse qu'on choisit.
 *
 * Composed by the server from the same substitutions the preview shows, so
 * what arrives is what would arrive — and it changes nothing: no target is
 * claimed, nobody is recorded as told, and no account is opened. A test that
 * had side effects would be a send with a different name.
 */
export async function sendTest(
  blockId: string,
  input: { kind: string; body: string; subjectId: string; to: string },
): Promise<{ written: boolean; live: boolean; state: string; error: string }> {
  const block = await repo.getBlock(blockId);
  const source = block && SOURCES[block.type];
  if (!source) return { written: false, live: false, state: 'failed', error: 'The block no longer exists.' };

  const values = await source.preview(blockId, input.kind, input.subjectId);
  const letter = await post({
    kind: `test_${input.kind}`,
    to: input.to,
    // Marked in the subject so nobody mistakes it for the real thing, in an
    // inbox or in the outbox three weeks later.
    subject: `[Essai] ${block.name}`,
    body: fillTemplate(input.body, values),
  });
  /* Offered at once rather than left to the timer: somebody is standing in
     front of the screen, and a button that says "sent" twenty seconds before
     the provider refuses it is worse than no button. */
  const out = letter ? await flushOne(letter) : { state: 'failed' as const, error: 'It could not be written down.' };
  return { written: Boolean(letter), live: sendingIsLive(), state: out.state, error: out.error };
}

export async function sendDueNotices(): Promise<{ sent: number; held: number }> {
  let sent = 0;
  let held = 0;

  for (const notice of await repo.dueNotices()) {
    const block = await repo.getBlock(notice.blockId);
    const source = block && SOURCES[block.type];
    if (!source) {
      await repo.settleNotice(notice.id, 'abandoned', 'The block no longer exists.');
      continue;
    }

    const gate = await source.gate(notice.blockId, notice.kind);
    if (!gate.go) {
      if (gate.wait && Date.now() - new Date(notice.scheduledFor).getTime() < WAIT_DAYS * 86_400_000) {
        held++;
        continue;
      }
      await repo.settleNotice(notice.id, 'abandoned', gate.why);
      continue;
    }

    /* The frozen set is a ceiling, never a floor: somebody the block has lost
       since the list was read back gets nothing, and nobody who was not read
       back is ever added. The reason is the brick's own word, because it is
       printed on a screen somebody reads. */
    const targets = await repo.targetsOf(notice.id);
    const waiting = targets.filter((t) => !t.sentAt);
    const reasons = await source.filter(
      notice.blockId,
      notice.kind,
      waiting.map((t) => t.subjectId),
    );
    for (const target of waiting) {
      const why = reasons.get(target.subjectId) ?? 'gone';
      if (why) {
        await repo.claimTarget(notice.id, target.subjectId);
        await repo.markTarget(notice.id, target.subjectId, { skipped: why });
        continue;
      }

      if (!(await repo.claimTarget(notice.id, target.subjectId))) continue;
      const written = await source.letter(notice.blockId, notice.kind, target.subjectId, notice.body);
      const letter = written
        ? await post({
            kind: written.kind,
            to: written.to,
            toName: written.toName,
            blockId: notice.blockId,
            candidateId: target.candidateId,
            subject: written.subject,
            body: written.body,
          })
        : null;
      // post() never throws and answers null when it could not: a loop of
      // fourteen can quietly write eleven, and the screen must not say otherwise.
      await repo.markTarget(notice.id, target.subjectId, {
        letterId: letter,
        skipped: letter ? '' : 'not_written',
      });
      if (letter) sent++;
    }

    await repo.settleNotice(notice.id, 'sent');
  }

  return { sent, held };
}
