/**
 * Les One to One, lus et écrits.
 *
 * The workspace sees every meeting of a brick, the pool of startups it draws
 * from and its interlocutors. An interlocutor sees only their own meetings,
 * and the startup through a narrowed window: what it is, what it applied
 * with — never how to reach it, and never another interlocutor's report.
 */
import {
  blockStatus,
  editionIsVisible,
  editionTakesInput,
  forEcosystem,
  formPages,
  newId,
  orderedBlocks,
  profileOf,
  profileStarted,
  type ApplicationConfig,
  type Block,
  type Candidate,
  type FormField,
  type OneToOneConfig,
  type OneToOneMeeting,
  type OrgProfile,
  type PersonRef,
  type TrackWithPhases,
} from '@ceed/shared';
import { all, one } from '../db/client.js';
import * as dir from '../db/directory.js';
import { peopleByIds } from '../db/directory.js';
import * as repo from '../db/repo.js';
import { HttpError } from '../routes/util.js';
import { conflicted } from './reviews.js';
import { intakeFor } from './selection.js';

const COLS = `
  m.id, m.block_id as "blockId", m.candidate_id as "candidateId", o.name as "orgName",
  m.person_id as "personId", p.name as "personName", m.series_id as "seriesId",
  m.held_on::text as "heldOn", m.start_time as "startTime", m.duration_minutes as "durationMinutes",
  m.location, m.invite, m.token, m.rsvp_state as "rsvpState", m.responded_at::text as "respondedAt",
  m.status, m.report, m.report_submitted_at::text as "reportSubmittedAt", m.report_by_name as "reportByName",
  m.created_at::text as "createdAt"
  from one_to_one_meetings m
  join candidates c on c.id = m.candidate_id and c.deleted_at is null
  join records o on o.id = c.org_id
  join records p on p.id = m.person_id`;

/* Le plus proche d'abord ; ceux sans date, à la fin, dans l'ordre où on les a créés. */
const ORDER = `order by m.held_on nulls last, m.start_time nulls last, m.created_at`;

export const listMeetings = (blockId: string) =>
  all<OneToOneMeeting>(`select ${COLS} where m.block_id = $1 ${ORDER}`, [blockId]);

export const getMeeting = (id: string) => one<OneToOneMeeting>(`select ${COLS} where m.id = $1`, [id]);

function trackOf(tracks: TrackWithPhases[], blockId: string): TrackWithPhases | null {
  return tracks.find((t) => t.phases.some((p) => p.blocks.some((b) => b.id === blockId))) ?? null;
}

interface BrickContext {
  block: Block;
  config: OneToOneConfig;
  editionId: string;
  track: TrackWithPhases;
  /** Who reached this brick, withdrawals excluded. */
  intake: Candidate[];
}

async function brickContext(blockId: string): Promise<BrickContext | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'one_to_one') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail ? trackOf(detail.tracks, blockId) : null;
  if (!track) return null;
  const everyone = await repo.listCandidates(context.editionId, track.id);
  const intake = (await intakeFor(track, blockId, everyone)).filter((c) => c.status !== 'Withdrawn');
  return { block: context.block, config: context.block.config as OneToOneConfig, editionId: context.editionId, track, intake };
}

export interface OneToOneView {
  block: Block;
  config: OneToOneConfig;
  meetings: OneToOneMeeting[];
  /** Every startup that reached this brick, with its assigned mentor, if any. */
  pool: { candidate: Candidate }[];
  interlocutors: PersonRef[];
}

