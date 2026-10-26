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
  type FreeCell,
  type Frequency,
  type OneToOneDay,
  fillTemplate,
  firstNameOf,
  freeCells,
  longDate,
  seriesDates,
  CONTACT_FIELD_TYPES,
} from '@ceed/shared';
import { accessFor } from './invitations.js';
import { isTestRecord } from './testIdentity.js';
import { post } from './mail.js';
import { publicOrigin } from './platform.js';
import { all, one } from '../db/client.js';
import * as dir from '../db/directory.js';
import { peopleByIds } from '../db/directory.js';
import * as repo from '../db/repo.js';
import { HttpError } from '../routes/util.js';
import { conflicted } from './reviews.js';
import { intakeFor } from './selection.js';

const COLS = `
  m.id, m.block_id as "blockId", m.candidate_id as "candidateId", o.name as "orgName",
  m.person_id as "personId", coalesce(p.name, '') as "personName", m.series_id as "seriesId", m.day_id as "dayId",
  m.held_on::text as "heldOn", m.start_time as "startTime", m.duration_minutes as "durationMinutes",
  m.location, m.invite, m.token, m.rsvp_state as "rsvpState", m.responded_at::text as "respondedAt",
  m.status, m.report, m.report_submitted_at::text as "reportSubmittedAt", m.report_by_name as "reportByName",
  m.created_at::text as "createdAt",
  m.told_startup_at::text as "toldStartupAt", m.told_person_at::text as "toldPersonAt"
  from one_to_one_meetings m
  join candidates c on c.id = m.candidate_id and c.deleted_at is null
  join records o on o.id = c.org_id
  left join records p on p.id = m.person_id`;

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
  /** What the brick could take either way, to say it out loud. */
  reach: { upstream: number; track: number; from: string | null };
}

async function brickContext(blockId: string): Promise<BrickContext | null> {
  const context = await repo.blockContext(blockId);
  if (!context || context.block.type !== 'one_to_one') return null;
  const detail = await repo.getEditionDetail(context.editionId);
  const track = detail ? trackOf(detail.tracks, blockId) : null;
  if (!track) return null;
  const config = context.block.config as OneToOneConfig;
  const everyone = (await repo.listCandidates(context.editionId, track.id)).filter((c) => c.status !== 'Withdrawn');
  const upstream = await intakeFor(track, blockId, everyone);
  /* La sélection d'où viennent les startups, nommée : sans elle, un vivier
     vide ne dit pas pourquoi il l'est. */
  const ordered = orderedBlocks(track);
  const at = ordered.findIndex((b) => b.id === blockId);
  const from = ordered.slice(0, at === -1 ? ordered.length : at).filter((b) => b.type === 'selection').pop()?.name ?? null;
  return {
    block: context.block,
    config,
    editionId: context.editionId,
    track,
    intake: config.intake === 'track' ? everyone : upstream,
    reach: { upstream: upstream.length, track: everyone.length, from },
  };
}

export interface OneToOneView {
  block: Block;
  config: OneToOneConfig;
  meetings: OneToOneMeeting[];
  /** Every startup that reached this brick, with its assigned mentor, if any. */
  pool: { candidate: Candidate }[];
  interlocutors: PersonRef[];
  days: OneToOneDay[];
  reach: BrickContext['reach'];
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
    days: await listDays(blockId),
    reach: ctx.reach,
  };
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

/**
 * Personne n'est à deux endroits à la fois : un interlocuteur déjà pris à
 * cette heure-là, dans cette brique ou une autre, est refusé.
 */
