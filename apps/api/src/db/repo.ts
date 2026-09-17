import {
  defaultBlockConfig,
  defaultBlockName,
  idOf,
  newId,
  orderedBlocks,
  parseBlockConfig,
  type Block,
  type BlockType,
  type BlockOutcomeRow,
  type Candidate,
  type CommitteeAssignment,
  type CommitteeSession,
  type Edition,
  type EditionDetail,
  type EvaluationScore,
  type Phase,
  type PhaseWithBlocks,
  type Program,
  type ProgramWithEditions,
  type SelectionOutcome,
  type Track,
  type TrackWithPhases,
} from '@ceed/shared';
import { all, db, one } from './client.js';

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

const PROGRAM_COLS = `id, name, code, type, summary, partner, colour, created_at::text as "createdAt"`;
const EDITION_COLS = `id, program_id as "programId", name, status, starts_on::text as "startsOn",
  ends_on::text as "endsOn", city, seats, position, created_at::text as "createdAt"`;
const TRACK_COLS = `id, edition_id as "editionId", name, is_default as "isDefault", position`;
const PHASE_COLS = `id, track_id as "trackId", name, starts_on::text as "startsOn",
  ends_on::text as "endsOn", position`;
const BLOCK_COLS = `id, phase_id as "phaseId", type, name, position, config`;
const CANDIDATE_COLS = `id, edition_id as "editionId", track_id as "trackId",
  origin_block_id as "originBlockId", org_name as "orgName", contact_name as "contactName",
  email, phone, source, status, answers, submitted_at::text as "submittedAt"`;
const SCORE_COLS = `id, block_id as "blockId", candidate_id as "candidateId",
  evaluator_id as "evaluatorId", evaluator_name as "evaluatorName", marks, comment,
  submitted_at::text as "submittedAt"`;

function hydrateBlock(row: Block): Block {
  return { ...row, config: parseBlockConfig(row.type, row.config) };
}

/* ------------------------------------------------------------------ */
/* Programs                                                            */
/* ------------------------------------------------------------------ */

export async function listPrograms(): Promise<ProgramWithEditions[]> {
  const programs = await all<Program>(`select ${PROGRAM_COLS} from programs order by created_at`);
  const editions = await all<Edition>(`select ${EDITION_COLS} from editions order by position, created_at`);
  return programs.map((p) => ({ ...p, editions: editions.filter((e) => e.programId === p.id) }));
}

export async function getProgram(id: string): Promise<ProgramWithEditions | null> {
  const program = await one<Program>(`select ${PROGRAM_COLS} from programs where id = $1`, [id]);
  if (!program) return null;
  const editions = await all<Edition>(
    `select ${EDITION_COLS} from editions where program_id = $1 order by position, created_at`,
    [id],
  );
  return { ...program, editions };
}

