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
  peopleOf,
  meetingWith,
  fillTemplate,
  firstNameOf,
  freeCells,
  longDate,
  seriesDates,
  CONTACT_FIELD_TYPES,
  mentorsOf,
  pairingOf,
  recurringDates,
  weeklyCells,
  prepLocked,
  prepForm,
  reportForm,
  sharedReport,
  type FormPage,
  type WeeklyCell,
} from '@ceed/shared';
import { accessFor } from './invitations.js';
import { isTestRecord } from './testIdentity.js';
import { post } from './mail.js';
import { publicOrigin } from './platform.js';
import { all, db, one } from '../db/client.js';
import * as dir from '../db/directory.js';
import { peopleByIds } from '../db/directory.js';
import * as repo from '../db/repo.js';
import { HttpError } from '../routes/util.js';
import { conflicted } from './reviews.js';
import { intakeFor } from './selection.js';

const COLS = `
  m.id, m.block_id as "blockId", m.candidate_id as "candidateId", o.name as "orgName",
  m.person_id as "personId", coalesce(p.name, '') as "personName", m.with_ids as "withIds",
  coalesce((select string_agg(w.name, ' & ' order by w.name) from records w
             where w.id in (select jsonb_array_elements_text(m.with_ids))), '') as "withNames", m.series_id as "seriesId", m.day_id as "dayId",
  m.held_on::text as "heldOn", m.start_time as "startTime", m.duration_minutes as "durationMinutes",
  m.location, m.meeting_link as "meetingLink", m.invite, m.token, m.rsvp_state as "rsvpState", m.rsvp_note as "rsvpNote", m.responded_at::text as "respondedAt",
  m.status, m.report, m.report_submitted_at::text as "reportSubmittedAt", m.report_by_name as "reportByName",
  m.prep, m.prep_submitted_at::text as "prepSubmittedAt", m.prep_edited_at::text as "prepEditedAt",
  m.prep_edited_by_name as "prepEditedByName",
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
/**
 * Whether one of these people already has a meeting at that time — alone, or
 * among several receiving together, in any brick.
 */
async function busy(people: string | string[] | null, heldOn: string | null, startTime: string | null, except?: string) {
  const ids = (Array.isArray(people) ? people : people ? [people] : []).filter(Boolean);
  if (!ids.length || !heldOn || !startTime) return false;
  const row = await one<{ id: string }>(
    `select id from one_to_one_meetings
      where (person_id = any($1::text[]) or with_ids ?| $1::text[])
        and held_on = $2::date and start_time = $3 and status <> 'cancelled'
        and ($4::text is null or id <> $4) limit 1`,
    [ids, heldOn, startTime, except ?? null],
  );
  return Boolean(row);
}

/** Who already sits at which time — every person of every meeting, for the free-slot reckoning. */
async function takenBy(people: string[], except: string | null) {
  const rows = await all<{ personId: string | null; withIds: string[]; heldOn: string | null; startTime: string | null }>(
    `select person_id as "personId", with_ids as "withIds", held_on::text as "heldOn", start_time as "startTime"
       from one_to_one_meetings
      where (person_id = any($1::text[]) or with_ids ?| $1::text[]) and status <> 'cancelled'
        and ($2::text is null or id <> $2)`,
    [people, except],
  );
  return rows.flatMap((r) => [...new Set([r.personId, ...(r.withIds ?? [])].filter(Boolean))].map((personId) => ({ personId, heldOn: r.heldOn, startTime: r.startTime })));
}

export async function planMeetings(
  blockId: string,
  input: {
    candidateIds: string[];
    personId: string | null;
    /** When they receive together: who is there. */
    withIds?: string[];
    dayId?: string | null;
    invite: 'slots' | 'confirm' | 'none';
    heldOn: string | null;
    startTime: string | null;
    durationMinutes?: number;
    location?: string;
    meetingLink?: string;
    repeat?: { frequency: Frequency; count: number | null; until: string | null } | null;
    tell?: boolean;
  },
): Promise<OneToOneMeeting[]> {
  const ctx = await brickContext(blockId);
  if (!ctx) throw new HttpError(404, 'One to One not found.');
  /* Ensemble : le rendez-vous réunit les interlocuteurs du jour — ou ceux
     qu'on a cochés, ou ceux de la brique —, le premier en est le principal. */
  const together = pairingOf(ctx.config) === 'together';
  const dayOf = input.dayId ? await getDay(input.dayId) : null;
  const participants = together
    ? input.withIds?.length
      ? input.withIds
      : dayOf?.interlocutors.length
        ? dayOf.interlocutors
        : ctx.config.interlocutors
    : [];
  if (together && participants.some((id) => !ctx.config.interlocutors.includes(id))) {
    throw new HttpError(422, 'Add them to the brick’s interlocutors first.');
  }
  if (together && input.invite !== 'slots' && !input.personId) input = { ...input, personId: participants[0] ?? null };
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
  await checkAllowance(blockId, ctx.config, ctx.intake, input.candidateIds, input.personId, Boolean(input.repeat));
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
  /* Un suivi régulier : la première séance donnée, les suivantes viennent du
     calendrier de la brique — son rythme, sa fin, ses semaines exclues. */
  const rec = ctx.config.recurrence;
  const recurring = ctx.config.cadence === 'recurring' && !books && !input.repeat;
  if (recurring && !rec.endsOn && !rec.count) {
    throw new HttpError(422, 'Set the follow-up calendar first — its end date or its number of sessions, in Sessions.');
  }
  const dates = recurring
    ? recurringDates(rec, input.heldOn!)
    : !books && input.repeat
      ? seriesDates(input.heldOn!, input.repeat.frequency, { count: input.repeat.count, until: input.repeat.until })
      : [input.heldOn];
  if (recurring && input.candidateIds.length > 1) throw new HttpError(422, 'A series is one startup, at a set time.');
  if (!books) {
    const clashes: string[] = [];
    for (const date of dates) if (await busy(together ? participants : input.personId, date, input.startTime)) clashes.push(date!);
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
  const meetingLink = input.meetingLink ?? theDay?.meetingLink ?? '';
  let seriesId: string | null = null;
  if (!books && (input.repeat || recurring)) {
    seriesId = newId('ser');
    const rhythm = input.repeat ?? { frequency: rec.frequency, until: rec.endsOn, count: rec.endsOn ? null : rec.count };
    await all(
      `insert into one_to_one_series (id, block_id, candidate_id, person_id, frequency, first_on, start_time,
                                      until_on, count, duration_minutes, location)
       values ($1,$2,$3,$4,$5,$6::date,$7,$8::date,$9,$10,$11)`,
      [seriesId, blockId, input.candidateIds[0], input.personId, rhythm.frequency, input.heldOn,
        input.startTime, rhythm.until, rhythm.count, duration, location],
    );
  }

  const made: OneToOneMeeting[] = [];
  for (const candidateId of input.candidateIds) {
    for (const date of dates) {
      const id = newId('oto');
      await all(
        `insert into one_to_one_meetings
           (id, block_id, candidate_id, person_id, series_id, held_on, start_time, duration_minutes, location,
            invite, token, rsvp_state, day_id, meeting_link, with_ids)
         values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          id, blockId, candidateId, input.personId, seriesId,
          books ? null : date, books ? null : input.startTime, duration, location,
          input.invite, newId('meet').replace('meet_', ''),
          /* Fixé sans invitation : il n'y a pas de réponse à attendre. */
          input.invite === 'none' ? 'confirmed' : 'pending',
          books || seriesId ? null : (input.dayId ?? null),
          meetingLink,
          together && !books ? participants : [],
        ],
      );
      made.push((await getMeeting(id))!);
    }
  }
  /* Une série s'annonce une fois, par sa première séance, et dit son rythme :
     cinquante-deux lettres pour un mentoring hebdomadaire, personne ne les lit. */
  if (input.tell) {
    const firsts = seriesId ? made.slice(0, 1) : made;
    const rhythm = seriesId ? rhythmLine(input.repeat?.frequency ?? rec.frequency, dates[dates.length - 1]!) : '';
    for (const m of firsts) await tellMeeting(m.id, { startup: true, person: true }, rhythm);
  }
  return made;
}

