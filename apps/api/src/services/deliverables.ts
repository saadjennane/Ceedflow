/**
 * What has been asked of the startups still in, and what has come back.
 *
 * One shape serves both readings the work needs. By startup: is this file
 * complete. By item: who still owes me the RIB. Those are the same matrix read
 * along its two axes, so the server sends the matrix and lets the screen turn
 * it — anything else would be two endpoints that can disagree.
 */
import {
  blockStatus,
  fillTemplate,
  longDate,
  orderedBlocks,
  type Candidate,
  type DeliverableConfig,
  type FormField,
} from '@ceed/shared';
import { newId } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { post, suppressedAmong } from './mail.js';
import { publicOrigin } from './platform.js';
import { intakeFor, trackOf } from './selection.js';

export interface DeliverableReturnView {
  itemId: string;
  value: unknown;
  state: 'received' | 'accepted' | 'rejected';
  reason: string;
  returnedAt: string | null;
  reviewedAt: string | null;
}

export interface DeliverableRow {
  candidate: Candidate;
  returns: DeliverableReturnView[];
  /** Required items with something in them — arrived, whatever was made of it. */
  done: number;
  /** Required items somebody at CEED has read and passed. */
  accepted: number;
  /** Items sent back, of any kind: what the startup still has to redo. */
  rejected: number;
  /**
   * Whether there is anything left for the startup itself to do.
   *
   * Not `!complete`: a file where everything has arrived and nobody at CEED
   * has read it yet is not complete, but chasing it would be reproaching the
   * startup for CEED's own backlog — and they would know it. What is left to
   * them is what has not been sent, and what has been sent back.
   */
  owes: boolean;
  required: number;
  /**
   * Every required item accepted. Not "every one arrived": a file nobody has
   * read is not a file in order, and the selection downstream reads this.
   */
  complete: boolean;
  /** When this startup was last written to about this block, or null. */
  askedAt: string | null;
  /** Why it would hear nothing, if it would. */
  blocked: Blocked;
}

/** One act of telling them, as the screen lists it. */
export interface NoticeSummary {
  id: string;
  kind: 'request' | 'reminder';
  state: 'planned' | 'sent' | 'cancelled' | 'abandoned';
  reason: string;
  scheduledFor: string;
  sentAt: string | null;
  createdByName: string;
  /** How many it named when it was launched. */
  named: number;
  /** How many letters were actually written. */
  wrote: number;
  /** How many were named and then left out, with the reasons counted. */
  skipped: Record<string, number>;
}

export interface DeliverableView {
  blockId: string;
  name: string;
  intro: string;
  /** The door, so the screen warns about launching into a shut list. */
  status: ReturnType<typeof blockStatus>;
  items: FormField[];
  rows: DeliverableRow[];
  notices: NoticeSummary[];
}

const given = (value: unknown) =>
  !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));

