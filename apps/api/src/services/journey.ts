/**
 * Le parcours d'une startup dans un programme : où elle en est, et ce qu'elle
 * y a fait.
 *
 * The phases are the programme's own, read from its structure: a phase is
 * reached when one of its blocks takes the startup in, exactly as the
 * workspace decides who stands where. The history is read off the objects
 * themselves — the application, the selections once announced, the committee
 * sittings, the pieces sent, the One to One, the indicators — and never
 * written on the side: what is not recorded is not told.
 *
 * Only what the startup has a right to see: a selection counts once it has
 * been announced, and a jury's verdict, which stays CEED's, never appears.
 */
import { meetingWith, orderedBlocks, type Candidate, type FormField, type TrackWithPhases } from '@ceed/shared';
import { all } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { intakeFor, passSetOf } from './selection.js';
import { editionSetup } from './reporting.js';

export interface JourneyPhase {
  id: string;
  name: string;
  state: 'done' | 'current' | 'upcoming';
}

export interface JourneyEvent {
  /** The day it happened. */
  at: string;
  kind: 'application' | 'selection' | 'committee' | 'deliverable' | 'one_to_one' | 'preparation' | 'kpi';
  label: string;
  /** The phase of the block it comes from. */
  phase: string | null;
}

export interface Journey {
  editionId: string;
  candidateId: string;
  programName: string;
  editionName: string;
  orgName: string;
  status: Candidate['status'];
  startsOn: string | null;
  endsOn: string | null;
  phases: JourneyPhase[];
  /** The next phase, when there is one. */
  next: string | null;
  history: JourneyEvent[];
}

/** La phase où se trouve une candidature : la dernière dont une brique la prend. */
export async function phasesOf(track: TrackWithPhases, candidate: Candidate): Promise<JourneyPhase[]> {
  const phases = [...track.phases].sort((a, b) => a.position - b.position);
  let current = -1;
  for (const [i, phase] of phases.entries()) {
    for (const block of phase.blocks) {
      const reached =
        block.type === 'application'
          ? candidate.originBlockId === block.id || !candidate.originBlockId
          : (await intakeFor(track, block.id, [candidate])).length > 0;
      if (reached) {
        current = i;
        break;
      }
    }
  }
  return phases.map((p, i) => ({
    id: p.id,
    name: p.name,
    state: i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }));
}

/** La candidature, si la personne en est : celle qui l'a déposée, ou un membre de son organisation. */
async function mine(recordId: string, candidateId: string): Promise<Candidate | null> {
  const candidate = await repo.getCandidate(candidateId);
  if (!candidate) return null;
  const theirs = candidate.personId === recordId || (await dir.orgIdsOf(recordId)).has(candidate.orgId);
  return theirs ? candidate : null;
}