/**
 * Combien de rendez-vous une startup peut avoir ici. Partagées, une startup
 * voit chacun de ses interlocuteurs une fois, et seulement eux ; sinon, elle
 * en a au plus ce que l'onglet Invitations dit. Une série compte pour un : le
 * suivi régulier, c'est elle. Rien n'est limité pour une brique récurrente.
 */
async function checkAllowance(
  blockId: string,
  config: OneToOneConfig,
  intake: Candidate[],
  candidateIds: string[],
  personId: string | null,
  series: boolean,
): Promise<void> {
  if (config.cadence === 'recurring' || series) return;
  const pairing = pairingOf(config);
  for (const candidateId of candidateIds) {
    const candidate = intake.find((c) => c.id === candidateId)!;
    const held = await all<{ personId: string | null; n: number }>(
      `select person_id as "personId", count(distinct coalesce(series_id, id))::int as n
         from one_to_one_meetings
        where block_id = $1 and candidate_id = $2 and status <> 'cancelled'
        group by person_id`,
      [blockId, candidateId],
    );
    if (pairing === 'assigned') {
      if (!personId) continue;
      if (!mentorsOf(config, candidate).includes(personId)) {
        throw new HttpError(
          422,
          `${candidate.orgName} is not paired with this interlocutor — pair them in the Interlocutors tab of the setup.`,
          { personId: 'Not one of this startup’s interlocutors.' },
        );
      }
      if (held.some((h) => h.personId === personId)) {
        throw new HttpError(422, `${candidate.orgName} already has a meeting with this interlocutor here.`, {
          personId: 'Already met here.',
        });
      }
    } else {
      const total = held.reduce((sum, h) => sum + h.n, 0);
      if (total >= config.perStartup) {
        throw new HttpError(
          422,
          `${candidate.orgName} already has ${total} meeting${total > 1 ? 's' : ''} here — the most the Invitations tab allows. Raise it there to add one.`,
        );
      }
    }
  }
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
    meetingLink?: string;
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
  /* Ensemble : placé dans une journée, le rendez-vous réunit ceux qui y reçoivent. */
  const cfg = (await brickContext(current.blockId))?.config;
  const together = cfg ? pairingOf(cfg) === 'together' : false;
  const placedDay = together && patch.dayId ? await getDay(patch.dayId) : null;
  const participants = placedDay?.interlocutors.length
    ? placedDay.interlocutors
    : current.withIds?.length
      ? current.withIds
      : personId
        ? [personId]
        : [];
  if ((patch.heldOn !== undefined || patch.startTime !== undefined || patch.personId) && (await busy(participants, heldOn, startTime, id))) {
    throw new HttpError(409, 'They already have a meeting at that time.', { startTime: 'Already taken.' });
  }
  const moved = heldOn !== current.heldOn || startTime !== current.startTime;
  const sets: string[] = [];
  const params: unknown[] = [id];
  const put = (column: string, value: unknown, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if (placedDay?.interlocutors.length) {
    put('person_id', placedDay.interlocutors[0]);
    put('with_ids', placedDay.interlocutors, '::jsonb');
  } else if (patch.personId !== undefined) put('person_id', patch.personId);
  if (patch.dayId !== undefined) put('day_id', patch.dayId);
  if (patch.heldOn !== undefined) put('held_on', patch.heldOn, '::date');
  if (patch.startTime !== undefined) put('start_time', patch.startTime);
  if (patch.durationMinutes !== undefined) put('duration_minutes', patch.durationMinutes);
  if (patch.location !== undefined) put('location', patch.location);
  if (patch.meetingLink !== undefined) put('meeting_link', patch.meetingLink);
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
  const config = block?.config as OneToOneConfig | undefined;
  const fields = (config ? reportForm(config).fields : []) as FormField[];
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
  /* Un seul document : ce que l'interlocuteur y écrit est aussi ce que la
     startup relit. */
  if (config && sharedReport(config)) {
    await all(
      `update one_to_one_meetings set prep = $2::jsonb, prep_edited_at = now(), prep_edited_by_name = $3 where id = $1`,
      [id, kept, by.name],
    );
  }
  return (await getMeeting(id))!;
}

/**
 * La préparation d'une séance. La startup l'écrit tant qu'elle n'est pas
 * verrouillée ; l'interlocuteur et CEED la corrigent toujours — et la
 * startup relit leur version. Seules les questions de la préparation
 * s'enregistrent.
 */
export async function savePrep(
  id: string,
  answers: Record<string, unknown>,
  who: { side: 'startup' | 'team'; name: string; submit?: boolean },
): Promise<OneToOneMeeting> {
  const meeting = await getMeeting(id);
  if (!meeting) throw new HttpError(404, 'Meeting not found.');
  const block = await repo.getBlock(meeting.blockId);
  const config = block?.config as OneToOneConfig | undefined;
  const form = config ? prepForm(config) : null;
  if (!config || !form) throw new HttpError(422, 'This brick asks for no preparation.');
  if (meeting.status === 'cancelled') throw new HttpError(403, 'This meeting was cancelled.');
  if (who.side === 'startup' && prepLocked(meeting, config.prep)) {
    throw new HttpError(403, 'The preparation is locked — it can be read, no longer changed.');
  }
  const fields = form.fields as FormField[];
  const kept = Object.fromEntries(Object.entries(answers).filter(([k]) => fields.some((f) => f.id === k)));
  if (who.side === 'startup' && who.submit) {
    const missing = fields.filter((f) => f.required && blank(kept[f.id]));
    if (missing.length) {
      throw new HttpError(422, 'Some answers are missing.', Object.fromEntries(missing.map((f) => [`answers.${f.id}`, 'This answer is required.'])));
    }
  }
  await all(
    `update one_to_one_meetings
        set prep = $2::jsonb,
            prep_submitted_at = case when $3 then coalesce(prep_submitted_at, now()) else prep_submitted_at end,
            prep_edited_at = case when $4 then now() else prep_edited_at end,
            prep_edited_by_name = case when $4 then $5 else prep_edited_by_name end
      where id = $1`,
    [id, kept, who.side === 'startup' && Boolean(who.submit), who.side === 'team', who.name],
  );
  return (await getMeeting(id))!;
}

/** Ce que la préparation dit déjà, pour les questions du compte rendu qui sont les siennes. */
export const prefillFromPrep = (prep: Record<string, unknown>, fields: readonly { id: string }[]) =>
  Object.fromEntries(fields.filter((f) => prep[f.id] !== undefined && prep[f.id] !== '').map((f) => [f.id, prep[f.id]]));

/** The preparations a startup still owes: scheduled, not locked, not sent. */
export async function prepsDueFor(candidateId: string): Promise<{ meeting: OneToOneMeeting; started: boolean }[]> {
  const meetings = await all<OneToOneMeeting>(
    `select ${COLS} where m.candidate_id = $1 and m.status = 'planned' and m.held_on >= current_date
       and m.prep_submitted_at is null ${ORDER}`,
    [candidateId],
  );
  const out: { meeting: OneToOneMeeting; started: boolean }[] = [];
  for (const m of meetings) {
    const block = await repo.getBlock(m.blockId);
    const config = block?.config as OneToOneConfig | undefined;
    if (!config || !prepForm(config) || prepLocked(m, config.prep)) continue;
    out.push({ meeting: m, started: Object.keys(m.prep ?? {}).length > 0 });
  }
  return out;
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
  /** The startup's preparation questions, when the brick asks for one. */
  prepQuestions: { pages: ReturnType<typeof formPages> } | null;
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
  const mine = await all<OneToOneMeeting>(`select ${COLS} where (m.person_id = $1 or m.with_ids ? $1) ${ORDER}`, [recordId]);
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
    questions: { pages: formPages(reportForm(config)) },
    /* Un seul document : pas de préparation à part, elle est le compte rendu. */
    prepQuestions: prepForm(config) && !sharedReport(config) ? { pages: formPages(prepForm(config)!) } : null,
    /* Un compte rendu encore vide part de ce que la startup a préparé — les
       mêmes questions gardent les mêmes réponses, rien n'est à retaper. */
    report: Object.keys(meeting.report).length ? meeting.report : prefillFromPrep(meeting.prep ?? {}, reportForm(config).fields),
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
  rsvpNote: string;
  meetingLink: string;
  cadence: 'single' | 'recurring';
  /** The startup's preparation, when the brick asks for one. */
  prep: {
    pages: { page: FormPage; fields: FormField[] }[];
    answers: Record<string, unknown>;
    locked: boolean;
    submittedAt: string | null;
    editedByName: string;
  } | null;
  /** For a regular follow-up: the weekly slots it may take for the whole series. */
  weekly: (WeeklyCell & { personName: string })[];
  /** The day after which the link takes no answer, and whether it has passed. */
  answerBy: string | null;
  late: boolean;
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
  /* « Answer by » : passé ce jour, le lien ne prend plus de réponse. */
  const answerBy = ((ctx?.block.config ?? {}) as { answerBy?: string | null }).answerBy ?? null;
  const late = Boolean(answerBy && new Date().toISOString().slice(0, 10) > answerBy);
  const open =
    editionTakesInput(detail.status) &&
    meeting.status === 'planned' &&
    !late &&
    (meeting.invite === 'confirm' ? Boolean(meeting.heldOn) : meeting.invite === 'slots');
  return {
    meeting,
    page: {
      programName: detail.program.name,
      editionName: detail.name,
      colour: detail.program.colour ?? '#2F5BFF',
      orgName: meeting.orgName,
      personName: meetingWith(meeting),
      heldOn: meeting.heldOn,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      location: meeting.location,
      meetingLink: meeting.meetingLink ?? '',
      answerBy,
      late,
      invite: meeting.invite,
      rsvpState: meeting.rsvpState,
      rsvpNote: meeting.rsvpNote ?? '',
      status: meeting.status,
      open,
      cadence: (ctx?.block.config as OneToOneConfig | undefined)?.cadence ?? 'single',
      prep: (() => {
        const c = ctx?.block.config as OneToOneConfig | undefined;
        const form = c ? prepForm(c) : null;
        if (!c || !form || meeting.status === 'cancelled') return null;
        return {
          pages: formPages(form),
          answers: meeting.prep ?? {},
          locked: prepLocked(meeting, c.prep),
          submittedAt: meeting.prepSubmittedAt,
          editedByName: meeting.prepEditedAt ? meeting.prepEditedByName : '',
        };
      })(),
      slots:
        open && meeting.invite === 'slots' && (ctx?.block.config as OneToOneConfig | undefined)?.cadence !== 'recurring'
          ? await slotsFor(meeting)
          : [],
      weekly:
        open && meeting.invite === 'slots' && !meeting.heldOn && (ctx?.block.config as OneToOneConfig | undefined)?.cadence === 'recurring'
          ? await weeklyFor(meeting)
          : [],
    },
  };
}

/** Oui ou non à une heure proposée. Rien d'autre ne s'écrit par ce lien. */
export async function answerInvitation(token: string, accept: boolean, note = ''): Promise<MeetingInvitation> {
  const found = await invitationFor(token);
  if (!found) throw new HttpError(404, 'This invitation does not exist.');
  if (found.page.late) throw new HttpError(403, 'The deadline to answer has passed. Get in touch with the team.');
  if (!found.page.open) throw new HttpError(403, 'This meeting can no longer be answered here. Get in touch with the team.');
  /* Le mot laissé en refusant reste pour l'équipe ; confirmer l'efface. */
  /* Une série se confirme — ou se refuse — en une fois : ses séances à venir
     suivent la réponse donnée à la première. */
  await all(
    `update one_to_one_meetings set rsvp_state = $2, rsvp_note = $3, responded_at = now()
      where id = $1
         or ($4::text is not null and series_id = $4 and status = 'planned' and held_on >= current_date)`,
    [found.meeting.id, accept ? 'confirmed' : 'declined', accept ? '' : note.trim().slice(0, 1000), found.meeting.seriesId],
  );
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
  /** Quelle lettre : l'annonce, le rappel de la veille, ou le compte rendu qui tarde. */
  letter: 'announce' | 'eve' | 'late' = 'announce',
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
        interlocuteur: (m.withNames || m.personName) || 'un interlocuteur du programme',
        programme,
        quand: m.invite === 'slots' && !m.heldOn ? '' : quand,
        lieu,
        visio: m.meetingLink ? `Lien de la réunion : ${m.meetingLink}` : '',
        action,
        /* La préparation, quand la brique en demande une et que la séance a une heure. */
        preparation: prepForm(config) && m.heldOn && link ? `Préparez la séance ici : ${link}` : '',
        lien: link,
      };
      const posted = await post({
        kind: letter === 'eve' ? 'one_to_one_eve' : 'one_to_one_startup',
        to,
        toName: candidate.contactName,
        recordId: candidate.personId,
        blockId: m.blockId,
        candidateId: m.candidateId,
        subject: fillTemplate(letter === 'eve' ? config.reminders.subjects.eveStartup : config.messages.subjects.startup, values),
        body: fillTemplate(letter === 'eve' ? config.reminders.eveStartup : config.messages.startup, values),
      });
      if (posted) {
        // Un rappel n'est pas une annonce : il ne dit pas « prévenue ».
        if (letter === 'announce') await all('update one_to_one_meetings set told_startup_at = now() where id = $1', [id]);
        out.startup = true;
      }
    }
  }

  /* Ensemble : chacun de ceux qui mènent la séance reçoit sa lettre. */
  const people = who.person ? peopleOf(m) : [];
  for (const personId of people) {
    const person = await dir.getRecord(personId);
    const to = person?.email?.trim();
    if (person && to) {
      const template =
        letter === 'eve'
          ? { subject: config.reminders.subjects.evePerson, body: config.reminders.evePerson }
          : letter === 'late'
            ? { subject: config.reminders.subjects.lateReport, body: config.reminders.lateReport }
            : { subject: config.messages.subjects.person, body: config.messages.person };
      const values = {
        prenom: firstNameOf(person.name, person.firstName),
        startup: m.orgName,
        programme,
        quand: m.invite === 'slots' && !m.heldOn ? 'La startup choisira son créneau parmi vos disponibilités.' : quand,
        lieu,
        visio: m.meetingLink ? `Lien de la réunion : ${m.meetingLink}` : '',
        lien: origin ? `${origin}/meeting/${m.id}` : '',
        acces: template.body.includes('{{acces}}') ? await accessFor(personId, config.messages.access) : '',
      };
      const posted = await post({
        kind: letter === 'eve' ? 'one_to_one_eve' : letter === 'late' ? 'one_to_one_late_report' : 'one_to_one_person',
        to,
        toName: person.name,
        recordId: personId,
        blockId: m.blockId,
        candidateId: m.candidateId,
        subject: fillTemplate(template.subject, values),
        body: fillTemplate(template.body, values),
      });
      if (posted) {
        if (letter === 'announce') await all('update one_to_one_meetings set told_person_at = now() where id = $1', [id]);
        out.person = true;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

/** L'heure à laquelle les rappels partent — la même que les autres lettres du matin. */
const SEND_HOUR_UTC = Number(process.env.SEND_HOUR_UTC ?? 7);

/**
 * Les rappels du matin : la veille de chaque séance, à la startup et à
 * l'interlocuteur ; et, quelques jours après une séance tenue, à
 * l'interlocuteur dont le compte rendu n'est pas parti. Chacun une fois —
 * réclamé avant d'être écrit, si bien que deux passages ne doublent rien.
 */
export async function sendOneToOneReminders(now = new Date()): Promise<{ eve: number; late: number }> {
  if (now.getUTCHours() < SEND_HOUR_UTC) return { eve: 0, late: 0 };
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  let eve = 0;
  let late = 0;

  const eveRows = await all<{ id: string }>(
    `select m.id from one_to_one_meetings m join blocks b on b.id = m.block_id
      where m.status = 'planned' and m.held_on = $1::date and m.eve_reminded_at is null
        and m.rsvp_state <> 'declined' and (b.config->'reminders'->>'eve') = 'true'`,
    [tomorrow],
  );
  for (const { id } of eveRows) {
    const claimed = await all<{ id: string }>(
      'update one_to_one_meetings set eve_reminded_at = now() where id = $1 and eve_reminded_at is null returning id',
      [id],
    );
    if (!claimed.length) continue;
    const sent = await tellMeeting(id, { startup: true, person: true }, '', 'eve');
    if (sent.startup || sent.person) eve += 1;
  }

  const lateRows = await all<{ id: string; blockId: string; after: number }>(
    `select m.id, m.block_id as "blockId", coalesce((b.config->'reminders'->>'lateAfterDays')::int, 2) as after
       from one_to_one_meetings m join blocks b on b.id = m.block_id
      where m.report_submitted_at is null and m.report_reminded_at is null and m.person_id is not null
        and m.status in ('planned', 'held') and m.held_on is not null
        and (b.config->'reminders'->>'late') = 'true'`,
    [],
  );
  for (const row of lateRows) {
    const meeting = await getMeeting(row.id);
    if (!meeting?.heldOn) continue;
    const due = new Date(Date.parse(`${meeting.heldOn}T00:00:00Z`) + row.after * 86_400_000).toISOString().slice(0, 10);
    if (due > today) continue;
    /* Seulement tant que la brique est ouverte : fermée, il ne peut plus l'écrire. */
    const block = await repo.getBlock(row.blockId);
    if (!block || blockStatus(block) !== 'live') continue;
    const claimed = await all<{ id: string }>(
      'update one_to_one_meetings set report_reminded_at = now() where id = $1 and report_reminded_at is null returning id',
      [row.id],
    );
    if (!claimed.length) continue;
    const sent = await tellMeeting(row.id, { person: true }, '', 'late');
    if (sent.person) late += 1;
  }
  return { eve, late };
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

const DAY_COLS = `id, block_id as "blockId", name, held_on::text as "heldOn", windows,
  minutes_per_meeting as "minutesPerMeeting", location, meeting_link as "meetingLink", interlocutors, position`;

export const listDays = (blockId: string) =>
  all<OneToOneDay>(`select ${DAY_COLS} from one_to_one_days where block_id = $1 order by held_on nulls last, position`, [blockId]);

export const getDay = (id: string) => one<OneToOneDay>(`select ${DAY_COLS} from one_to_one_days where id = $1`, [id]);

type DayFields = { name: string; heldOn: string | null; windows: { startsAt: string; endsAt: string }[]; minutesPerMeeting: number; location: string; meetingLink?: string; interlocutors: string[] };

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
    `insert into one_to_one_days (id, block_id, name, held_on, windows, minutes_per_meeting, location, interlocutors, position, meeting_link)
     values ($1,$2,$3,$4::date,$5::jsonb,$6,$7,$8::jsonb,$9,$10)`,
    [id, blockId, input.name, input.heldOn, input.windows, input.minutesPerMeeting, input.location, input.interlocutors, (last?.n ?? -1) + 1, input.meetingLink ?? ''],
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
  if (input.meetingLink !== undefined) put('meeting_link', input.meetingLink);
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
  const taken = await takenBy(people, meeting.id);
  const names = new Map((await peopleByIds(people)).map((p) => [p.id, p.name]));
  const ctx = await brickContext(meeting.blockId);
  /* Ensemble : un créneau n'est offert que si tous ceux du jour sont libres —
     et il se prend chez eux tous, sans choisir chez qui. */
  if (ctx && pairingOf(ctx.config) === 'together') {
    const free = freeCells(days, taken, null);
    const out: BookableCell[] = [];
    for (const day of days) {
      const slots = [...new Set(free.filter((c) => c.dayId === day.id).map((c) => c.startTime))];
      for (const startTime of slots) {
        const cells = free.filter((c) => c.dayId === day.id && c.startTime === startTime);
        if (cells.length < day.interlocutors.length) continue;
        out.push({
          ...cells[0]!,
          personId: day.interlocutors[0]!,
          personName: day.interlocutors.map((id) => names.get(id) ?? '').filter(Boolean).join(' & '),
        });
      }
    }
    return out.sort((a, b) => (a.onDate + a.startTime).localeCompare(b.onDate + b.startTime));
  }
  return freeCells(days, taken, meeting.personId).map((c) => ({ ...c, personName: names.get(c.personId) ?? '' }));
}

/** The weekly slots a startup invited to a regular follow-up may take, named. */
export async function weeklyFor(meeting: OneToOneMeeting): Promise<(WeeklyCell & { personName: string })[]> {
  const ctx = await brickContext(meeting.blockId);
  if (!ctx) return [];
  const rec = ctx.config.recurrence;
  const candidate = ctx.intake.find((c) => c.id === meeting.candidateId);
  /* Chez qui : la personne de l'invitation, sinon ses interlocuteurs quand ils
     se partagent les startups, sinon n'importe lequel. */
  const only = meeting.personId
    ? [meeting.personId]
    : pairingOf(ctx.config) === 'assigned' && candidate
      ? mentorsOf(ctx.config, candidate)
      : null;
  const together = pairingOf(ctx.config) === 'together';
  const people = [...new Set([...rec.weekly.map((w) => w.personId), ...(together ? ctx.config.interlocutors : [])])];
  if (!people.length) return [];
  const taken = await takenBy(people, meeting.id);
  const names = new Map((await peopleByIds(people)).map((p) => [p.id, p.name]));
  if (together) {
    /* Ensemble : les créneaux du principal, gardés seulement si chacun des
       autres est libre à toutes les dates de la série. */
    const lead = ctx.config.interlocutors[0];
    if (!lead) return [];
    const busySet = new Set(taken.map((t) => `${t.personId} ${t.heldOn} ${t.startTime}`));
    return weeklyCells(rec, ctx.config.durationMinutes, taken, [lead])
      .filter((c) =>
        recurringDates(rec, c.firstOn).every((d) => ctx.config.interlocutors.every((p) => !busySet.has(`${p} ${d} ${c.startTime}`))),
      )
      .map((c) => ({ ...c, personName: ctx.config.interlocutors.map((id) => names.get(id) ?? '').filter(Boolean).join(' & ') }));
  }
  return weeklyCells(rec, ctx.config.durationMinutes, taken, only).map((c) => ({ ...c, personName: names.get(c.personId) ?? '' }));
}

/**
 * Réserver un créneau de la semaine pour tout son suivi : « chaque lundi à
 * 10h ». La première séance prend l'invitation, les suivantes forment la
 * série — toutes vérifiées libres au moment même.
 */
export async function bookWeekly(token: string, cell: { weekday: number; startTime: string; personId: string }): Promise<MeetingInvitation> {
  const found = await invitationFor(token);
  if (!found) throw new HttpError(404, 'This invitation does not exist.');
  if (found.page.late) throw new HttpError(403, 'The deadline to answer has passed. Get in touch with the team.');
  if (found.meeting.invite !== 'slots' || !found.page.open || found.meeting.heldOn) {
    throw new HttpError(403, 'This follow-up can no longer be booked here. Get in touch with the team.');
  }
  const ctx = (await brickContext(found.meeting.blockId))!;
  const pick = (await weeklyFor(found.meeting)).find(
    (c) => c.weekday === cell.weekday && c.startTime === cell.startTime && c.personId === cell.personId,
  );
  if (!pick) throw new HttpError(409, 'That time has just been taken. Pick another.');
  const rec = ctx.config.recurrence;
  const dates = recurringDates(rec, pick.firstOn);
  const withIds = pairingOf(ctx.config) === 'together' ? ctx.config.interlocutors : [];
  const conn = await db();
  await conn.tx(async () => {
    const seriesId = newId('ser');
    await all(
      `insert into one_to_one_series (id, block_id, candidate_id, person_id, frequency, first_on, start_time,
                                      until_on, count, duration_minutes, location)
       values ($1,$2,$3,$4,$5,$6::date,$7,$8::date,$9,$10,$11)`,
      [seriesId, found.meeting.blockId, found.meeting.candidateId, pick.personId, rec.frequency, dates[0],
        pick.startTime, rec.endsOn, rec.endsOn ? null : rec.count, ctx.config.durationMinutes, found.meeting.location],
    );
    await all(
      `update one_to_one_meetings
          set held_on = $2::date, start_time = $3, person_id = $4, series_id = $5, duration_minutes = $6,
              with_ids = $7::jsonb, rsvp_state = 'confirmed', rsvp_note = '', responded_at = now()
        where id = $1`,
      [found.meeting.id, dates[0], pick.startTime, pick.personId, seriesId, ctx.config.durationMinutes, withIds],
    );
    for (const date of dates.slice(1)) {
      await all(
        `insert into one_to_one_meetings
           (id, block_id, candidate_id, person_id, series_id, held_on, start_time, duration_minutes, location,
            invite, token, rsvp_state, meeting_link, with_ids)
         values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,'slots',$10,'confirmed',$11,$12::jsonb)`,
        [newId('oto'), found.meeting.blockId, found.meeting.candidateId, pick.personId, seriesId, date, pick.startTime,
          ctx.config.durationMinutes, found.meeting.location, newId('meet').replace('meet_', ''), found.meeting.meetingLink ?? '', withIds],
      );
    }
  });
  return (await invitationFor(token))!.page;
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
  if (found.page.late) throw new HttpError(403, 'The deadline to answer has passed. Get in touch with the team.');
  if (found.meeting.invite !== 'slots' || !found.page.open) {
    throw new HttpError(403, 'This meeting can no longer be booked here. Get in touch with the team.');
  }
  const free = await slotsFor(found.meeting);
  const pick = free.find((f) => f.dayId === cell.dayId && f.startTime === cell.startTime && f.personId === cell.personId);
  if (!pick) throw new HttpError(409, 'That time has just been taken. Pick another.');
  const theDay = await getDay(pick.dayId);
  const ctx = await brickContext(found.meeting.blockId);
  const together = ctx ? pairingOf(ctx.config) === 'together' : false;
  await all(
    `update one_to_one_meetings
        set held_on = $2::date, start_time = $3, person_id = $4, day_id = $5, duration_minutes = $6,
            location = case when $7 <> '' then $7 else location end,
            meeting_link = case when $9 <> '' then $9 else meeting_link end,
            with_ids = $8::jsonb,
            rsvp_state = 'confirmed', rsvp_note = '', responded_at = now()
      where id = $1`,
    [found.meeting.id, pick.onDate, pick.startTime, pick.personId, pick.dayId, theDay?.minutesPerMeeting ?? found.meeting.durationMinutes,
      theDay?.location ?? '', together && theDay ? theDay.interlocutors : [], theDay?.meetingLink ?? ''],
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
  /* Une série s'annonce une fois, par sa première séance : cinquante-deux
     lettres pour un suivi hebdomadaire, personne ne les lit. Les autres
     séances sont alors tenues pour dites. */
  const announced = new Set<string>();
  for (const m of [...meetings].sort((a, b) => (a.heldOn ?? '').localeCompare(b.heldOn ?? ''))) {
    if (m.seriesId && announced.has(m.seriesId)) continue;
    if (m.seriesId) announced.add(m.seriesId);
    /* Et son rythme, dit dans la lettre : « Puis toutes les semaines, jusqu'au… ». */
    const series = m.seriesId
      ? await one<{ frequency: Frequency; last: string }>(
          `select s.frequency, (select max(held_on)::text from one_to_one_meetings where series_id = s.id) as last
             from one_to_one_series s where s.id = $1`,
          [m.seriesId],
        )
      : null;
    const rhythm = series ? rhythmLine(series.frequency, series.last) : '';
    const sent = await tellMeeting(m.id, { startup: !m.toldStartupAt, person: !m.toldPersonAt && Boolean(m.personId) }, rhythm);
    if (sent.startup) startups += 1;
    if (sent.person) people += 1;
    if (m.seriesId && (sent.startup || sent.person)) {
      await all(
        `update one_to_one_meetings
            set told_startup_at = case when $2 then coalesce(told_startup_at, now()) else told_startup_at end,
                told_person_at = case when $3 then coalesce(told_person_at, now()) else told_person_at end
          where series_id = $1`,
        [m.seriesId, sent.startup, sent.person],
      );
    }
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