export async function deliverableView(blockId: string): Promise<DeliverableView | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'deliverable') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail ? trackOf(detail.tracks, blockId) : null;
  if (!track) return null;

  const config = context.block.config as DeliverableConfig;
  // Only the startups that got this far, and not the ones that have left: a
  // list of documents owed by somebody who withdrew is a list of chasing
  // nobody should do.
  const everyone = (await repo.listCandidates(context.editionId, track.id)).filter((c) => c.status !== 'Withdrawn');
  const intake = await intakeFor(track, blockId, everyone);

  const returns = await repo.listReturns(blockId);
  const byCandidate = new Map<string, DeliverableReturnView[]>();
  for (const row of returns) {
    const list = byCandidate.get(row.candidateId) ?? [];
    list.push({
      itemId: row.itemId, value: row.value, state: row.state,
      reason: row.reason, returnedAt: row.returnedAt, reviewedAt: row.reviewedAt,
    });
    byCandidate.set(row.candidateId, list);
  }

  const required = config.items.filter((i) => i.required);

  /* What has already been said, and who cannot hear it. Both live here rather
     than in the resolver that reads them, so the table's badge and the count in
     the launch button come from one computation and cannot drift apart. */
  const targets = await repo.listNoticeTargets(blockId);
  const askedAt = new Map<string, string>();
  for (const t of targets) {
    if (t.kind !== 'request' || !t.sentAt || t.skipped) continue;
    askedAt.set(t.candidateId, t.sentAt);
  }
  const held = await suppressedAmong(intake.map((c) => c.email));
  const notices = (await repo.listNotices(blockId)).map((notice) => {
    const mine = targets.filter((t) => t.noticeId === notice.id);
    const skipped: Record<string, number> = {};
    for (const t of mine) if (t.skipped) skipped[t.skipped] = (skipped[t.skipped] ?? 0) + 1;
    return {
      id: notice.id,
      kind: notice.kind,
      state: notice.state,
      reason: notice.reason,
      scheduledFor: notice.scheduledFor,
      sentAt: notice.sentAt,
      createdByName: notice.createdByName,
      named: mine.length,
      wrote: mine.filter((t) => t.letterId).length,
      skipped,
    };
  });

  return {
    blockId,
    name: context.block.name,
    intro: config.intro,
    status: blockStatus(context.block),
    notices,
    items: config.items,
    rows: intake.map((candidate) => {
      const mine = byCandidate.get(candidate.id) ?? [];
      const sent = (item: { id: string }) => mine.find((r) => r.itemId === item.id && given(r.value));
      const done = required.filter((item) => sent(item)).length;
      const accepted = required.filter((item) => sent(item)?.state === 'accepted').length;
      return {
        candidate,
        returns: mine,
        done,
        accepted,
        // Every item sent back, required or not: it is work the startup owes.
        rejected: mine.filter((r) => r.state === 'rejected').length,
        owes: done < required.length || mine.some((r) => r.state === 'rejected'),
        required: required.length,
        // An item that was never marked required cannot hold a file open.
        complete: accepted === required.length,
        askedAt: askedAt.get(candidate.id) ?? null,
        blocked: !candidate.email
          ? ('no_email' as const)
          : held.has(candidate.email.trim().toLowerCase())
            ? ('suppressed' as const)
            : // A letter that says "go to your page" is worth nothing to
              // somebody with no way in, and nothing here opens one for them.
              !candidate.accountState
              ? ('no_account' as const)
              : ('none' as const),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Who gets told                                                       */
/* ------------------------------------------------------------------ */

/** Why a startup will hear nothing, when it will not. */
export type Blocked = 'none' | 'no_email' | 'no_account' | 'suppressed';

export interface RosterEntry {
  candidate: Candidate;
  owes: boolean;
  /** When it was last written to about this block, or null. */
  askedAt: string | null;
  blocked: Blocked;
  /**
   * `{{pieces}}` for this one, as the letter will read it.
   *
   * Sent rather than worked out again on the screen: it is the one variable
   * that says something different to every recipient, which is the whole
   * reason the preview steps through them — and a second implementation of it
   * would be a preview that shows a letter nobody receives.
   */
  owed: string;
}

/** Everything the composing screen needs beside the list itself. */
export interface Roster {
  entries: RosterEntry[];
  /** Where the letter sends them, empty when this platform has no address set. */
  link: string;
  closesAt: string | null;
  /**
   * `{{date}}` as the letter will read it, composed here rather than on the
   * screen. The preview exists to show what goes out; a screen that formatted
   * the day its own way would show a date nobody receives — which is precisely
   * what it did before this field: “15 Nov 2026” on screen, “2026-11-15” in
   * the letter.
   */
  dateLabel: string;
}


/**
 * Who a notice of this kind would name, and what stands in the way.
 *
 * One function, three readers: the screen's counts and badges, the route that
 * writes a notice, and the tick that filters it at the hour. The dialog shows
 * whatever this returns and works nothing out of its own — a count that is a
 * promise about who will be written to must not be computed twice.
 */
export async function noticeRoster(blockId: string, kind: 'request' | 'reminder'): Promise<RosterEntry[]> {
  const view = await deliverableView(blockId);
  if (!view) return [];
  /* A request goes to whoever has not been asked; a reminder to whoever still
     owes something. Both read what the view already worked out, so the number
     in the button and the badge on the row are the same fact. */
  return view.rows
    .filter((row) => (kind === 'request' ? !row.askedAt : row.owes))
    .map((row) => ({
      candidate: row.candidate,
      owes: row.owes,
      askedAt: row.askedAt,
      blocked: row.blocked,
      owed: owedLines(view, row.candidate.id),
    }));
}

/** The list, plus what the screen needs to compose against it. */
export async function rosterFor(blockId: string, kind: 'request' | 'reminder'): Promise<Roster> {
  const block = await repo.getBlock(blockId);
  const config = block?.config as DeliverableConfig | undefined;
  return {
    entries: await noticeRoster(blockId, kind),
    link: await appLink(),
    closesAt: config?.closesAt ?? null,
    dateLabel: longDate(config?.closesAt),
  };
}

/**
 * The blocks a startup still owes something to, for its own page.
 *
 * Read from the edition rather than from a list kept somewhere: a block added
 * to the phase this morning is owed from this morning, with nothing to
 * migrate.
 */
export async function deliverablesFor(
  editionId: string,
  candidate: Candidate,
): Promise<
  {
    block: { id: string; name: string };
    config: DeliverableConfig;
    /** Whether the list still takes answers. The screen reads this rather than
        working it out again, so the two cannot disagree. */
    open: boolean;
    returns: DeliverableReturnView[];
  }[]
> {
  const detail = await repo.getEditionDetail(editionId);
  const track = detail?.tracks.find((t) => t.id === candidate.trackId);
  if (!track) return [];

  const out = [];
  for (const block of orderedBlocks(track).filter((b) => b.type === 'deliverable')) {
    const intake = await intakeFor(track, block.id, [candidate]);
    if (!intake.length) continue;
    /* The door decides what a founder sees, which it did not before: a list
       was visible the moment the upstream statuses put them in the pass set,
       whether or not anybody had opened it. Shut, it stays readable — the
       startup's own record of what it handed over — but nothing more. */
    const status = blockStatus(block);
    if (status !== 'live' && status !== 'closed') continue;
    const returns = await repo.listReturnsFor(block.id, candidate.id);
    out.push({
      block: { id: block.id, name: block.name },
      config: block.config as DeliverableConfig,
      open: status === 'live',
      returns: returns.map((r) => ({
        itemId: r.itemId, value: r.value, state: r.state,
        reason: r.reason, returnedAt: r.returnedAt, reviewedAt: r.reviewedAt,
      })),
    });
  }
  return out;
}

/**
 * Telling a startup that something it sent has to be sent again.
 *
 * Immediate, and not an act somebody launches: a file sitting refused that
 * nobody mentioned is the worst state this block can be in — CEED waits, the
 * startup waits, and the closing date arrives. The reason has already been
 * typed, so there is nothing left to compose.
 */
export async function tellReturned(
  blockId: string,
  candidateId: string,
  itemId: string,
  reason: string,
): Promise<void> {
  const block = await repo.getBlock(blockId);
  if (!block || block.type !== 'deliverable') return;
  const candidate = await repo.getCandidate(candidateId);
  if (!candidate?.email) return;

  const config = block.config as DeliverableConfig;
  const item = config.items.find((i) => i.id === itemId);
  await post({
    kind: 'deliverable_rejected',
    to: candidate.email,
    toName: candidate.contactName,
    blockId,
    candidateId,
    subject: `${block.name} — ${item?.label ?? 'une pièce'} à renvoyer`,
    body: fillTemplate(config.messages.rejected, {
      startup: candidate.orgName,
      piece: item?.label ?? '',
      motif: reason,
      lien: await appLink(),
    }),
  });
}

/* ------------------------------------------------------------------ */
/* Launching, and sending                                              */
/* ------------------------------------------------------------------ */

/**
 * The hour of day a notice dated for a given day goes out.
 *
 * The door compares date strings and the builder only offers a day, but a
 * notice is an instant. `new Date('2026-11-15')` is midnight UTC — one in the
 * morning in Casablanca — so the hour is said out loud rather than inherited.
 */
const SEND_HOUR_UTC = Number(process.env.SEND_HOUR_UTC ?? 7);

/** A day as the builder writes it, at the hour letters go out. */
export const sendingInstant = (day: string): Date =>
  new Date(`${day.slice(0, 10)}T${String(SEND_HOUR_UTC).padStart(2, '0')}:00:00Z`);

/** How long a notice waits for a list that has not opened yet. */
const WAIT_FOR_THE_DOOR_DAYS = 7;

export async function launchNotice(
  blockId: string,
  input: { kind: 'request' | 'reminder'; scheduledFor?: string | null; body: string; by?: { id: string; name: string } },
): Promise<void> {
  const roster = await noticeRoster(blockId, input.kind);
  // Only those who can actually hear it are named. The rest are shown on the
  // screen by name, which is the point of looking before sending.
  const named = roster.filter((r) => r.blocked === 'none').map((r) => r.candidate.id);
  if (!named.length) return;

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
  );
}

/**
 * Where a letter sends them.
 *
 * Empty when nothing says what this platform's address is, which the composing
 * screen refuses to send on: "connect somewhere" is not a call to action, and a
 * letter that says `{{lien}}` is worse than one not sent.
 */
export async function appLink(): Promise<string> {
  const origin = await publicOrigin();
  return origin ? `${origin}/me?tab=Programs` : '';
}

/** The items this startup still owes, in the words the letter uses. */
function owedLines(view: DeliverableView, candidateId: string): string {
  const row = view.rows.find((r) => r.candidate.id === candidateId);
  if (!row) return '';
  const lines: string[] = [];
  for (const item of view.items) {
    const mine = row.returns.find((r) => r.itemId === item.id);
    if (mine?.state === 'rejected') lines.push(`  · ${item.label} — à renvoyer : ${mine.reason}`);
    else if (item.required && !(mine && given(mine.value))) lines.push(`  · ${item.label}`);
  }
  return lines.join('\n');
}

/**
 * Sends what is due.
 *
 * Every non-send carries a reason a human reads. A list that has not opened is
 * waited for rather than abandoned — the common case is somebody who scheduled
 * the notice before setting the opening date, and going out early is worse
 * than going out late.
 */
export async function sendDueNotices(): Promise<{ sent: number; held: number }> {
  let sent = 0;
  let held = 0;

  for (const notice of await repo.dueNotices()) {
    const block = await repo.getBlock(notice.blockId);
    if (!block || block.type !== 'deliverable') {
      await repo.settleNotice(notice.id, 'abandoned', 'The block no longer exists.');
      continue;
    }

    const status = blockStatus(block);
    if (status === 'scheduled') {
      const waitedSince = new Date(notice.scheduledFor).getTime();
      if (Date.now() - waitedSince < WAIT_FOR_THE_DOOR_DAYS * 86_400_000) {
        held++;
        continue;
      }
      await repo.settleNotice(notice.id, 'abandoned', 'The list never opened.');
      continue;
    }
    if (status !== 'live') {
      await repo.settleNotice(notice.id, 'abandoned', 'The list was shut before this went out.');
      continue;
    }

    const view = (await deliverableView(notice.blockId))!;
    const still = new Map((await noticeRoster(notice.blockId, notice.kind)).map((r) => [r.candidate.id, r]));
    const config = block.config as DeliverableConfig;

    for (const target of await repo.targetsOf(notice.id)) {
      if (target.sentAt) continue;
      /* The frozen set is a ceiling, never a floor: somebody who withdrew or
         who the pass set lost since it was read back gets nothing, and nobody
         who was not read back is ever added. */
      const row = view.rows.find((r) => r.candidate.id === target.candidateId);
      const present = still.get(target.candidateId);
      const why = !row
        ? 'withdrawn'
        : notice.kind === 'reminder' && !row.owes
          ? 'not_owed'
          : present && present.blocked !== 'none'
            ? present.blocked
            : '';
      if (why) {
        await repo.claimTarget(notice.id, target.candidateId);
        await repo.markTarget(notice.id, target.candidateId, { skipped: why });
        continue;
      }

      if (!(await repo.claimTarget(notice.id, target.candidateId))) continue;
      const letter = await post({
        kind: notice.kind === 'request' ? 'deliverable_request' : 'deliverable_reminder',
        to: row!.candidate.email,
        toName: row!.candidate.contactName,
        blockId: notice.blockId,
        candidateId: target.candidateId,
        subject: `${block.name} — ${row!.candidate.orgName}`,
        body: fillTemplate(notice.body, {
          startup: row!.candidate.orgName,
          pieces: owedLines(view, target.candidateId),
          date: longDate(config.closesAt),
          lien: await appLink(),
        }),
      });
      // post() never throws and answers null when it could not: a loop of
      // fourteen can quietly write eleven, and the screen must not say otherwise.
      await repo.markTarget(notice.id, target.candidateId, {
        letterId: letter,
        skipped: letter ? '' : 'not_written',
      });
      if (letter) sent++;
    }

    await repo.settleNotice(notice.id, 'sent');
  }

  return { sent, held };
}
