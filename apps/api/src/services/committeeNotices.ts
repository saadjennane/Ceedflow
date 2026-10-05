/**
 * Convoquer un comité : deux populations, deux lettres.
 *
 * A juror is told who they will see; a startup is told when it is expected.
 * Neither sentence belongs in the other's letter, so these are two acts with
 * two templates — and the jury's letter is the one CEED has been writing by
 * hand.
 *
 * Both go out for the whole block rather than sitting by sitting. A programme
 * with five sittings would otherwise press the same button five times, and
 * each letter carries its own sitting's date anyway: what differs is in the
 * letter, not in the act.
 */
import {
  ACCESS_SAMPLE,
  COMMITTEE_JURY_VARIABLES,
  COMMITTEE_STARTUP_VARIABLES,
  fillTemplate,
  firstNameOf,
  longDate,
  type CommitteeConfig,
} from '@ceed/shared';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { committeeView, type SessionView } from './committee.js';
import { appLink } from './deliverables.js';
import { accessFor, wouldAccess } from './invitations.js';
import { accessMessage } from './platform.js';
import { suppressedAmong } from './mail.js';
import type { Gate, NoticeSource, NoticeTargetRow } from './notices.js';

export const COMMITTEE_KINDS = { jury: 'committee_jury', startup: 'committee_startup' } as const;
export type CommitteeAudience = keyof typeof COMMITTEE_KINDS;

export const audienceOfKind = (kind: string): CommitteeAudience | null =>
  kind === COMMITTEE_KINDS.jury ? 'jury' : kind === COMMITTEE_KINDS.startup ? 'startup' : null;

/** The sitting somebody belongs to, which is what their letter is about. */
const sittingOf = (sessions: SessionView[], has: (s: SessionView) => boolean) => sessions.find(has) ?? null;

/** "de 09:00 à 12:00", from the stretches of the day a sitting runs. */
const hoursOf = (s: SessionView): string => {
  const windows = s.session.windows;
  if (!windows.length) return '';
  const first = windows[0]!;
  const last = windows[windows.length - 1]!;
  return `${first.startsAt} à ${last.endsAt}`;
};

/* A location and a slot are optional, so the sentence has to close either way.
   "le 20 octobre ." is what a template full of bare variables produces, and it
   is the sort of thing that goes out to nine jurors before anybody notices. */
const placeOf = (s: SessionView): string => (s.session.location ? `, à ${s.session.location}` : '');

async function everyone(blockId: string) {
  const view = await committeeView(blockId);
  if (!view || view.block.type !== 'committee') return null;
  return view;
}

/** The jurors sitting on this committee, each with the panel they are on. */
async function juryRows(blockId: string): Promise<NoticeTargetRow[]> {
  const view = await everyone(blockId);
  if (!view) return [];

  const ids = [...new Set(view.sessions.flatMap((s) => s.jury.map((j) => j.id)))];
  if (!ids.length) return [];
  const records = await dir.recordsByIds(ids);
  const held = await suppressedAmong(records.map((r) => r.email ?? ''));

  return records.map((person) => ({
    subjectId: person.id,
    as: 'person' as const,
    email: person.email ?? '',
    toName: person.name,
    orgName: person.name,
    blocked: !person.email
      ? 'no_email'
      : held.has(person.email.trim().toLowerCase())
        ? 'suppressed'
        : /* An account is no longer a condition: the letter opens one and
             carries the way in. */
          '',
  }));
}

/** The startups seated on a sitting. Those still in the pool are not convened. */
async function startupRows(blockId: string): Promise<NoticeTargetRow[]> {
  const view = await everyone(blockId);
  if (!view) return [];

  const seated = view.sessions.flatMap((s) => s.assignments.map((a) => ({ a, s })));
  const held = await suppressedAmong(seated.map(({ a }) => a.candidate.email));

  return seated.map(({ a }) => ({
    subjectId: a.candidate.id,
    as: 'candidate' as const,
    email: a.candidate.email,
    toName: a.candidate.contactName,
    orgName: a.candidate.orgName,
    blocked: !a.candidate.email
      ? 'no_email'
      : held.has(a.candidate.email.trim().toLowerCase())
        ? 'suppressed'
        : '',
  }));
}

/** Everybody this block has already written to about each audience. */
async function toldAbout(blockId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const t of await repo.listNoticeTargets(blockId)) {
    if (!t.sentAt || t.skipped || !audienceOfKind(t.kind)) continue;
    out.set(`${t.kind}:${t.subjectId}`, t.sentAt);
  }
  return out;
}

async function audienceRows(blockId: string, kind: string): Promise<NoticeTargetRow[]> {
  const who = audienceOfKind(kind);
  if (!who) return [];
  return who === 'jury' ? juryRows(blockId) : startupRows(blockId);
}

export async function committeeRoster(blockId: string, kind: string, only?: string): Promise<NoticeTargetRow[]> {
  const all = await audienceRows(blockId, kind);
  if (only) return all.filter((r) => r.subjectId === only);
  const told = await toldAbout(blockId);
  return all.filter((r) => !told.has(`${kind}:${r.subjectId}`));
}

