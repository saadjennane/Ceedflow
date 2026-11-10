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
import { itemComplete, meetingWith, orderedBlocks, prepForm, requiredShown, type DeliverableItem, shownFieldIds, type Candidate, type FormField, type OneToOneConfig, type TrackWithPhases } from '@ceed/shared';
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
  /** Où relire ce qui a été fait : la préparation, la séance, les indicateurs. Absent quand le contenu est sur la page même. */
  href?: string;
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
  /** La candidature telle qu'elle a été envoyée, question par question. */
  application: { label: string; value: unknown; type: string }[];
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
  return candidate ? journeyOf(candidate, { groupDeliverables: true }) : null;
}

/**
 * Le parcours lui-même, sans demander qui le lit — l'équipe CEED, ou la startup après vérification.
 *
 * `groupDeliverables` : une ligne par liste de pièces plutôt qu'une par pièce —
 * ce que lit la startup, qui ouvre la liste pour le détail. L'équipe garde le détail.
 */
export async function journeyOf(candidate: Candidate, opts: { groupDeliverables?: boolean } = {}): Promise<Journey | null> {
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
      const returns = await repo.listReturnsFor(block.id, candidate.id);
      /* La liste où la pièce se relit et se remplace. */
      const href = `/me?tab=Programs&prog=${candidate.editionId}&list=${block.id}`;
      if (opts.groupDeliverables) {
        const dates = returns.flatMap((r) => [r.returnedAt, r.state === 'accepted' ? r.reviewedAt : null]).filter((d): d is string => Boolean(d));
        if (dates.length) {
          const valueOf = (id: string) => returns.find((r) => r.itemId === id)?.value;
          const required = requiredShown(items as DeliverableItem[], valueOf);
          const counted = required.length ? required : (items as DeliverableItem[]);
          const sent = counted.filter((i) => itemComplete(i, valueOf(i.id))).length;
          const accepted = returns.filter((r) => r.state === 'accepted').length;
          const back = returns.filter((r) => r.state === 'rejected').length;
          history.push({
            at: dates.sort().pop()!,
            kind: 'deliverable',
            label: [
              `${block.name} — ${sent}/${counted.length} envoyée${sent > 1 ? 's' : ''}`,
              accepted ? `${accepted} acceptée${accepted > 1 ? 's' : ''}` : null,
              back ? `${back} à renvoyer` : null,
            ].filter(Boolean).join(' · '),
            phase: phaseOf(block.id),
            href,
          });
        }
        continue;
      }
      for (const r of returns) {
        const item = items.find((i) => i.id === r.itemId);
        const what = item?.label || 'Pièce';
        if (r.returnedAt) history.push({ at: r.returnedAt, kind: 'deliverable', label: `Envoyé — ${what}`, phase: phaseOf(block.id), href });
        if (r.state === 'accepted' && r.reviewedAt) {
          history.push({ at: r.reviewedAt, kind: 'deliverable', label: `Accepté — ${what}`, phase: phaseOf(block.id), href });
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
    id: string; token: string; blockId: string; heldOn: string | null; status: string; personName: string; withNames: string; prepSubmittedAt: string | null;
    past: boolean;
  }>(
    `select m.id, m.token, m.block_id as "blockId", m.held_on::text as "heldOn", m.status, coalesce(p.name, '') as "personName",
            (m.held_on is not null and m.held_on < current_date) as past,
            coalesce((select string_agg(w.name, ' & ' order by w.name) from records w
                       where w.id in (select jsonb_array_elements_text(m.with_ids))), '') as "withNames",
            m.prep_submitted_at::text as "prepSubmittedAt"
       from one_to_one_meetings m left join records p on p.id = m.person_id
      where m.candidate_id = $1`,
    [candidate.id],
  );
  for (const m of meetings) {
    const who = meetingWith(m);
    /* La préparation se relit sur sa page ; sans préparation, la séance a la sienne. */
    const block = blocks.find((b) => b.id === m.blockId);
    const prep = block ? prepForm(block.config as OneToOneConfig) : null;
    const href = prep ? `/prepare/${m.id}` : `/meet/${m.token}`;
    /* Tenue — ou passée sans que personne ne l'ait marquée : elle a eu lieu pour la startup. */
    if (m.heldOn && (m.status === 'held' || (m.status === 'planned' && m.past))) {
      history.push({ at: m.heldOn, kind: 'one_to_one', label: `One to One${who ? ` avec ${who}` : ''}`, phase: phaseOf(m.blockId), href });
    }
    if (m.prepSubmittedAt && prep) {
      history.push({ at: m.prepSubmittedAt, kind: 'preparation', label: `Préparation envoyée${who ? ` — ${who}` : ''}`, phase: phaseOf(m.blockId), href });
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
    history.push({
      at: k.submittedAt, kind: 'kpi', label: `Indicateurs envoyés${moment ? ` — ${moment.name}` : ''}`, phase: null,
      href: `/kpi/${k.momentId}/${candidate.id}`,
    });
  }

  history.sort((a, b) => b.at.localeCompare(a.at));

  /* Ses réponses, dans l'ordre du formulaire : celles qu'elle a vues et remplies. */
  const form = blocks.find((b) => b.id === candidate.originBlockId) ?? blocks.find((b) => b.type === 'application');
  const fields = form?.type === 'application' ? (((form.config as { fields?: FormField[] }).fields ?? []) as FormField[]) : [];
  const shown = shownFieldIds(fields, candidate.answers);
  const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  const application = candidate.submittedAt
    ? fields
        .filter((f) => shown.has(f.id) && !blank(candidate.answers[f.id]))
        .map((f) => ({ label: f.label, value: candidate.answers[f.id], type: f.type }))
    : [];
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
    application,
  };
}
