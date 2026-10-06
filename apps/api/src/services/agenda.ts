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
import { orderedBlocks, type CommitteeConfig } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { committeeView } from './committee.js';

export interface AgendaEntry {
  /** What kind of thing it is, so a screen can say it in its own words. */
  kind: 'committee';
  /** The sitting's own name — "Pitch day 1". */
  name: string;
  blockName: string;
  on: string | null;
  /** Their slot, when they have been given one. */
  startsAt: string | null;
  endsAt: string | null;
  location: string;
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
    for (const sitting of view.sessions) {
      const seat = sitting.assignments.find((a) => a.candidate.id === candidateId);
      if (!seat) continue;
      out.push({
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

  return out.sort((a, b) => (a.on ?? '').localeCompare(b.on ?? ''));
}
