/**
 * Les dates d'une startup, telles qu'elle les attend.
 *
 * One kind for now, and it is the one that matters most to somebody in a
 * selection: the morning they pitch. Workshops, mentoring and meetings are
 * bricks that do not exist yet — when they do, they add entries here rather
 * than a second screen, because a founder asks "what is coming" and not "which
 * brick holds it".
 *
 * Read from the sittings themselves rather than from anything copied onto the
 * candidacy: a sitting moved on Friday has to move on their page too, and a
 * date written down twice is a date that will disagree with itself.
 */
import { blockStatus, editionTakesInput, orderedBlocks, type CommitteeConfig } from '@ceed/shared';
import { all } from '../db/client.js';
import * as repo from '../db/repo.js';

/** « 10:00 » plus 45 minutes. */
const clockPlus = (clock: string, minutes: number) => {
  const [h, m] = clock.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
import { committeeView } from './committee.js';

export interface AgendaEntry {
  /** What kind of thing it is, so a screen can say it in its own words. */
  kind: 'committee' | 'one_to_one';
  /** The sitting's own name — "Pitch day 1". */
  name: string;
  blockName: string;
  on: string | null;
  /** Their slot, when they have been given one. */
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  /** For a meeting: who they meet, and where to answer or book. */
  with?: string;
  link?: string | null;
  /** When the link asks for something: to pick a time, or to confirm one. */
  answer?: 'book' | 'confirm';
  /** Until when they may answer, when a deadline is set. */
  answerBy?: string | null;
  /** The video link, for a meeting held online. */
  meetingLink?: string;
}

/** What is coming for one candidacy, soonest first. */
export async function agendaFor(candidateId: string): Promise<AgendaEntry[]> {
  const candidate = await repo.getCandidate(candidateId);
  if (!candidate) return [];
  const detail = await repo.getEditionDetail(candidate.editionId);
  const track = detail?.tracks.find((t) => t.id === candidate.trackId);
  if (!track) return [];

  const out: AgendaEntry[] = [];
  for (const block of orderedBlocks(track).filter((b) => b.type === 'committee')) {
    const view = await committeeView(block.id);
    if (!view) continue;
    const config = block.config as CommitteeConfig;
    /* Le lien de réponse, tant qu'on peut encore répondre : choisir son heure
       en créneaux, confirmer celle proposée sinon. Il n'était que dans la
       lettre — l'espace de la startup ne le montrait nulle part. */
    const answering =
      config.rsvpMode !== 'none' &&
      Boolean(detail && editionTakesInput(detail.status)) &&
      blockStatus(block, 'rsvp', view.sessions.length) === 'live';
    for (const sitting of view.sessions) {
      const seat = sitting.assignments.find((a) => a.candidate.id === candidateId);
      if (!seat) continue;
      const asks = answering
        ? config.rsvpMode === 'slots'
          ? seat.slot === null
            ? 'book'
            : null
          : seat.assignment.rsvpState === 'pending'
            ? 'confirm'
            : null
        : null;
      out.push({
        link: answering ? `/book/${seat.assignment.token}` : null,
        ...(asks ? { answer: asks as 'book' | 'confirm', answerBy: config.rsvp.closesAt ?? null } : {}),
        kind: 'committee',
        name: sitting.session.name,
        blockName: block.name,
        on: sitting.session.heldOn || null,
        /* Their own slot if they have one; otherwise the stretch the sitting
           runs, which is still better than a day with no hour at all. */
        startsAt: seat.slot?.startsAt ?? sitting.session.windows[0]?.startsAt ?? null,
        endsAt: seat.slot?.endsAt ?? null,
        location: (block.config as CommitteeConfig).format === 'event' ? sitting.session.location : '',
      });
    }
  }

  /* Leurs One to One : ceux qui ont une heure, et ceux qui attendent qu'elle
     en choisisse une — avec le lien pour le faire. Jamais le compte rendu. */
  for (const m of await all<{
    blockName: string; heldOn: string | null; startTime: string | null; durationMinutes: number;
    location: string; personName: string; token: string; invite: string; rsvpState: string;
    meetingLink: string; answerBy: string | null;
  }>(
    `select b.name as "blockName", m.held_on::text as "heldOn", m.start_time as "startTime",
            m.duration_minutes as "durationMinutes", m.location, coalesce((select string_agg(w.name, ' & ' order by w.name) from records w
              where w.id in (select jsonb_array_elements_text(m.with_ids))), p.name, '') as "personName", m.token, m.invite,
            m.meeting_link as "meetingLink", nullif(b.config->>'answerBy', '') as "answerBy",
            m.rsvp_state as "rsvpState"
       from one_to_one_meetings m join blocks b on b.id = m.block_id left join records p on p.id = m.person_id
      where m.candidate_id = $1 and m.status = 'planned'
        and (m.held_on is null or m.held_on >= current_date)`,
    [candidateId],
  )) {
    const asks = m.invite === 'slots' ? !m.heldOn : m.invite === 'confirm' && m.rsvpState === 'pending';
    out.push({
      kind: 'one_to_one',
      name: m.personName || m.blockName,
      blockName: m.blockName,
      on: m.heldOn,
      startsAt: m.startTime,
      endsAt: m.startTime ? clockPlus(m.startTime, m.durationMinutes) : null,
      location: m.location,
      /* Vide tant qu'une startup invitée à choisir n'a pas dit chez qui. */
      with: m.personName || undefined,
      link: asks ? `/meet/${m.token}` : null,
      meetingLink: m.meetingLink || undefined,
      ...(asks ? { answer: (m.invite === 'slots' ? 'book' : 'confirm') as 'book' | 'confirm', answerBy: m.answerBy } : {}),
    });
  }

  return out.sort((a, b) => (a.on ?? '9999').localeCompare(b.on ?? '9999'));
}