/** The two audiences side by side, with what is left to say to each. */
export async function committeeAudiences(blockId: string): Promise<{
  audiences: { audience: CommitteeAudience; kind: string; label: string; count: number; reachable: number; told: number }[];
  ready: boolean;
}> {
  const view = await everyone(blockId);
  if (!view) return { audiences: [], ready: false };
  const told = await toldAbout(blockId);

  const audiences = [];
  for (const [audience, kind] of Object.entries(COMMITTEE_KINDS) as [CommitteeAudience, string][]) {
    const all = await audienceRows(blockId, kind);
    const left = await committeeRoster(blockId, kind);
    audiences.push({
      audience,
      kind,
      label: audience === 'jury' ? 'The jury' : 'The startups',
      count: all.length,
      reachable: left.filter((r) => !r.blocked).length,
      told: all.filter((r) => told.has(`${kind}:${r.subjectId}`)).length,
    });
  }
  // A sitting with no date is a convocation that cannot name one.
  return { audiences, ready: view.sessions.some((s) => Boolean(s.session.heldOn)) };
}

/** The substitutions this person's letter will actually make. */
export async function committeeValues(
  blockId: string,
  kind: string,
  subjectId: string,
  /** A preview asks for the words only: it must never open an account. */
  preview = false,
): Promise<Record<string, string> | null> {
  const who = audienceOfKind(kind);
  const view = await everyone(blockId);
  if (!who || !view) return null;
  const link = await appLink();

  if (who === 'jury') {
    const sitting = sittingOf(view.sessions, (s) => s.jury.some((j) => j.id === subjectId));
    if (!sitting) return null;
    const person = sitting.jury.find((j) => j.id === subjectId)!;
    const record = await dir.getRecord(subjectId);
    return {
      prenom: firstNameOf(person.name, record?.firstName),
      acces: preview ? '' : await accessFor(subjectId),
      jure: person.name,
      panel: sitting.session.name,
      date: longDate(sitting.session.heldOn),
      heures: hoursOf(sitting),
      lieu: placeOf(sitting),
      startups: sitting.assignments.map((a) => `  · ${a.candidate.orgName}`).join('\n'),
      lien: link,
    };
  }

  const sitting = sittingOf(view.sessions, (s) => s.assignments.some((a) => a.candidate.id === subjectId));
  if (!sitting) return null;
  const seat = sitting.assignments.find((a) => a.candidate.id === subjectId)!;
  return {
    prenom: firstNameOf(seat.candidate.contactName, seat.candidate.contactFirstName),
    acces: preview ? '' : await accessFor(seat.candidate.personId),
    startup: seat.candidate.orgName,
    panel: sitting.session.name,
    date: longDate(sitting.session.heldOn),
    // Nothing rather than a half sentence when the slot has not been given out.
    heure: seat.slot ? ` à ${seat.slot.startsAt}` : '',
    lieu: placeOf(sitting),
    lien: link,
  };
}

export const COMMITTEE_VARIABLES = {
  jury: COMMITTEE_JURY_VARIABLES,
  startup: COMMITTEE_STARTUP_VARIABLES,
};

export const committeeNotices: NoticeSource = {
  async preview(blockId, kind, subjectId): Promise<Record<string, string>> {
    const values = await committeeValues(blockId, kind, subjectId, true);
    const rows = await committeeRoster(blockId, kind, subjectId);
    const who = audienceOfKind(kind) === 'jury' ? subjectId : (await repo.getCandidate(subjectId))?.personId;
    const sample = (await wouldAccess(who)) ? ACCESS_SAMPLE(rows[0]?.email ?? '', await accessMessage()) : '';
    return { ...(values ?? {}), acces: sample };
  },

  roster: committeeRoster,

  async filter(blockId, kind, subjectIds) {
    /* The audience, not the offer list: somebody already written to has
       dropped off the offer list, which is what an individual send is for. */
    const here = new Map((await audienceRows(blockId, kind)).map((r) => [r.subjectId, r]));
    return new Map(subjectIds.map((id) => [id, here.has(id) ? here.get(id)!.blocked : 'off the panel']));
  },

  async gate(blockId): Promise<Gate> {
    const view = await everyone(blockId);
    if (!view) return { go: false, wait: false, why: 'The block no longer exists.' };
    /* Waited for rather than abandoned: scheduling the letters before fixing
       the day is an ordinary order to do things in, and a convocation with no
       date is worse than one that arrives late. */
    if (!view.sessions.some((s) => s.session.heldOn)) {
      return { go: false, wait: true, why: 'No sitting ever got a date.' };
    }
    return { go: true };
  },

  async letter(blockId, kind, subjectId, body) {
    const who = audienceOfKind(kind);
    const view = await everyone(blockId);
    const values = await committeeValues(blockId, kind, subjectId);
    const rows = await audienceRows(blockId, kind);
    const row = rows.find((r) => r.subjectId === subjectId);
    if (!who || !view || !values || !row) return null;
    void (view.block.config as CommitteeConfig);
    return {
      kind,
      to: row.email,
      toName: row.toName,
      subject: who === 'jury' ? `${view.block.name} — ${values.panel}` : `${view.block.name} — ${row.orgName}`,
      body: fillTemplate(body, values),
    };
  },
};