async function busy(personId: string | null, heldOn: string | null, startTime: string | null, except?: string) {
  if (!personId || !heldOn || !startTime) return false;
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
    personId: string | null;
    dayId?: string | null;
    invite: 'slots' | 'confirm' | 'none';
    heldOn: string | null;
    startTime: string | null;
    durationMinutes?: number;
    location?: string;
    repeat?: { frequency: Frequency; count: number | null; until: string | null } | null;
    tell?: boolean;
  },
): Promise<OneToOneMeeting[]> {
  const ctx = await brickContext(blockId);
  if (!ctx) throw new HttpError(404, 'One to One not found.');
  const books = input.invite === 'slots';
  /* Sans interlocuteur, seulement pour une startup invitée à réserver : elle
     choisira chez qui en même temps que quand. */
  if (!input.personId && !books) throw new HttpError(422, 'Who are they meeting?', { personId: 'Who are they meeting?' });
  if (input.personId && !ctx.config.interlocutors.includes(input.personId)) {
    throw new HttpError(422, 'Add this person to the brick’s interlocutors first.', { personId: 'Not an interlocutor here.' });
  }
  /* Proposer ou fixer un rendez-vous, c'est donner une heure ; laisser
     réserver, c'est la laisser vide. */
  if (!books && (!input.heldOn || !input.startTime)) {
    throw new HttpError(422, 'Give a date and a time.', { heldOn: 'A date and a time.' });
  }
  const inPool = new Set(ctx.intake.map((c) => c.id));
  if (input.candidateIds.some((id) => !inPool.has(id))) throw new HttpError(422, 'That startup has not reached this brick.');
  /* Plusieurs startups à la même heure avec la même personne : refusé, comme
     un second rendez-vous par-dessus un premier. Laisser réserver, si : chacune
     prendra son créneau. */
  if (!books && input.candidateIds.length > 1) {
    throw new HttpError(422, 'One startup per time slot — plan them one by one, or let them book.');
  }
  if (input.repeat && (books || input.candidateIds.length > 1)) {
    throw new HttpError(422, 'A series is one startup, at a set time.');
  }

  /* Les dates : une, ou toutes celles de la série. Une seule déjà prise, et
     rien n'est créé — une série à trous se découvrirait séance après séance. */
  const dates = !books && input.repeat
    ? seriesDates(input.heldOn!, input.repeat.frequency, { count: input.repeat.count, until: input.repeat.until })
    : [input.heldOn];
  if (!books) {
    const clashes: string[] = [];
    for (const date of dates) if (await busy(input.personId, date, input.startTime)) clashes.push(date!);
    if (clashes.length) {
      throw new HttpError(409, `They already have a meeting at that time on ${clashes.join(', ')}.`, {
        startTime: 'Already taken.',
      });
    }
  }

  /* Dans une journée : sa durée et son lieu, et l'interlocuteur doit y recevoir. */
  const theDay = input.dayId ? await getDay(input.dayId) : null;
  if (input.dayId && (!theDay || theDay.blockId !== blockId)) throw new HttpError(404, 'Day not found.');
  if (theDay && input.personId && !theDay.interlocutors.includes(input.personId)) {
    throw new HttpError(422, 'This interlocutor does not receive on that day.');
  }
  const duration = input.durationMinutes ?? theDay?.minutesPerMeeting ?? ctx.config.durationMinutes;
  const location = input.location ?? (theDay?.location || ctx.config.location);
  let seriesId: string | null = null;
  if (!books && input.repeat) {
    seriesId = newId('ser');
    await all(
      `insert into one_to_one_series (id, block_id, candidate_id, person_id, frequency, first_on, start_time,
                                      until_on, count, duration_minutes, location)
       values ($1,$2,$3,$4,$5,$6::date,$7,$8::date,$9,$10,$11)`,
      [seriesId, blockId, input.candidateIds[0], input.personId, input.repeat.frequency, input.heldOn,
        input.startTime, input.repeat.until, input.repeat.count, duration, location],
    );
  }

  const made: OneToOneMeeting[] = [];
  for (const candidateId of input.candidateIds) {
    for (const date of dates) {
      const id = newId('oto');
      await all(
        `insert into one_to_one_meetings
           (id, block_id, candidate_id, person_id, series_id, held_on, start_time, duration_minutes, location,
            invite, token, rsvp_state, day_id)
         values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id, blockId, candidateId, input.personId, seriesId,
          books ? null : date, books ? null : input.startTime, duration, location,
          input.invite, newId('meet').replace('meet_', ''),
          /* Fixé sans invitation : il n'y a pas de réponse à attendre. */
          input.invite === 'none' ? 'confirmed' : 'pending',
          books || seriesId ? null : (input.dayId ?? null),
        ],
      );
      made.push((await getMeeting(id))!);
    }
  }
  /* Une série s'annonce une fois, par sa première séance, et dit son rythme :
     cinquante-deux lettres pour un mentoring hebdomadaire, personne ne les lit. */
  if (input.tell) {
    const firsts = seriesId ? made.slice(0, 1) : made;
    const rhythm = seriesId && input.repeat ? rhythmLine(input.repeat.frequency, dates[dates.length - 1]!) : '';
    for (const m of firsts) await tellMeeting(m.id, { startup: true, person: true }, rhythm);
  }
  return made;
}

/** « Puis toutes les semaines, jusqu'au 15 décembre. » */
const rhythmLine = (frequency: Frequency, last: string) =>
  `Puis ${frequency === 'weekly' ? 'toutes les semaines' : frequency === 'biweekly' ? 'toutes les deux semaines' : 'tous les mois'}, jusqu’au ${longDate(last)}.`;

export async function changeMeeting(
  id: string,
  patch: {
    personId?: string;
    dayId?: string | null;
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
  if (patch.dayId !== undefined) put('day_id', patch.dayId);
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

/**
 * Cette séance et les suivantes d'une série : annulées, sans toucher aux
 * passées — leurs comptes rendus sont l'histoire du mentoring.
 */
export async function cancelFollowing(id: string): Promise<number> {
  const m = await getMeeting(id);
  if (!m?.seriesId) return 0;
  const rows = await all<{ id: string }>(
    `update one_to_one_meetings set status = 'cancelled'
      where series_id = $1 and status = 'planned' and (held_on is null or held_on >= $2::date)
      returning id`,
    [m.seriesId, m.heldOn],
  );
  return rows.length;
}

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
  const testViewer = await isTestRecord(recordId);
  for (const m of mine) {
    if (!contexts.has(m.blockId)) {
      const ctx = await repo.blockContext(m.blockId);
      const detail = ctx ? await repo.getEditionDetail(ctx.editionId) : null;
      contexts.set(
        m.blockId,
        ctx && detail
          ? {
              block: ctx.block,
              program: detail.program.name,
              edition: detail.name,
              // L'espace de test et le vrai ne se voient pas.
              visible: editionIsVisible(detail.status) && Boolean(detail.program.isTest) === testViewer,
            }
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
      /* Le lien de la startup est à elle : l'interlocuteur qui l'aurait
         pourrait confirmer, refuser ou réserver à sa place. */
      token: '',
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
          .filter((q) => !blank(candidate.answers[q.id]) && !CONTACT_FIELD_TYPES.includes(q.type))
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
  /** For a meeting the startup books: what is free in the days, and with whom. */
  slots: BookableCell[];
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
  /* Répondre à une heure proposée, ou réserver la sienne — et rien quand la
     séance est fixée, passée ou annulée, ou l'édition terminée. */
  const open =
    editionTakesInput(detail.status) &&
    meeting.status === 'planned' &&
    (meeting.invite === 'confirm' ? Boolean(meeting.heldOn) : meeting.invite === 'slots');
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
      open,
      slots: open && meeting.invite === 'slots' ? await slotsFor(meeting) : [],
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

/* ------------------------------------------------------------------ */
/* Letters                                                             */
/* ------------------------------------------------------------------ */

/**
 * Écrire à la startup, à l'interlocuteur, ou aux deux, à propos d'un rendez-vous.
 *
 * Posted rather than sent, like every other letter: a mail provider having a
 * bad minute does not undo a meeting. The startup is told what to do — book,
 * confirm, or nothing — with its own link; the interlocutor where to open the
 * meeting and write the report, and how to get in when they never have.
 */
export async function tellMeeting(
  id: string,
  who: { startup?: boolean; person?: boolean },
  extra = '',
): Promise<{ startup: boolean; person: boolean }> {
  const m = await getMeeting(id);
  if (!m) throw new HttpError(404, 'Meeting not found.');
  const ctx = await repo.blockContext(m.blockId);
  const detail = ctx ? await repo.getEditionDetail(ctx.editionId) : null;
  const config = ctx?.block.config as OneToOneConfig | undefined;
  if (!ctx || !detail || !config) throw new HttpError(404, 'Meeting not found.');
  const origin = await publicOrigin();
  const programme = `${detail.program.name} — ${detail.name}`;
  const quand = [
    m.heldOn ? `Le ${longDate(m.heldOn)}${m.startTime ? ` à ${m.startTime}` : ''}, pour ${m.durationMinutes} minutes.` : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
  const lieu = m.location ? `Lieu : ${m.location}.` : '';
  const out = { startup: false, person: false };

  if (who.startup) {
    const candidate = await repo.getCandidate(m.candidateId);
    const to = candidate?.email?.trim();
    if (candidate && to) {
      const link = origin ? `${origin}/meet/${m.token}` : '';
      const action =
        m.invite === 'slots'
          ? `Choisissez votre créneau ici : ${link}`
          : m.invite === 'confirm'
            ? `Confirmez, ou dites-nous si l’heure ne convient pas : ${link}`
            : '';
      const values = {
        prenom: firstNameOf(candidate.contactName, candidate.contactFirstName),
        startup: m.orgName,
        interlocuteur: m.personName || 'un interlocuteur du programme',
        programme,
        quand: m.invite === 'slots' && !m.heldOn ? '' : quand,
        lieu,
        action,
        lien: link,
      };
      const posted = await post({
        kind: 'one_to_one_startup',
        to,
        toName: candidate.contactName,
        recordId: candidate.personId,
        blockId: m.blockId,
        candidateId: m.candidateId,
        subject: fillTemplate(config.messages.subjects.startup, values),
        body: fillTemplate(config.messages.startup, values),
      });
      if (posted) {
        await all('update one_to_one_meetings set told_startup_at = now() where id = $1', [id]);
        out.startup = true;
      }
    }
  }

  if (who.person && m.personId) {
    const person = await dir.getRecord(m.personId);
    const to = person?.email?.trim();
    if (person && to) {
      const values = {
        prenom: firstNameOf(person.name, person.firstName),
        startup: m.orgName,
        programme,
        quand: m.invite === 'slots' && !m.heldOn ? 'La startup choisira son créneau parmi vos disponibilités.' : quand,
        lieu,
        lien: origin ? `${origin}/meeting/${m.id}` : '',
        acces: config.messages.person.includes('{{acces}}') ? await accessFor(m.personId, config.messages.access) : '',
      };
      const posted = await post({
        kind: 'one_to_one_person',
        to,
        toName: person.name,
        recordId: m.personId,
        blockId: m.blockId,
        candidateId: m.candidateId,
        subject: fillTemplate(config.messages.subjects.person, values),
        body: fillTemplate(config.messages.person, values),
      });
      if (posted) {
        await all('update one_to_one_meetings set told_person_at = now() where id = $1', [id]);
        out.person = true;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

const DAY_COLS = `id, block_id as "blockId", name, held_on::text as "heldOn", windows,
  minutes_per_meeting as "minutesPerMeeting", location, interlocutors, position`;

export const listDays = (blockId: string) =>
  all<OneToOneDay>(`select ${DAY_COLS} from one_to_one_days where block_id = $1 order by held_on nulls last, position`, [blockId]);

export const getDay = (id: string) => one<OneToOneDay>(`select ${DAY_COLS} from one_to_one_days where id = $1`, [id]);

type DayFields = { name: string; heldOn: string | null; windows: { startsAt: string; endsAt: string }[]; minutesPerMeeting: number; location: string; interlocutors: string[] };

/** Les interlocuteurs d'une journée sont ceux de la brique : un inconnu n'y reçoit pas. */
async function checkInterlocutors(blockId: string, ids: string[]) {
  const ctx = await brickContext(blockId);
  if (!ctx) throw new HttpError(404, 'One to One not found.');
  const stranger = ids.find((id) => !ctx.config.interlocutors.includes(id));
  if (stranger) throw new HttpError(422, 'Add them to the brick’s interlocutors first.', { interlocutors: 'Not an interlocutor here.' });
}

export async function createDay(blockId: string, input: DayFields): Promise<OneToOneDay> {
  await checkInterlocutors(blockId, input.interlocutors);
  const id = newId('day');
  const last = await one<{ n: number }>('select coalesce(max(position), -1)::int as n from one_to_one_days where block_id = $1', [blockId]);
  await all(
    `insert into one_to_one_days (id, block_id, name, held_on, windows, minutes_per_meeting, location, interlocutors, position)
     values ($1,$2,$3,$4::date,$5::jsonb,$6,$7,$8::jsonb,$9)`,
    [id, blockId, input.name, input.heldOn, input.windows, input.minutesPerMeeting, input.location, input.interlocutors, (last?.n ?? -1) + 1],
  );
  return (await getDay(id))!;
}

/**
 * Changer une journée. Ses rendez-vous suivent sa date — une journée déplacée
 * au lendemain emporte ses rendez-vous avec elle — et gardent leur heure.
 */
export async function updateDay(id: string, input: Partial<DayFields>): Promise<OneToOneDay | null> {
  const current = await getDay(id);
  if (!current) return null;
  if (input.interlocutors) await checkInterlocutors(current.blockId, input.interlocutors);
  const sets: string[] = [];
  const params: unknown[] = [id];
  const put = (column: string, value: unknown, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if (input.name !== undefined) put('name', input.name);
  if (input.heldOn !== undefined) put('held_on', input.heldOn, '::date');
  if (input.windows !== undefined) put('windows', input.windows, '::jsonb');
  if (input.minutesPerMeeting !== undefined) put('minutes_per_meeting', input.minutesPerMeeting);
  if (input.location !== undefined) put('location', input.location);
  if (input.interlocutors !== undefined) put('interlocutors', input.interlocutors, '::jsonb');
  if (sets.length) await all(`update one_to_one_days set ${sets.join(', ')} where id = $1`, params);
  if (input.heldOn !== undefined && input.heldOn !== current.heldOn) {
    await all(`update one_to_one_meetings set held_on = $2::date where day_id = $1`, [id, input.heldOn]);
  }
  return getDay(id);
}

/** Supprimer une journée : ses rendez-vous restent, avec leur date et leur heure, hors journée. */
export const deleteDay = async (id: string): Promise<boolean> =>
  (await all<{ id: string }>('delete from one_to_one_days where id = $1 returning id', [id])).length > 0;

/* ------------------------------------------------------------------ */
/* Booking                                                             */
/* ------------------------------------------------------------------ */

export interface BookableCell extends FreeCell {
  personName: string;
}

/**
 * Ce qu'une startup peut réserver : les cases libres des journées de la brique,
 * chez son interlocuteur s'il est déjà choisi, chez n'importe lequel sinon.
 */
export async function slotsFor(meeting: OneToOneMeeting): Promise<BookableCell[]> {
  const days = await listDays(meeting.blockId);
  const people = [...new Set(days.flatMap((d) => d.interlocutors))];
  if (!people.length) return [];
  const taken = await all<{ personId: string | null; heldOn: string | null; startTime: string | null }>(
    `select person_id as "personId", held_on::text as "heldOn", start_time as "startTime" from one_to_one_meetings
      where person_id = any($1::text[]) and status <> 'cancelled' and id <> $2`,
    [people, meeting.id],
  );
  const names = new Map((await peopleByIds(people)).map((p) => [p.id, p.name]));
  return freeCells(days, taken, meeting.personId).map((c) => ({ ...c, personName: names.get(c.personId) ?? '' }));
}

/**
 * Réserver une case, par le lien de la startup.
 *
 * The cell has to be free at the moment of booking — two startups on the same
 * page at once, the second one is told — and booking again moves the meeting
 * rather than adding one.
 */
export async function bookSlot(token: string, cell: { dayId: string; startTime: string; personId: string }): Promise<MeetingInvitation> {
  const found = await invitationFor(token);
  if (!found) throw new HttpError(404, 'This invitation does not exist.');
  if (found.meeting.invite !== 'slots' || !found.page.open) {
    throw new HttpError(403, 'This meeting can no longer be booked here. Get in touch with the team.');
  }
  const free = await slotsFor(found.meeting);
  const pick = free.find((f) => f.dayId === cell.dayId && f.startTime === cell.startTime && f.personId === cell.personId);
  if (!pick) throw new HttpError(409, 'That time has just been taken. Pick another.');
  const theDay = await getDay(pick.dayId);
  await all(
    `update one_to_one_meetings
        set held_on = $2::date, start_time = $3, person_id = $4, day_id = $5, duration_minutes = $6,
            location = case when $7 <> '' then $7 else location end,
            rsvp_state = 'confirmed', responded_at = now()
      where id = $1`,
    [found.meeting.id, pick.onDate, pick.startTime, pick.personId, pick.dayId, theDay?.minutesPerMeeting ?? found.meeting.durationMinutes, theDay?.location ?? ''],
  );
  return (await invitationFor(token))!.page;
}

/**
 * Prévenir d'un coup tous ceux d'une journée — ou de la brique — qui ne
 * l'ont pas encore été : la startup, et l'interlocuteur. Comme « Inform » au
 * comité : une lettre par personne qui n'en a pas reçu.
 */
export async function informAll(blockId: string, dayId: string | null): Promise<{ startups: number; people: number }> {
  const meetings = (await listMeetings(blockId)).filter(
    (m) => m.status === 'planned' && (!dayId || m.dayId === dayId) && (m.heldOn || m.invite === 'slots'),
  );
  let startups = 0;
  let people = 0;
  for (const m of meetings) {
    const sent = await tellMeeting(m.id, { startup: !m.toldStartupAt, person: !m.toldPersonAt && Boolean(m.personId) });
    if (sent.startup) startups += 1;
    if (sent.person) people += 1;
  }
  return { startups, people };
}

/* ------------------------------------------------------------------ */
/* A startup's history                                                 */
/* ------------------------------------------------------------------ */

export interface MeetingLine extends OneToOneMeeting {
  blockName: string;
}

/** Les rendez-vous d'une candidature, ou de toutes celles d'une organisation. */
export async function historyOf(by: { candidateId?: string; orgId?: string }): Promise<MeetingLine[]> {
  return all<MeetingLine>(
    `select ${COLS.replace('from one_to_one_meetings m', ', b.name as "blockName" from one_to_one_meetings m join blocks b on b.id = m.block_id')}
      where ${by.candidateId ? 'm.candidate_id = $1' : 'c.org_id = $1'}
      order by m.held_on desc nulls first, m.created_at desc`,
    [by.candidateId ?? by.orgId],
  );
}