export async function oneToOneView(blockId: string): Promise<OneToOneView | null> {
  const ctx = await brickContext(blockId);
  if (!ctx) return null;
  const inPool = new Set(ctx.intake.map((c) => c.id));
  return {
    block: ctx.block,
    config: ctx.config,
    /* Une startup retirée depuis sort de la liste avec ses rendez-vous. */
    meetings: (await listMeetings(blockId)).filter((m) => inPool.has(m.candidateId)),
    pool: ctx.intake.map((candidate) => ({ candidate })),
    interlocutors: await peopleByIds(ctx.config.interlocutors),
  };
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

/**
 * Personne n'est à deux endroits à la fois : un interlocuteur déjà pris à
 * cette heure-là, dans cette brique ou une autre, est refusé.
 */
async function busy(personId: string, heldOn: string | null, startTime: string | null, except?: string) {
  if (!heldOn || !startTime) return false;
  const row = await one<{ id: string }>(
    `select id from one_to_one_meetings
      where person_id = $1 and held_on = $2::date and start_time = $3 and status <> 'cancelled'
        and ($4::text is null or id <> $4) limit 1`,
    [personId, heldOn, startTime, except ?? null],
  );
  return Boolean(row);
}

export async function planMeetings(
  blockId: string,
  input: {
    candidateIds: string[];
    personId: string;
    invite: 'slots' | 'confirm' | 'none';
    heldOn: string | null;
    startTime: string | null;
    durationMinutes?: number;
    location?: string;
  },
): Promise<OneToOneMeeting[]> {
  const ctx = await brickContext(blockId);
  if (!ctx) throw new HttpError(404, 'One to One not found.');
  if (!ctx.config.interlocutors.includes(input.personId)) {
    throw new HttpError(422, 'Add this person to the brick’s interlocutors first.', { personId: 'Not an interlocutor here.' });
  }
  /* Proposer ou fixer un rendez-vous, c'est donner une heure ; laisser
     réserver, c'est la laisser vide. */
  if (input.invite !== 'slots' && (!input.heldOn || !input.startTime)) {
    throw new HttpError(422, 'Give a date and a time.', { heldOn: 'A date and a time.' });
  }
  const inPool = new Set(ctx.intake.map((c) => c.id));
  const stranger = input.candidateIds.find((id) => !inPool.has(id));
  if (stranger) throw new HttpError(422, 'That startup has not reached this brick.');
  /* Plusieurs startups à la même heure avec la même personne : refusé, comme
     un second rendez-vous par-dessus un premier. */
  if (input.invite !== 'slots' && input.candidateIds.length > 1) {
    throw new HttpError(422, 'One startup per time slot — plan them one by one, or let them book.');
  }
  if (input.invite !== 'slots' && (await busy(input.personId, input.heldOn, input.startTime))) {
    throw new HttpError(409, 'They already have a meeting at that time.', { startTime: 'Already taken.' });
  }

  const made: OneToOneMeeting[] = [];
  for (const candidateId of input.candidateIds) {
    const id = newId('oto');
    await all(
      `insert into one_to_one_meetings
         (id, block_id, candidate_id, person_id, held_on, start_time, duration_minutes, location, invite, token, rsvp_state)
       values ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11)`,
      [
        id, blockId, candidateId, input.personId,
        input.invite === 'slots' ? null : input.heldOn,
        input.invite === 'slots' ? null : input.startTime,
        input.durationMinutes ?? ctx.config.durationMinutes,
        input.location ?? ctx.config.location,
        input.invite, newId('meet').replace('meet_', ''),
        /* Fixé sans invitation : il n'y a pas de réponse à attendre. */
        input.invite === 'none' ? 'confirmed' : 'pending',
      ],
    );
    made.push((await getMeeting(id))!);
  }
  return made;
}

export async function changeMeeting(
  id: string,
  patch: {
    personId?: string;
    heldOn?: string | null;
    startTime?: string | null;
    durationMinutes?: number;
    location?: string;
    status?: string;
  },
): Promise<OneToOneMeeting | null> {
  const current = await getMeeting(id);
  if (!current) return null;
  const personId = patch.personId ?? current.personId;
  const heldOn = patch.heldOn !== undefined ? patch.heldOn : current.heldOn;
  const startTime = patch.startTime !== undefined ? patch.startTime : current.startTime;
  if (patch.personId && patch.personId !== current.personId) {
    const ctx = await brickContext(current.blockId);
    if (!ctx?.config.interlocutors.includes(patch.personId)) {
      throw new HttpError(422, 'Add this person to the brick’s interlocutors first.');
    }
  }
  if ((patch.heldOn !== undefined || patch.startTime !== undefined || patch.personId) && (await busy(personId, heldOn, startTime, id))) {
    throw new HttpError(409, 'They already have a meeting at that time.', { startTime: 'Already taken.' });
  }
  const moved = heldOn !== current.heldOn || startTime !== current.startTime;
  const sets: string[] = [];
  const params: unknown[] = [id];
  const put = (column: string, value: unknown, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if (patch.personId !== undefined) put('person_id', patch.personId);
  if (patch.heldOn !== undefined) put('held_on', patch.heldOn, '::date');
  if (patch.startTime !== undefined) put('start_time', patch.startTime);
  if (patch.durationMinutes !== undefined) put('duration_minutes', patch.durationMinutes);
  if (patch.location !== undefined) put('location', patch.location);
  if (patch.status !== undefined) put('status', patch.status);
  /* Une heure proposée qui change est une nouvelle proposition : la réponse
     donnée à l'ancienne ne vaut pas pour celle-ci. */
  if (moved && current.invite === 'confirm') sets.push(`rsvp_state = 'pending'`, 'responded_at = null');
  if (sets.length) await all(`update one_to_one_meetings set ${sets.join(', ')} where id = $1`, params);
  return getMeeting(id);
}

export const dropMeeting = async (id: string): Promise<boolean> =>
  (await all<{ id: string }>('delete from one_to_one_meetings where id = $1 returning id', [id])).length > 0;

/* ------------------------------------------------------------------ */
/* The report                                                          */
/* ------------------------------------------------------------------ */

const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Écrire le compte rendu, ou l'envoyer.
 *
 * Saved as it is written — a meeting is not the moment to lose a paragraph —
 * and sent once: sending checks what is required and marks the meeting held.
 * Writing again after sending is allowed, and the date says when it was sent.
 */
export async function saveReport(
  id: string,
  answers: Record<string, unknown>,
  submit: boolean,
  by: { id: string; name: string },
): Promise<OneToOneMeeting> {
  const meeting = await getMeeting(id);
  if (!meeting) throw new HttpError(404, 'Meeting not found.');
  const block = await repo.getBlock(meeting.blockId);
  const fields = ((block?.config as OneToOneConfig | undefined)?.report.fields ?? []) as FormField[];
  /* Seules les questions du compte rendu s'enregistrent : une clé inventée
     par un client ne se glisse pas dans le rapport. */
  const kept = Object.fromEntries(Object.entries(answers).filter(([k]) => fields.some((f) => f.id === k)));
  if (submit) {
    const missing = fields.filter((f) => f.required && blank(kept[f.id]));
    if (missing.length) {
      throw new HttpError(
        422,
        'Some answers are missing.',
        Object.fromEntries(missing.map((f) => [`answers.${f.id}`, 'This answer is required.'])),
      );
    }
  }
  await all(
    `update one_to_one_meetings
        set report = $2::jsonb, report_by = $3, report_by_name = $4,
            report_submitted_at = case when $5 then coalesce(report_submitted_at, now()) else report_submitted_at end,
            status = case when $5 and status = 'planned' then 'held' else status end
      where id = $1`,
    [id, kept, by.id, by.name, submit],
  );
  return (await getMeeting(id))!;
}

/* ------------------------------------------------------------------ */
/* The interlocutor's side                                             */
/* ------------------------------------------------------------------ */

export interface MyMeeting extends OneToOneMeeting {
  programName: string;
  editionName: string;
  blockName: string;
  /** Whether the report may still be written: the brick's door. */
  state: 'open' | 'closed';
}

export interface MyMeetingDetail extends MyMeeting {
  questions: { pages: ReturnType<typeof formPages> };
  /** The startup as the ecosystem reads it — never how to reach it. */
  profile: OrgProfile | null;
  answers: { label: string; value: unknown; type: string }[];
}

/**
 * Les rendez-vous d'un interlocuteur, dans les briques dont la porte est
 * ouverte — ou fermée, pour relire ce qu'il a écrit. Une édition en
 * brouillon n'a pas de dehors, même pour lui.
 */
export async function meetingsFor(recordId: string): Promise<MyMeeting[]> {
  const mine = await all<OneToOneMeeting>(`select ${COLS} where m.person_id = $1 ${ORDER}`, [recordId]);
  if (!mine.length) return [];
  const ownOrgs = await dir.orgIdsOf(recordId);
  const out: MyMeeting[] = [];
  const contexts = new Map<string, { block: Block; program: string; edition: string; visible: boolean } | null>();
  for (const m of mine) {
    if (!contexts.has(m.blockId)) {
      const ctx = await repo.blockContext(m.blockId);
      const detail = ctx ? await repo.getEditionDetail(ctx.editionId) : null;
      contexts.set(
        m.blockId,
        ctx && detail
          ? { block: ctx.block, program: detail.program.name, edition: detail.name, visible: editionIsVisible(detail.status) }
          : null,
      );
    }
    const ctx = contexts.get(m.blockId);
    if (!ctx || !ctx.visible) continue;
    const status = blockStatus(ctx.block);
    if (status !== 'live' && status !== 'closed') continue;
    if (m.status === 'cancelled') continue;
    const candidate = await repo.getCandidate(m.candidateId);
    if (!candidate || conflicted(candidate, recordId, ownOrgs)) continue;
    out.push({
      ...m,
      programName: ctx.program,
      editionName: ctx.edition,
      blockName: ctx.block.name,
      state: status === 'live' ? 'open' : 'closed',
    });
  }
  return out;
}

export async function meetingFor(recordId: string, id: string): Promise<MyMeetingDetail | null> {
  const meeting = (await meetingsFor(recordId)).find((m) => m.id === id);
  if (!meeting) return null;
  const block = await repo.getBlock(meeting.blockId);
  const config = block!.config as OneToOneConfig;
  const candidate = await repo.getCandidate(meeting.candidateId);
  const ctx = await repo.blockContext(meeting.blockId);
  const detail = ctx ? await repo.getEditionDetail(ctx.editionId) : null;
  const track = detail && candidate ? detail.tracks.find((t) => t.id === candidate.trackId) : null;
  const application = track ? orderedBlocks(track).find((b) => b.type === 'application') : null;
  const questions = application ? ((application.config as ApplicationConfig).fields ?? []) : [];
  const org = candidate?.orgId ? await dir.getRecord(candidate.orgId) : null;
  const profile = org ? forEcosystem(profileOf(org)) : null;
  return {
    ...meeting,
    questions: { pages: formPages(config.report) },
    profile: profile && profileStarted(profile) ? profile : null,
    answers: candidate
      ? questions
          .filter((q) => !blank(candidate.answers[q.id]))
          .map((q) => ({ label: q.label, value: candidate.answers[q.id], type: q.type }))
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* The startup's answer                                                */
/* ------------------------------------------------------------------ */

export interface MeetingInvitation {
  programName: string;
  editionName: string;
  colour: string;
  orgName: string;
  personName: string;
  heldOn: string | null;
  startTime: string | null;
  durationMinutes: number;
  location: string;
  invite: OneToOneMeeting['invite'];
  rsvpState: OneToOneMeeting['rsvpState'];
  status: OneToOneMeeting['status'];
  /** Whether an answer may still be given. */
  open: boolean;
}

/**
 * Le rendez-vous tel que la startup le lit, par son lien.
 *
 * The same door as the committee's booking page: a draft edition has no
 * outside, and a finished one is read, not answered. Never the report.
 */
export async function invitationFor(token: string): Promise<{ meeting: OneToOneMeeting; page: MeetingInvitation } | null> {
  const meeting = await one<OneToOneMeeting>(`select ${COLS} where m.token = $1`, [token]);
  if (!meeting) return null;
  const ctx = await repo.blockContext(meeting.blockId);
  const detail = ctx ? await repo.getEditionDetail(ctx.editionId) : null;
  if (!detail || !editionIsVisible(detail.status)) return null;
  return {
    meeting,
    page: {
      programName: detail.program.name,
      editionName: detail.name,
      colour: detail.program.colour ?? '#2F5BFF',
      orgName: meeting.orgName,
      personName: meeting.personName,
      heldOn: meeting.heldOn,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      location: meeting.location,
      invite: meeting.invite,
      rsvpState: meeting.rsvpState,
      status: meeting.status,
      open:
        editionTakesInput(detail.status) &&
        meeting.invite === 'confirm' &&
        meeting.status === 'planned' &&
        Boolean(meeting.heldOn),
    },
  };
}

/** Oui ou non à une heure proposée. Rien d'autre ne s'écrit par ce lien. */
export async function answerInvitation(token: string, accept: boolean): Promise<MeetingInvitation> {
  const found = await invitationFor(token);
  if (!found) throw new HttpError(404, 'This invitation does not exist.');
  if (!found.page.open) throw new HttpError(403, 'This meeting can no longer be answered here. Get in touch with the team.');
  await all(`update one_to_one_meetings set rsvp_state = $2, responded_at = now() where id = $1`, [
    found.meeting.id,
    accept ? 'confirmed' : 'declined',
  ]);
  return (await invitationFor(token))!.page;
}