export async function createProgram(input: {
  name: string;
  code?: string;
  type?: string;
  summary?: string;
  partner?: string;
  colour?: string;
  edition?: {
    name: string;
    startsOn?: string | null;
    endsOn?: string | null;
    city?: string;
    seats?: number;
    template?: 'blank' | 'selection_funnel';
  };
}): Promise<ProgramWithEditions> {
  const conn = await db();
  const id = idOf.program();
  return conn.tx(async () => {
    await conn.query(
      `insert into programs (id, name, code, type, summary, partner, colour)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        input.name,
        input.code ?? '',
        input.type ?? 'Incubation',
        input.summary ?? '',
        input.partner ?? '',
        input.colour ?? '#2F5BFF',
      ],
    );
    if (input.edition) await insertEdition(id, input.edition);
    return (await getProgram(id))!;
  });
}

export async function updateProgram(id: string, patch: Record<string, unknown>): Promise<ProgramWithEditions | null> {
  const columns: Record<string, string> = {
    name: 'name',
    code: 'code',
    type: 'type',
    summary: 'summary',
    partner: 'partner',
    colour: 'colour',
  };
  await patchRow('programs', id, patch, columns);
  return getProgram(id);
}

export async function deleteProgram(id: string): Promise<void> {
  await (await db()).query('delete from programs where id = $1', [id]);
}

/* ------------------------------------------------------------------ */
/* Editions                                                            */
/* ------------------------------------------------------------------ */

const FUNNEL_TEMPLATE: { phase: string; blocks: BlockType[] }[] = [
  { phase: 'Recruitment', blocks: ['sourcing', 'application'] },
  { phase: 'Selection', blocks: ['evaluation', 'committee', 'selection'] },
];

async function insertEdition(
  programId: string,
  input: {
    name: string;
    startsOn?: string | null;
    endsOn?: string | null;
    city?: string;
    seats?: number;
    template?: 'blank' | 'selection_funnel';
    copyFromEditionId?: string;
  },
): Promise<string> {
  const conn = await db();
  const id = idOf.edition();
  const next = await one<{ n: number }>(
    'select coalesce(max(position), -1) + 1 as n from editions where program_id = $1',
    [programId],
  );
  await conn.query(
    `insert into editions (id, program_id, name, starts_on, ends_on, city, seats, position)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      programId,
      input.name,
      input.startsOn ?? null,
      input.endsOn ?? null,
      input.city ?? '',
      input.seats ?? 0,
      next?.n ?? 0,
    ],
  );

  if (input.copyFromEditionId) {
    await copyStructure(input.copyFromEditionId, id);
    return id;
  }

  const trackId = idOf.track();
  await conn.query(
    `insert into tracks (id, edition_id, name, is_default, position) values ($1,$2,'Main workflow',true,0)`,
    [trackId, id],
  );

  if (input.template === 'selection_funnel') {
    let phasePos = 0;
    for (const spec of FUNNEL_TEMPLATE) {
      const phaseId = idOf.phase();
      await conn.query('insert into phases (id, track_id, name, position) values ($1,$2,$3,$4)', [
        phaseId,
        trackId,
        spec.phase,
        phasePos++,
      ]);
      let blockPos = 0;
      for (const type of spec.blocks) {
        await insertBlock(phaseId, type, defaultBlockName(type), blockPos++);
      }
    }
  } else {
    await conn.query(`insert into phases (id, track_id, name, position) values ($1,$2,'Phase 1',0)`, [
      idOf.phase(),
      trackId,
    ]);
  }
  return id;
}

/** Duplicates tracks, phases and blocks — never candidates or decisions. */
async function copyStructure(fromEditionId: string, toEditionId: string): Promise<void> {
  const conn = await db();
  const tracks = await all<Track>(`select ${TRACK_COLS} from tracks where edition_id = $1 order by position`, [
    fromEditionId,
  ]);
  for (const track of tracks) {
    const trackId = idOf.track();
    await conn.query('insert into tracks (id, edition_id, name, is_default, position) values ($1,$2,$3,$4,$5)', [
      trackId,
      toEditionId,
      track.name,
      track.isDefault,
      track.position,
    ]);
    const phases = await all<Phase>(`select ${PHASE_COLS} from phases where track_id = $1 order by position`, [
      track.id,
    ]);
    for (const phase of phases) {
      const phaseId = idOf.phase();
      await conn.query('insert into phases (id, track_id, name, position) values ($1,$2,$3,$4)', [
        phaseId,
        trackId,
        phase.name,
        phase.position,
      ]);
      const blocks = await all<Block>(`select ${BLOCK_COLS} from blocks where phase_id = $1 order by position`, [
        phase.id,
      ]);
      for (const block of blocks) {
        // A copied application must not inherit the original's public link.
        const config =
          block.type === 'application'
            ? { ...(block.config as object), published: false, publicToken: '' }
            : block.config;
        await conn.query('insert into blocks (id, phase_id, type, name, position, config) values ($1,$2,$3,$4,$5,$6)', [
          idOf.block(),
          phaseId,
          block.type,
          block.name,
          block.position,
          JSON.stringify(config),
        ]);
      }
    }
  }
}

export async function createEdition(programId: string, input: Parameters<typeof insertEdition>[1]): Promise<Edition> {
  const conn = await db();
  return conn.tx(async () => {
    const id = await insertEdition(programId, input);
    return (await one<Edition>(`select ${EDITION_COLS} from editions where id = $1`, [id]))!;
  });
}

export async function updateEdition(id: string, patch: Record<string, unknown>): Promise<Edition | null> {
  await patchRow('editions', id, patch, {
    name: 'name',
    status: 'status',
    startsOn: 'starts_on',
    endsOn: 'ends_on',
    city: 'city',
    seats: 'seats',
  });
  return one<Edition>(`select ${EDITION_COLS} from editions where id = $1`, [id]);
}

export async function deleteEdition(id: string): Promise<void> {
  await (await db()).query('delete from editions where id = $1', [id]);
}

export async function getEditionDetail(id: string): Promise<EditionDetail | null> {
  const edition = await one<Edition>(`select ${EDITION_COLS} from editions where id = $1`, [id]);
  if (!edition) return null;
  const program = await one<Program>(`select ${PROGRAM_COLS} from programs where id = $1`, [edition.programId]);
  if (!program) return null;

  const tracks = await all<Track>(`select ${TRACK_COLS} from tracks where edition_id = $1 order by position`, [id]);
  const phases = await all<Phase>(
    `select ${PHASE_COLS} from phases where track_id = any($1::text[]) order by position`,
    [tracks.map((t) => t.id)],
  );
  const blocks = await all<Block>(
    `select ${BLOCK_COLS} from blocks where phase_id = any($1::text[]) order by position`,
    [phases.map((p) => p.id)],
  );

  const byPhase = new Map<string, Block[]>();
  for (const block of blocks) {
    const list = byPhase.get(block.phaseId) ?? [];
    list.push(hydrateBlock(block));
    byPhase.set(block.phaseId, list);
  }
  const withBlocks: PhaseWithBlocks[] = phases.map((p) => ({ ...p, blocks: byPhase.get(p.id) ?? [] }));
  const withPhases: TrackWithPhases[] = tracks.map((t) => ({
    ...t,
    phases: withBlocks.filter((p) => p.trackId === t.id),
  }));

  return { ...edition, program, tracks: withPhases };
}

/* ------------------------------------------------------------------ */
/* Tracks                                                              */
/* ------------------------------------------------------------------ */

export async function createTrack(editionId: string, name: string): Promise<Track> {
  const conn = await db();
  const id = idOf.track();
  const next = await one<{ n: number }>(
    'select coalesce(max(position), -1) + 1 as n from tracks where edition_id = $1',
    [editionId],
  );
  await conn.query('insert into tracks (id, edition_id, name, is_default, position) values ($1,$2,$3,false,$4)', [
    id,
    editionId,
    name,
    next?.n ?? 0,
  ]);
  await conn.query(`insert into phases (id, track_id, name, position) values ($1,$2,'Phase 1',0)`, [idOf.phase(), id]);
  return (await one<Track>(`select ${TRACK_COLS} from tracks where id = $1`, [id]))!;
}

export async function renameTrack(id: string, name: string): Promise<void> {
  await (await db()).query('update tracks set name = $2 where id = $1', [id, name]);
}

export async function deleteTrack(id: string): Promise<void> {
  await (await db()).query('delete from tracks where id = $1 and is_default = false', [id]);
}

/* ------------------------------------------------------------------ */
/* Phases                                                              */
/* ------------------------------------------------------------------ */

export async function createPhase(trackId: string, name?: string): Promise<Phase> {
  const conn = await db();
  const id = idOf.phase();
  const next = await one<{ n: number }>('select coalesce(max(position), -1) + 1 as n from phases where track_id = $1', [
    trackId,
  ]);
  const position = next?.n ?? 0;
  await conn.query('insert into phases (id, track_id, name, position) values ($1,$2,$3,$4)', [
    id,
    trackId,
    name?.trim() || `Phase ${position + 1}`,
    position,
  ]);
  return (await one<Phase>(`select ${PHASE_COLS} from phases where id = $1`, [id]))!;
}

export async function updatePhase(id: string, patch: Record<string, unknown>): Promise<Phase | null> {
  await patchRow('phases', id, patch, { name: 'name', startsOn: 'starts_on', endsOn: 'ends_on' });
  return one<Phase>(`select ${PHASE_COLS} from phases where id = $1`, [id]);
}

export async function deletePhase(id: string): Promise<void> {
  await (await db()).query('delete from phases where id = $1', [id]);
}

export async function reorderPhases(trackId: string, ids: string[]): Promise<void> {
  const conn = await db();
  await conn.tx(async () => {
    for (const [index, id] of ids.entries()) {
      await conn.query('update phases set position = $3 where id = $1 and track_id = $2', [id, trackId, index]);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

async function insertBlock(phaseId: string, type: BlockType, name: string, position: number): Promise<string> {
  const conn = await db();
  const id = idOf.block();
  const config = defaultBlockConfig(type) as Record<string, unknown>;
  if (type === 'application') config.publicToken = newId('form').replace('form_', '');
  await conn.query('insert into blocks (id, phase_id, type, name, position, config) values ($1,$2,$3,$4,$5,$6)', [
    id,
    phaseId,
    type,
    name,
    position,
    JSON.stringify(config),
  ]);
  return id;
}

export async function createBlock(phaseId: string, type: BlockType, name?: string, at?: number): Promise<Block> {
  const conn = await db();
  return conn.tx(async () => {
    const siblings = await all<{ id: string }>('select id from blocks where phase_id = $1 order by position', [
      phaseId,
    ]);
    const position = at === undefined ? siblings.length : Math.max(0, Math.min(at, siblings.length));
    // Open a slot at `position` before inserting.
    await conn.query('update blocks set position = position + 1 where phase_id = $1 and position >= $2', [
      phaseId,
      position,
    ]);
    const id = await insertBlock(phaseId, type, name?.trim() || defaultBlockName(type), position);
    const row = (await one<Block>(`select ${BLOCK_COLS} from blocks where id = $1`, [id]))!;
    return hydrateBlock(row);
  });
}

export async function updateBlock(id: string, patch: { name?: string; config?: Record<string, unknown> }) {
  const conn = await db();
  const current = await one<Block>(`select ${BLOCK_COLS} from blocks where id = $1`, [id]);
  if (!current) return null;
  if (patch.name !== undefined) await conn.query('update blocks set name = $2 where id = $1', [id, patch.name]);
  if (patch.config !== undefined) {
    // Merge so a drawer can send only the keys it edits.
    const merged = parseBlockConfig(current.type, { ...(current.config as object), ...patch.config });
    await conn.query('update blocks set config = $2 where id = $1', [id, JSON.stringify(merged)]);
  }
  const row = (await one<Block>(`select ${BLOCK_COLS} from blocks where id = $1`, [id]))!;
  return hydrateBlock(row);
}

export async function deleteBlock(id: string): Promise<void> {
  const conn = await db();
  await conn.tx(async () => {
    const block = await one<{ phaseId: string; position: number }>(
      'select phase_id as "phaseId", position from blocks where id = $1',
      [id],
    );
    if (!block) return;
    await conn.query('delete from blocks where id = $1', [id]);
    await conn.query('update blocks set position = position - 1 where phase_id = $1 and position > $2', [
      block.phaseId,
      block.position,
    ]);
  });
}

/** Moves a block inside its phase or into another one, closing and opening slots. */
export async function moveBlock(id: string, toPhaseId: string, toPosition: number): Promise<void> {
  const conn = await db();
  await conn.tx(async () => {
    const block = await one<{ phaseId: string; position: number }>(
      'select phase_id as "phaseId", position from blocks where id = $1',
      [id],
    );
    if (!block) return;

    await conn.query('update blocks set position = position - 1 where phase_id = $1 and position > $2', [
      block.phaseId,
      block.position,
    ]);
    const count = await one<{ n: number }>('select count(*)::int as n from blocks where phase_id = $1 and id <> $2', [
      toPhaseId,
      id,
    ]);
    const target = Math.max(0, Math.min(toPosition, count?.n ?? 0));
    await conn.query('update blocks set position = position + 1 where phase_id = $1 and position >= $2 and id <> $3', [
      toPhaseId,
      target,
      id,
    ]);
    await conn.query('update blocks set phase_id = $2, position = $3 where id = $1', [id, toPhaseId, target]);
  });
}

export async function getBlock(id: string): Promise<Block | null> {
  const row = await one<Block>(`select ${BLOCK_COLS} from blocks where id = $1`, [id]);
  return row ? hydrateBlock(row) : null;
}

/** Resolves the edition and track a block belongs to, in one hop. */
export async function blockContext(
  blockId: string,
): Promise<{ block: Block; trackId: string; editionId: string } | null> {
  const row = await one<{ trackId: string; editionId: string }>(
    `select t.id as "trackId", t.edition_id as "editionId"
       from blocks b join phases p on p.id = b.phase_id join tracks t on t.id = p.track_id
      where b.id = $1`,
    [blockId],
  );
  const block = await getBlock(blockId);
  if (!row || !block) return null;
  return { block, trackId: row.trackId, editionId: row.editionId };
}

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

export async function listCandidates(editionId: string, trackId?: string): Promise<Candidate[]> {
  return trackId
    ? all<Candidate>(
        `select ${CANDIDATE_COLS} from candidates where edition_id = $1 and track_id = $2 order by submitted_at`,
        [editionId, trackId],
      )
    : all<Candidate>(`select ${CANDIDATE_COLS} from candidates where edition_id = $1 order by submitted_at`, [
        editionId,
      ]);
}

export async function createCandidate(input: {
  editionId: string;
  trackId: string;
  originBlockId?: string | null;
  orgName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  answers?: Record<string, unknown>;
  submittedAt?: string;
}): Promise<Candidate> {
  const conn = await db();
  const id = idOf.candidate();
  await conn.query(
    `insert into candidates (id, edition_id, track_id, origin_block_id, org_name, contact_name, email, phone, source, answers, submitted_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11::timestamptz, now()))`,
    [
      id,
      input.editionId,
      input.trackId,
      input.originBlockId ?? null,
      input.orgName,
      input.contactName ?? '',
      input.email ?? '',
      input.phone ?? '',
      input.source ?? '',
      JSON.stringify(input.answers ?? {}),
      input.submittedAt ?? null,
    ],
  );
  return (await one<Candidate>(`select ${CANDIDATE_COLS} from candidates where id = $1`, [id]))!;
}

export async function updateCandidate(id: string, patch: Record<string, unknown>): Promise<Candidate | null> {
  await patchRow('candidates', id, patch, {
    orgName: 'org_name',
    contactName: 'contact_name',
    email: 'email',
    phone: 'phone',
    source: 'source',
    status: 'status',
    trackId: 'track_id',
  });
  return one<Candidate>(`select ${CANDIDATE_COLS} from candidates where id = $1`, [id]);
}

export async function deleteCandidate(id: string): Promise<void> {
  await (await db()).query('delete from candidates where id = $1', [id]);
}

/** Looks up a published application form by its public token. */
export async function findPublicForm(token: string) {
  const row = await one<{ blockId: string; trackId: string; editionId: string }>(
    `select b.id as "blockId", t.id as "trackId", t.edition_id as "editionId"
       from blocks b join phases p on p.id = b.phase_id join tracks t on t.id = p.track_id
      where b.type = 'application' and b.config->>'publicToken' = $1`,
    [token],
  );
  if (!row) return null;
  const block = await getBlock(row.blockId);
  if (!block) return null;
  const edition = await one<Edition>(`select ${EDITION_COLS} from editions where id = $1`, [row.editionId]);
  const program = edition
    ? await one<Program>(`select ${PROGRAM_COLS} from programs where id = $1`, [edition.programId])
    : null;

  // Where the call is running, so the form can ask which one brought them in.
  const detail = await getEditionDetail(row.editionId);
  const track = detail?.tracks.find((t) => t.id === row.trackId);
  const ordered = track ? orderedBlocks(track) : [];
  const at = ordered.findIndex((b) => b.id === block.id);
  const sourcing = ordered
    .slice(0, at === -1 ? ordered.length : at)
    .filter((b) => b.type === 'sourcing')
    .pop();
  const channels = sourcing ? ((sourcing.config as { channels?: string[] }).channels ?? []) : [];

  return { block, trackId: row.trackId, editionId: row.editionId, edition, program, channels };
}

/* ------------------------------------------------------------------ */
/* Evaluation scores                                                   */
/* ------------------------------------------------------------------ */

export async function listScores(blockId: string): Promise<EvaluationScore[]> {
  return all<EvaluationScore>(`select ${SCORE_COLS} from evaluation_scores where block_id = $1`, [blockId]);
}

export async function upsertScore(input: {
  blockId: string;
  candidateId: string;
  evaluatorId: string;
  evaluatorName?: string;
  sessionId?: string | null;
  marks: Record<string, number>;
  comment?: string;
  submit?: boolean;
}): Promise<EvaluationScore> {
  const conn = await db();
  await conn.query(
    `insert into evaluation_scores (id, block_id, candidate_id, evaluator_id, evaluator_name, marks, comment, submitted_at, session_id)
     values ($1,$2,$3,$4,$5,$6,$7, case when $8 then now() else null end, $9)
     on conflict (block_id, candidate_id, evaluator_id) do update
       set marks = excluded.marks,
           comment = excluded.comment,
           evaluator_name = excluded.evaluator_name,
           session_id = coalesce(excluded.session_id, evaluation_scores.session_id),
           submitted_at = case when $8 then now() else evaluation_scores.submitted_at end`,
    [
      newId('scr'),
      input.blockId,
      input.candidateId,
      input.evaluatorId,
      input.evaluatorName ?? '',
      JSON.stringify(input.marks),
      input.comment ?? '',
      input.submit ?? false,
      input.sessionId ?? null,
    ],
  );
  return (await one<EvaluationScore>(
    `select ${SCORE_COLS} from evaluation_scores where block_id = $1 and candidate_id = $2 and evaluator_id = $3`,
    [input.blockId, input.candidateId, input.evaluatorId],
  ))!;
}

/* ------------------------------------------------------------------ */
/* Selection outcomes                                                  */
/* ------------------------------------------------------------------ */

export async function listOutcomes(blockId: string): Promise<SelectionOutcome[]> {
  return all<SelectionOutcome>(
    `select block_id as "blockId", candidate_id as "candidateId", outcome, overridden,
            decided_at::text as "decidedAt" from selection_outcomes where block_id = $1`,
    [blockId],
  );
}

export async function setOutcome(
  blockId: string,
  candidateId: string,
  outcome: 'pass' | 'fail',
  overridden: boolean,
): Promise<void> {
  await (await db()).query(
    `insert into selection_outcomes (block_id, candidate_id, outcome, overridden, decided_at)
     values ($1,$2,$3,$4, now())
     on conflict (block_id, candidate_id) do update
       set outcome = excluded.outcome, overridden = excluded.overridden, decided_at = now()`,
    [blockId, candidateId, outcome, overridden],
  );
}

export async function clearOutcome(blockId: string, candidateId: string): Promise<void> {
  await (await db()).query('delete from selection_outcomes where block_id = $1 and candidate_id = $2', [
    blockId,
    candidateId,
  ]);
}

export async function clearOutcomes(blockId: string): Promise<void> {
  await (await db()).query('delete from selection_outcomes where block_id = $1', [blockId]);
}

export async function setCandidateStatuses(updates: { id: string; status: string }[]): Promise<void> {
  if (!updates.length) return;
  const conn = await db();
  await conn.tx(async () => {
    for (const u of updates) {
      await conn.query('update candidates set status = $2 where id = $1', [u.id, u.status]);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Shared update helper                                                */
/* ------------------------------------------------------------------ */

async function patchRow(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  columns: Record<string, string>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in patch) || patch[key] === undefined) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return;
  await (await db()).query(`update ${table} set ${sets.join(', ')} where id = $1`, params);
}

/* ------------------------------------------------------------------ */
/* Committee sittings                                                  */
/* ------------------------------------------------------------------ */

const SESSION_COLS = `id, block_id as "blockId", name, held_on::text as "heldOn", windows,
  minutes_per_startup as "minutesPerStartup", location, jury, position`;
const ASSIGNMENT_COLS = `id, session_id as "sessionId", candidate_id as "candidateId", token,
  rsvp_state as "rsvpState", slot_index as "slotIndex", responded_at::text as "respondedAt"`;

export async function listSessions(blockId: string): Promise<CommitteeSession[]> {
  return all<CommitteeSession>(`select ${SESSION_COLS} from committee_sessions where block_id = $1 order by position`, [
    blockId,
  ]);
}

export async function createSession(blockId: string, patch: Record<string, unknown>): Promise<CommitteeSession> {
  const conn = await db();
  const id = newId('ses');
  const next = await one<{ n: number }>(
    'select coalesce(max(position), -1) + 1 as n from committee_sessions where block_id = $1',
    [blockId],
  );
  const position = next?.n ?? 0;
  await conn.query(
    `insert into committee_sessions (id, block_id, name, held_on, windows, minutes_per_startup, location, jury, position)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      blockId,
      (patch.name as string)?.trim() || `Committee ${position + 1}`,
      (patch.heldOn as string) ?? null,
      JSON.stringify(patch.windows ?? [{ startsAt: '09:00', endsAt: '12:00' }]),
      (patch.minutesPerStartup as number) ?? 25,
      (patch.location as string) ?? '',
      JSON.stringify(patch.jury ?? []),
      position,
    ],
  );
  return (await one<CommitteeSession>(`select ${SESSION_COLS} from committee_sessions where id = $1`, [id]))!;
}

export async function updateSession(id: string, patch: Record<string, unknown>): Promise<CommitteeSession | null> {
  const conn = await db();
  if (patch.jury !== undefined) {
    await conn.query('update committee_sessions set jury = $2 where id = $1', [id, JSON.stringify(patch.jury)]);
  }
  if (patch.windows !== undefined) {
    await conn.query('update committee_sessions set windows = $2 where id = $1', [id, JSON.stringify(patch.windows)]);
  }
  await patchRow('committee_sessions', id, patch, {
    name: 'name',
    heldOn: 'held_on',
    minutesPerStartup: 'minutes_per_startup',
    location: 'location',
  });
  return one<CommitteeSession>(`select ${SESSION_COLS} from committee_sessions where id = $1`, [id]);
}

export async function deleteSession(id: string): Promise<void> {
  await (await db()).query('delete from committee_sessions where id = $1', [id]);
}

export async function sessionBlockId(sessionId: string): Promise<string | null> {
  const row = await one<{ blockId: string }>('select block_id as "blockId" from committee_sessions where id = $1', [
    sessionId,
  ]);
  return row?.blockId ?? null;
}

/* ---- assignments ---- */

export async function listAssignments(blockId: string): Promise<CommitteeAssignment[]> {
  return all<CommitteeAssignment>(
    `select ${ASSIGNMENT_COLS} from committee_assignments
      where session_id in (select id from committee_sessions where block_id = $1)`,
    [blockId],
  );
}

/** Adds candidates to a sitting, skipping any already assigned anywhere in the block. */
export async function assignToSession(sessionId: string, candidateIds: string[]): Promise<number> {
  if (!candidateIds.length) return 0;
  const conn = await db();
  const blockId = await sessionBlockId(sessionId);
  if (!blockId) return 0;
  const taken = new Set((await listAssignments(blockId)).map((a) => a.candidateId));
  const fresh = candidateIds.filter((id) => !taken.has(id));
  await conn.tx(async () => {
    for (const candidateId of fresh) {
      await conn.query(
        'insert into committee_assignments (id, session_id, candidate_id, token) values ($1,$2,$3,$4)',
        [newId('asg'), sessionId, candidateId, newId('bk').replace('bk_', '')],
      );
    }
  });
  return fresh.length;
}

/** Drops a startup on a slot, trading places with whoever holds it. */
export async function moveAssignmentToSlot(assignmentId: string, slotIndex: number | null): Promise<void> {
  const conn = await db();
  const mine = await one<CommitteeAssignment>(
    `select ${ASSIGNMENT_COLS} from committee_assignments where id = $1`,
    [assignmentId],
  );
  if (!mine) return;
  await conn.tx(async () => {
    if (slotIndex !== null) {
      const holder = await one<{ id: string }>(
        'select id from committee_assignments where session_id = $1 and slot_index = $2 and id <> $3',
        [mine.sessionId, slotIndex, assignmentId],
      );
      if (holder) {
        await conn.query('update committee_assignments set slot_index = $2 where id = $1', [
          holder.id,
          mine.slotIndex,
        ]);
      }
    }
    await conn.query('update committee_assignments set slot_index = $2 where id = $1', [assignmentId, slotIndex]);
  });
}

export async function unassign(assignmentId: string): Promise<void> {
  await (await db()).query('delete from committee_assignments where id = $1', [assignmentId]);
}

export async function findAssignmentById(id: string): Promise<CommitteeAssignment | null> {
  return one<CommitteeAssignment>(`select ${ASSIGNMENT_COLS} from committee_assignments where id = $1`, [id]);
}

export async function findAssignmentByToken(token: string) {
  const assignment = await one<CommitteeAssignment>(
    `select ${ASSIGNMENT_COLS} from committee_assignments where token = $1`,
    [token],
  );
  if (!assignment) return null;
  const session = await one<CommitteeSession>(`select ${SESSION_COLS} from committee_sessions where id = $1`, [
    assignment.sessionId,
  ]);
  const candidate = await one<Candidate>(`select ${CANDIDATE_COLS} from candidates where id = $1`, [
    assignment.candidateId,
  ]);
  if (!session || !candidate) return null;
  const block = await getBlock(session.blockId);
  const siblings = await all<CommitteeAssignment>(
    `select ${ASSIGNMENT_COLS} from committee_assignments where session_id = $1`,
    [session.id],
  );
  return { assignment, session, candidate, block, siblings };
}

/**
 * Records an answer. `slotIndex` undefined keeps the time already held — which is
 * what confirming a time the team gave has to do.
 */
export async function respondToAssignment(
  id: string,
  rsvpState: string,
  slotIndex?: number | null,
): Promise<void> {
  const conn = await db();
  if (slotIndex === undefined) {
    await conn.query('update committee_assignments set rsvp_state = $2, responded_at = now() where id = $1', [
      id,
      rsvpState,
    ]);
    return;
  }
  await conn.query(
    'update committee_assignments set rsvp_state = $2, slot_index = $3, responded_at = now() where id = $1',
    [id, rsvpState, slotIndex],
  );
}

/* ------------------------------------------------------------------ */
/* Statuses put on candidates by an evaluation or a committee          */
/* ------------------------------------------------------------------ */

export async function listBlockOutcomes(blockId: string): Promise<BlockOutcomeRow[]> {
  return all<BlockOutcomeRow>(
    `select block_id as "blockId", candidate_id as "candidateId", outcome_id as "outcomeId",
            overridden, decided_at::text as "decidedAt" from block_outcomes where block_id = $1`,
    [blockId],
  );
}

export async function setBlockOutcome(
  blockId: string,
  candidateId: string,
  outcomeId: string,
  overridden: boolean,
): Promise<void> {
  await (await db()).query(
    `insert into block_outcomes (block_id, candidate_id, outcome_id, overridden, decided_at)
     values ($1,$2,$3,$4, now())
     on conflict (block_id, candidate_id) do update
       set outcome_id = excluded.outcome_id, overridden = excluded.overridden, decided_at = now()`,
    [blockId, candidateId, outcomeId, overridden],
  );
}

/* ------------------------------------------------------------------ */
/* Sourcing outreach                                                   */
/* ------------------------------------------------------------------ */

export interface OutreachSend {
  id: string;
  blockId: string;
  subject: string;
  body: string;
  recipients: string[];
  sentAt: string;
}

export async function listSends(blockId: string): Promise<OutreachSend[]> {
  return all<OutreachSend>(
    `select id, block_id as "blockId", subject, body, recipients, sent_at::text as "sentAt"
       from outreach_sends where block_id = $1 order by sent_at desc`,
    [blockId],
  );
}

export async function recordSend(
  blockId: string,
  subject: string,
  body: string,
  recipients: string[],
): Promise<OutreachSend> {
  const id = newId('snd');
  await (await db()).query(
    'insert into outreach_sends (id, block_id, subject, body, recipients) values ($1,$2,$3,$4,$5)',
    [id, blockId, subject, body, JSON.stringify(recipients)],
  );
  return (await one<OutreachSend>(
    `select id, block_id as "blockId", subject, body, recipients, sent_at::text as "sentAt"
       from outreach_sends where id = $1`,
    [id],
  ))!;
}