export async function journeyFor(recordId: string, candidateId: string): Promise<Journey | null> {
  const candidate = await mine(recordId, candidateId);
  if (!candidate) return null;
  const detail = await repo.getEditionDetail(candidate.editionId);
  const track = detail?.tracks.find((t) => t.id === candidate.trackId);
  if (!detail || !track) return null;

  const phases = await phasesOf(track, candidate);
  const blocks = orderedBlocks(track);
  const phaseOf = (blockId: string | null) =>
    track.phases.find((p) => p.blocks.some((b) => b.id === blockId))?.name ?? null;
  const history: JourneyEvent[] = [];

  /* La candidature. */
  if (candidate.submittedAt) {
    const origin = blocks.find((b) => b.id === candidate.originBlockId);
    history.push({
      at: candidate.submittedAt,
      kind: 'application',
      label: `Candidature déposée${origin ? ` — ${origin.name}` : ''}`,
      phase: phaseOf(origin?.id ?? null),
    });
  }

  for (const block of blocks) {
    /* Une sélection, une fois annoncée : retenue. */
    if (block.type === 'selection') {
      const config = block.config as { publishedAt?: string | null; passLabel?: string };
      if (config.publishedAt && (await passSetOf(track, block, [candidate])).has(candidate.id)) {
        history.push({
          at: config.publishedAt,
          kind: 'selection',
          label: `${config.passLabel || 'Retenue'} — ${block.name}`,
          phase: phaseOf(block.id),
        });
      }
    }
    /* Les pièces envoyées, et celles que CEED a acceptées. */
    if (block.type === 'deliverable') {
      const items = (block.config as { items?: FormField[] }).items ?? [];
      for (const r of await repo.listReturnsFor(block.id, candidate.id)) {
        const item = items.find((i) => i.id === r.itemId);
        const what = item?.label || 'Pièce';
        if (r.returnedAt) history.push({ at: r.returnedAt, kind: 'deliverable', label: `Envoyé — ${what}`, phase: phaseOf(block.id) });
        if (r.state === 'accepted' && r.reviewedAt) {
          history.push({ at: r.reviewedAt, kind: 'deliverable', label: `Accepté — ${what}`, phase: phaseOf(block.id) });
        }
      }
    }
  }

  /* Les comités passés, auxquels elle avait confirmé. */
  const sittings = await all<{ blockId: string; name: string; heldOn: string; committee: string }>(
    `select s.block_id as "blockId", s.name, s.held_on::text as "heldOn", b.name as committee
       from committee_assignments a
       join committee_sessions s on s.id = a.session_id
       join blocks b on b.id = s.block_id
      where a.candidate_id = $1 and a.rsvp_state = 'confirmed' and s.held_on is not null and s.held_on <= current_date`,
    [candidate.id],
  );
  for (const s of sittings) {
    history.push({ at: s.heldOn, kind: 'committee', label: `Passage devant ${s.committee}${s.name ? ` — ${s.name}` : ''}`, phase: phaseOf(s.blockId) });
  }

  /* Les One to One tenus, et les préparations envoyées. */
  const meetings = await all<{
    blockId: string; heldOn: string | null; status: string; personName: string; withNames: string; prepSubmittedAt: string | null;
  }>(
    `select m.block_id as "blockId", m.held_on::text as "heldOn", m.status, coalesce(p.name, '') as "personName",
            coalesce((select string_agg(w.name, ' & ' order by w.name) from records w
                       where w.id in (select jsonb_array_elements_text(m.with_ids))), '') as "withNames",
            m.prep_submitted_at::text as "prepSubmittedAt"
       from one_to_one_meetings m left join records p on p.id = m.person_id
      where m.candidate_id = $1`,
    [candidate.id],
  );
  for (const m of meetings) {
    const who = meetingWith(m);
    if (m.status === 'held' && m.heldOn) {
      history.push({ at: m.heldOn, kind: 'one_to_one', label: `One to One${who ? ` avec ${who}` : ''}`, phase: phaseOf(m.blockId) });
    }
    if (m.prepSubmittedAt) {
      history.push({ at: m.prepSubmittedAt, kind: 'preparation', label: `Préparation envoyée${who ? ` — ${who}` : ''}`, phase: phaseOf(m.blockId) });
    }
  }

  /* Les indicateurs envoyés, moment par moment. */
  const setup = await editionSetup(candidate.editionId);
  const measures = await all<{ momentId: string; submittedAt: string }>(
    `select moment_id as "momentId", submitted_at::text as "submittedAt" from kpi_responses
      where candidate_id = $1 and submitted_at is not null`,
    [candidate.id],
  );
  for (const k of measures) {
    const moment = setup.moments.find((m) => m.id === k.momentId);
    history.push({ at: k.submittedAt, kind: 'kpi', label: `Indicateurs envoyés${moment ? ` — ${moment.name}` : ''}`, phase: null });
  }

  history.sort((a, b) => b.at.localeCompare(a.at));
  return {
    editionId: candidate.editionId,
    candidateId: candidate.id,
    programName: detail.program.name,
    editionName: detail.name,
    orgName: candidate.orgName,
    status: candidate.status,
    startsOn: detail.startsOn ?? null,
    endsOn: detail.endsOn ?? null,
    phases,
    next: phases.find((p) => p.state === 'upcoming')?.name ?? null,
    history,
  };
}
