import {
  defaultBlockConfig,
  defaultBlockName,
  idOf,
  newId,
  orderedBlocks,
  parseBlockConfig,
  type Block,
  type BlockType,
  type BlockOutcome,
  type BlockOutcomeRow,
  type Candidate,
  type CommitteeAssignment,
  uploadIdsIn,
  type CommitteeSession,
  type Edition,
  type EditionDetail,
  type EvaluationScore,
  type Phase,
  type PhaseWithBlocks,
  type Program,
  type ProgramWithEditions,
  type SelectionOutcome,
  type SourcingConfig,
  type Track,
  type TrackWithPhases,
} from '@ceed/shared';
import { all, db, one } from './client.js';

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

const PROGRAM_COLS = `id, name, code, type, summary, partner, colour, statuses,
  created_at::text as "createdAt"`;
const EDITION_COLS = `id, program_id as "programId", name, status, starts_on::text as "startsOn",
  ends_on::text as "endsOn", city, mentors, position, created_at::text as "createdAt"`;
const TRACK_COLS = `id, edition_id as "editionId", name, is_default as "isDefault", position`;
const PHASE_COLS = `id, track_id as "trackId", name, starts_on::text as "startsOn",
  ends_on::text as "endsOn", position`;
const BLOCK_COLS = `id, phase_id as "phaseId", type, name, position, config`;
/**
 * A candidate's identity lives in the directory, not in a second copy on this
 * row. The payload keeps the same shape it always had — orgName, contactName,
 * email, phone — so nothing downstream had to learn about the join.
 */
const CANDIDATE_FROM = `
  from candidates c
  join records o on o.id = c.org_id
  left join records p on p.id = c.person_id
  left join accounts a on a.record_id = p.id`;
const CANDIDATE_SELECT = `select c.id, c.edition_id as "editionId", c.track_id as "trackId",
  c.origin_block_id as "originBlockId", c.org_id as "orgId", c.person_id as "personId",
  o.name as "orgName",
  coalesce(p.name, '') as "contactName",
  coalesce(nullif(p.email, ''), o.email, '') as "email",
  coalesce(nullif(p.phone, ''), o.phone, '') as "phone",
  c.source, c.status, c.mentor, c.cohort_status as "cohortStatus", c.answers,
  -- Derived here rather than stored: an account nobody was told about, one whose
  -- owner has not come, and one they made their own.
  case
    when a.id is null then null
    when not a.must_change_password then 'claimed'
    when a.invited_at is not null then 'invited'
    else 'unclaimed'
  end as "accountState",
  c.submitted_at::text as "submittedAt"
  ${CANDIDATE_FROM}`;
const SCORE_COLS = `id, block_id as "blockId", candidate_id as "candidateId",
  evaluator_id as "evaluatorId", evaluator_name as "evaluatorName", marks, verdict, comment,
  submitted_at::text as "submittedAt", withdrawn_at::text as "withdrawnAt"`;

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
  if (patch.statuses !== undefined) {
    await (await db()).query('update programs set statuses = $2::jsonb where id = $1', [
      id,
      patch.statuses,
    ]);
  }
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
    `insert into editions (id, program_id, name, starts_on, ends_on, city, position)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      programId,
      input.name,
      input.startsOn ?? null,
      input.endsOn ?? null,
      input.city ?? '',
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
            // A copied form starts shut and with a fresh link: the old one
            // belongs to the edition it was published for.
            ? { ...(block.config as object), visibility: 'closed', visibilitySetAt: null, publicToken: '' }
            : block.config;
        await conn.query('insert into blocks (id, phase_id, type, name, position, config) values ($1,$2,$3,$4,$5,$6)', [
          idOf.block(),
          phaseId,
          block.type,
          block.name,
          block.position,
          config,
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
  if (patch.mentors !== undefined) {
    await (await db()).query('update editions set mentors = $2 where id = $1', [id, patch.mentors]);
  }
  await patchRow('editions', id, patch, {
    name: 'name',
    status: 'status',
    startsOn: 'starts_on',
    endsOn: 'ends_on',
    city: 'city',
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

  // One query for every committee on the edition rather than one each.
  const counts = new Map<string, number>();
  const firstOn = new Map<string, string | null>();
  const jurors = new Map<string, number>();
  const committees = blocks.filter((b) => b.type === 'committee').map((b) => b.id);
  if (committees.length) {
    const rows = await all<{ blockId: string; n: number; firstOn: string | null; jurors: number }>(
      // The jury is jsonb, so it is unnested to be counted — and counted
      // distinct, because one person on two sittings is one juror.
      `select cs.block_id as "blockId",
              count(distinct cs.id)::int as n,
              min(cs.held_on)::text as "firstOn",
              count(distinct j.value)::int as jurors
         from committee_sessions cs
         left join lateral jsonb_array_elements_text(cs.jury) as j(value) on true
        where cs.block_id = any($1::text[])
        group by cs.block_id`,
      [committees],
    );
    for (const r of rows) {
      counts.set(r.blockId, Number(r.n));
      firstOn.set(r.blockId, r.firstOn);
      jurors.set(r.blockId, Number(r.jurors));
    }
  }

  const byPhase = new Map<string, Block[]>();
  for (const block of blocks) {
    if (block.type === 'committee') {
      block.sittings = counts.get(block.id) ?? 0;
      block.jurors = jurors.get(block.id) ?? 0;
      block.nextSittingOn = firstOn.get(block.id) ?? null;
    }
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
  if (type === 'evaluation') {
    // Inherited at birth and owned from then on: the programme's vocabulary
    // seeds the block, and editing the programme later leaves rounds already
    // judged in the old words alone.
    const row = await one<{ statuses: BlockOutcome[] }>(
      `select p.statuses from programs p
         join editions e on e.program_id = p.id
         join tracks t on t.edition_id = e.id
         join phases ph on ph.track_id = t.id
        where ph.id = $1`,
      [phaseId],
    );
    if (row?.statuses?.length) config.outcomes = row.statuses;
  }
  await conn.query('insert into blocks (id, phase_id, type, name, position, config) values ($1,$2,$3,$4,$5,$6)', [
    id,
    phaseId,
    type,
    name,
    position,
    config,
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
    await conn.query('update blocks set config = $2 where id = $1', [id, merged]);
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
        `${CANDIDATE_SELECT} where c.edition_id = $1 and c.track_id = $2 order by c.submitted_at`,
        [editionId, trackId],
      )
    : all<Candidate>(`${CANDIDATE_SELECT} where c.edition_id = $1 order by c.submitted_at`, [
        editionId,
      ]);
}

export async function createCandidate(input: {
  editionId: string;
  trackId: string;
  originBlockId?: string | null;
  /** The organisation applying, in the directory. */
  orgId: string;
  /** Who applied on its behalf. */
  personId?: string | null;
  source?: string;
  answers?: Record<string, unknown>;
  submittedAt?: string;
}): Promise<Candidate> {
  const conn = await db();
  const id = idOf.candidate();
  await conn.query(
    `insert into candidates (id, edition_id, track_id, origin_block_id, org_id, person_id, source, answers, submitted_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::timestamptz, now()))`,
    [
      id,
      input.editionId,
      input.trackId,
      input.originBlockId ?? null,
      input.orgId,
      input.personId ?? null,
      input.source ?? '',
      input.answers ?? {},
      input.submittedAt ?? null,
    ],
  );
  return (await one<Candidate>(`${CANDIDATE_SELECT} where c.id = $1`, [id]))!;
}

/**
 * Lets go of the times a withdrawn candidacy was holding.
 *
 * The seat on the panel stays — that is what makes the withdrawal reversible,
 * and what tells you afterwards which sitting they had been put on. Only the
 * slot goes, because a startup that is not coming must not keep a quarter of
 * an hour somebody else could use.
 */
export async function releaseSlots(candidateId: string): Promise<void> {
  await (await db()).query(
    'update committee_assignments set slot_index = null where candidate_id = $1 and slot_index is not null',
    [candidateId],
  );
}

/** One candidacy by id, hydrated the way the lists hydrate theirs. */
export async function getCandidate(id: string): Promise<Candidate | null> {
  const rows = await all<Candidate>(`${CANDIDATE_SELECT} where c.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateCandidate(id: string, patch: Record<string, unknown>): Promise<Candidate | null> {
  await patchRow('candidates', id, patch, {
    source: 'source',
    status: 'status',
    trackId: 'track_id',
    mentor: 'mentor',
    cohortStatus: 'cohort_status',
    // Who applied, and through which call — correctable, because an imported
    // candidacy arrives without either and a wrong contact is worth fixing.
    personId: 'person_id',
    originBlockId: 'origin_block_id',
  });
  // jsonb goes in its own statement: patchRow writes plain columns.
  if (patch.answers !== undefined) {
    await (await db()).query('update candidates set answers = $2::jsonb where id = $1', [
      id,
      patch.answers,
    ]);
  }
  return one<Candidate>(`${CANDIDATE_SELECT} where c.id = $1`, [id]);
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
  const channels = sourcing ? ((sourcing.config as SourcingConfig).channels ?? []) : [];

  return { block, trackId: row.trackId, editionId: row.editionId, edition, program, channels };
}

/* ------------------------------------------------------------------ */
/* Evaluation scores                                                   */
/* ------------------------------------------------------------------ */

export async function listScores(blockId: string): Promise<EvaluationScore[]> {
  return all<EvaluationScore>(`select ${SCORE_COLS} from evaluation_scores where block_id = $1`, [blockId]);
}

/**
 * Takes a sheet off the record entirely.
 *
 * Not the same act as withdrawing a mark. A withdrawal says somebody's reading
 * no longer counts and keeps it, because the jury gave it and a contested
 * decision needs to show what was said. A reset says the sheet should never
 * have existed — marks typed against the wrong juror, a sheet started on the
 * wrong startup — and a record of a thing that did not happen is worse than
 * no record at all.
 */
export async function deleteScore(blockId: string, candidateId: string, evaluatorId: string): Promise<number> {
  const rows = await (
    await db()
  ).query<{ id: string }>(
    `delete from evaluation_scores
      where block_id = $1 and candidate_id = $2 and evaluator_id = $3
      returning id`,
    [blockId, candidateId, evaluatorId],
  );
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Deliverables                                                        */
/* ------------------------------------------------------------------ */

export type ReturnState = 'received' | 'accepted' | 'rejected';

export interface DeliverableReturn {
  candidateId: string;
  itemId: string;
  value: unknown;
  state: ReturnState;
  /** Why it was refused, in the words of whoever refused it. */
  reason: string;
  returnedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

/** Everything handed in against one block, in one query: the screen reads it whole. */
export async function listReturns(blockId: string): Promise<DeliverableReturn[]> {
  return all<DeliverableReturn>(
    `select candidate_id as "candidateId", item_id as "itemId", value,
            state, reason, returned_at::text as "returnedAt",
            reviewed_at::text as "reviewedAt", updated_at::text as "updatedAt"
       from deliverable_returns where block_id = $1`,
    [blockId],
  );
}

/** What one startup has handed in, which is what its own page reads. */
export async function listReturnsFor(blockId: string, candidateId: string): Promise<DeliverableReturn[]> {
  return all<DeliverableReturn>(
    `select candidate_id as "candidateId", item_id as "itemId", value,
            state, reason, returned_at::text as "returnedAt",
            reviewed_at::text as "reviewedAt", updated_at::text as "updatedAt"
       from deliverable_returns where block_id = $1 and candidate_id = $2`,
    [blockId, candidateId],
  );
}

/**
 * Records one item. An empty value takes the row away rather than leaving a
 * blank one behind: an item cleared is an item not handed in, and a row saying
 * "returned, with nothing in it" would count as given on every screen that
 * asks who is missing.
 */
export async function saveReturn(
  blockId: string,
  candidateId: string,
  itemId: string,
  value: unknown,
): Promise<void> {
  const conn = await db();
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);
  if (empty) {
    await conn.query('delete from deliverable_returns where block_id = $1 and candidate_id = $2 and item_id = $3', [
      blockId,
      candidateId,
      itemId,
    ]);
    return;
  }
  await conn.query(
    `insert into deliverable_returns (block_id, candidate_id, item_id, value, returned_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     on conflict (block_id, candidate_id, item_id) do update
       set value = excluded.value,
           -- The first handing-in is the date that matters; a correction later
           -- does not make the document newly arrived.
           returned_at = coalesce(deliverable_returns.returned_at, excluded.returned_at),
           -- Something sent again is something to read again. A refusal that
           -- survived the answer to it would leave a file refused for a reason
           -- that has been dealt with.
           state = 'received',
           reason = '',
           reviewed_at = null,
           updated_at = now()`,
    [blockId, candidateId, itemId, value],
  );
}

/**
 * Reading one thing that was handed in.
 *
 * Only on something that exists: accepting a document nobody sent would put a
 * file in order on the strength of nothing.
 */
export async function reviewReturn(
  blockId: string,
  candidateId: string,
  itemId: string,
  state: ReturnState,
  reason: string,
): Promise<boolean> {
  const rows = await (
    await db()
  ).query<{ item_id: string }>(
    `update deliverable_returns
        set state = $4,
            reason = case when $4 = 'rejected' then $5 else '' end,
            reviewed_at = case when $4 = 'received' then null else now() end,
            updated_at = now()
      where block_id = $1 and candidate_id = $2 and item_id = $3
      returning item_id`,
    [blockId, candidateId, itemId, state, reason],
  );
  return rows.length > 0;
}

/* ---------------- deliverable notices ---------------- */

/**
 * What a notice is, as the product thinks of it: 'request', 'reminder',
 * 'selection_pass'. Text rather than an enum, like `outbox.kind`, because a
 * new sort of message is a line of code and not a migration.
 */
export type NoticeKind = string;
export type NoticeState = 'planned' | 'sent' | 'cancelled' | 'abandoned';

export interface Notice {
  id: string;
  blockId: string;
  kind: NoticeKind;
  state: NoticeState;
  reason: string;
  body: string;
  scheduledFor: string;
  sentAt: string | null;
  cancelledAt: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}

export interface NoticeTarget {
  noticeId: string;
  /**
   * Who it is for, whichever they are: a candidacy or a person in the
   * directory. A committee writes to both, and the machinery around this has
   * no reason to care which.
   */
  subjectId: string;
  candidateId: string | null;
  recordId: string | null;
  sentAt: string | null;
  letterId: string | null;
  skipped: string;
}

const NOTICE_COLS = `id, block_id as "blockId", kind, state, reason, body,
  scheduled_for::text as "scheduledFor", sent_at::text as "sentAt",
  cancelled_at::text as "cancelledAt", created_by as "createdBy",
  created_by_name as "createdByName", created_at::text as "createdAt"`;

export async function listNotices(blockId: string): Promise<Notice[]> {
  return all<Notice>(
    `select ${NOTICE_COLS} from notices where block_id = $1 order by created_at desc`,
    [blockId],
  );
}

export async function getNotice(id: string): Promise<Notice | null> {
  return one<Notice>(`select ${NOTICE_COLS} from notices where id = $1`, [id]);
}

/**
 * Everything a block has ever named, for the "has this one been asked" badge
 * and for what each notice did.
 *
 * Cancelled notices come back too, carrying their state: a notice called off is
 * still an act this product shows, and leaving its targets out of the query
 * would make it read as having named nobody. Whether a startup counts as asked
 * is answered by `sentAt`, which a cancelled notice never has.
 */
export async function listNoticeTargets(
  blockId: string,
): Promise<
  (NoticeTarget & {
    kind: NoticeKind;
    noticeState: NoticeState;
    /** When the receiving server took it, from the letter itself. */
    deliveredAt: string | null;
    /** What became of the letter: 'sent', 'bounced', 'failed', 'held'… */
    letterState: string | null;
  })[]
> {
  /* Left join to the letter, because "written" and "arrived" are two different
     facts and the screen is asked for both. A target with no letter — somebody
     named and then left out — simply has neither. */
  return all(
    `select t.notice_id as "noticeId", coalesce(t.candidate_id, t.record_id) as "subjectId",
            t.candidate_id as "candidateId", t.record_id as "recordId", t.kind,
            t.sent_at::text as "sentAt", t.letter_id as "letterId", t.skipped,
            n.state as "noticeState",
            o.delivered_at::text as "deliveredAt", o.state as "letterState"
       from notice_targets t
       join notices n on n.id = t.notice_id
       left join outbox o on o.id = t.letter_id
      where t.block_id = $1`,
    [blockId],
  );
}

export async function targetsOf(noticeId: string): Promise<NoticeTarget[]> {
  return all<NoticeTarget>(
    `select notice_id as "noticeId", coalesce(candidate_id, record_id) as "subjectId",
            candidate_id as "candidateId", record_id as "recordId",
            sent_at::text as "sentAt", letter_id as "letterId", skipped
       from notice_targets where notice_id = $1`,
    [noticeId],
  );
}

/**
 * Writes a notice and the startups it names, under a lock on the block.
 *
 * The lock is the half of the answer the unique index cannot give: two
 * administrators launching at the same second would each resolve the same
 * roster, write two notices with different ids, and everybody would hear twice.
 */
export async function createNotice(
  input: Omit<Notice, 'state' | 'reason' | 'sentAt' | 'cancelledAt' | 'createdAt'>,
  /** Who it goes to: a candidacy, or a person in the directory. */
  subjects: { candidateId?: string; recordId?: string }[],
  /**
   * Whether saying this twice to the same person is a defect. True for a
   * request and for an announcement, false for a reminder, which exists to be
   * repeated. The caller knows; an index listing words would not.
   */
  once = true,
): Promise<void> {
  const conn = await db();
  await conn.tx(async () => {
    await conn.query('select pg_advisory_xact_lock(hashtext($1))', [input.blockId]);
    await conn.query(
      `insert into notices
         (id, block_id, kind, body, scheduled_for, created_by, created_by_name)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.blockId, input.kind, input.body, input.scheduledFor, input.createdBy, input.createdByName],
    );
    for (const who of subjects) {
      await conn.query(
        `insert into notice_targets (notice_id, block_id, kind, candidate_id, record_id, once)
         values ($1,$2,$3,$4,$5,$6)`,
        [input.id, input.blockId, input.kind, who.candidateId ?? null, who.recordId ?? null, once],
      );
    }
  });
}

/** The notices whose hour has come. */
export async function dueNotices(): Promise<Notice[]> {
  return all<Notice>(
    `select ${NOTICE_COLS} from notices
      where state = 'planned' and scheduled_for <= now() order by scheduled_for`,
  );
}

/**
 * Claims one startup of a notice before its letter is written.
 *
 * False means somebody else has it — another tick, or the same one after a
 * restart. One row, at most one letter, whatever happens.
 */
export async function claimTarget(noticeId: string, subjectId: string): Promise<boolean> {
  const rows = await (
    await db()
  ).query<{ subjectId: string }>(
    `update notice_targets set sent_at = now()
      where notice_id = $1 and coalesce(candidate_id, record_id) = $2 and sent_at is null
      returning coalesce(candidate_id, record_id) as "subjectId"`,
    [noticeId, subjectId],
  );
  return rows.length > 0;
}

export async function markTarget(
  noticeId: string,
  subjectId: string,
  patch: { letterId?: string | null; skipped?: string },
): Promise<void> {
  await (await db()).query(
    `update notice_targets
        set letter_id = coalesce($3, letter_id), skipped = coalesce($4, skipped),
            -- Named and then left out: nobody heard anything, so the slot that
            -- stops a startup being asked twice goes back. The row stays.
            released_at = case when coalesce($4, '') <> '' then now() else released_at end
      where notice_id = $1 and coalesce(candidate_id, record_id) = $2`,
    [noticeId, subjectId, patch.letterId ?? null, patch.skipped ?? null],
  );
}

/**
 * Hands back the slot that stops a block writing to one startup twice.
 *
 * For the deliberate individual send: somebody is looking at that row and has
 * decided it must hear this again. The target rows stay — their date, their
 * letter, what became of it — because what was done is not undone by doing it
 * again.
 */
export async function releaseTargets(blockId: string, subjectId: string, kind: NoticeKind): Promise<void> {
  await (await db()).query(
    `update notice_targets set released_at = now()
      where block_id = $1 and coalesce(candidate_id, record_id) = $2 and kind = $3 and released_at is null`,
    [blockId, subjectId, kind],
  );
}

export async function settleNotice(id: string, state: NoticeState, reason = ''): Promise<void> {
  const conn = await db();
  await conn.query(
    `update notices
        set state = $2, reason = $3,
            sent_at = case when $2 = 'sent' then now() else sent_at end,
            cancelled_at = case when $2 = 'cancelled' then now() else cancelled_at end
      where id = $1`,
    [id, state, reason],
  );
  /* Called off, or abandoned because the list never opened: nothing reached
     anybody, so every startup it named can be asked again. Without this the
     next launch would die on `notice_told_once` instead of going out. */
  if (state === 'cancelled' || state === 'abandoned') {
    await conn.query(
      `update notice_targets set released_at = now()
        where notice_id = $1 and letter_id is null and released_at is null`,
      [id],
    );
  }
}

/** What each juror of a sitting has actually sent, so a removal can say what it costs. */
export async function marksPerJuror(
  sessionId: string,
): Promise<{ evaluatorId: string; evaluatorName: string; submitted: number }[]> {
  return all<{ evaluatorId: string; evaluatorName: string; submitted: number }>(
    // The name stored on the mark, not the directory's: it is who they were
    // when they scored, which is what the screen needs to name.
    `select evaluator_id as "evaluatorId", max(evaluator_name) as "evaluatorName",
            count(*)::int as submitted
       from evaluation_scores
      where session_id = $1 and submitted_at is not null and withdrawn_at is null
      group by evaluator_id`,
    [sessionId],
  );
}

/**
 * Takes marks out of the count without taking them out of the record.
 *
 * Scoped to the sitting: somebody can sit on two panels of the same committee,
 * and leaving one is not leaving the other.
 */
export async function withdrawScores(sessionId: string, evaluatorIds: string[]): Promise<number> {
  if (!evaluatorIds.length) return 0;
  const conn = await db();
  const rows = await conn.query<{ id: string }>(
    `update evaluation_scores set withdrawn_at = now()
      where session_id = $1 and evaluator_id = any($2) and withdrawn_at is null
      returning id`,
    [sessionId, evaluatorIds],
  );
  return rows.length;
}

export async function upsertScore(input: {
  blockId: string;
  candidateId: string;
  evaluatorId: string;
  evaluatorName?: string;
  sessionId?: string | null;
  marks: Record<string, number>;
  verdict?: string;
  comment?: string;
  submit?: boolean;
  /** Emptying a review takes it back to a draft: 'sent' must mean something was. */
  reopen?: boolean;
}): Promise<EvaluationScore> {
  const conn = await db();
  await conn.query(
    `insert into evaluation_scores (id, block_id, candidate_id, evaluator_id, evaluator_name, marks, verdict, comment, submitted_at, session_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8, case when $9 then now() else null end, $10)
     on conflict (block_id, candidate_id, evaluator_id) do update
       set marks = excluded.marks,
           verdict = excluded.verdict,
           comment = excluded.comment,
           evaluator_name = excluded.evaluator_name,
           session_id = coalesce(excluded.session_id, evaluation_scores.session_id),
           -- Somebody put back on a panel and marking again is marking for
           -- real: a withdrawal from a previous removal must not outlive it.
           withdrawn_at = null,
           submitted_at = case when $9 then now() when $11 then null else evaluation_scores.submitted_at end`,
    [
      newId('scr'),
      input.blockId,
      input.candidateId,
      input.evaluatorId,
      input.evaluatorName ?? '',
      input.marks,
      input.verdict ?? '',
      input.comment ?? '',
      input.submit ?? false,
      input.sessionId ?? null,
      input.reopen ?? false,
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
  outcome: 'pass' | 'wait' | 'fail',
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
  rsvp_state as "rsvpState", slot_index as "slotIndex", position, responded_at::text as "respondedAt"`;
/** The order they were put on the sitting — never the order the heap holds them. */
const ASSIGNMENT_ORDER = 'order by position, id';

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
      patch.windows ?? [{ startsAt: '09:00', endsAt: '12:00' }],
      (patch.minutesPerStartup as number) ?? 25,
      (patch.location as string) ?? '',
      patch.jury ?? [],
      position,
    ],
  );
  return (await one<CommitteeSession>(`select ${SESSION_COLS} from committee_sessions where id = $1`, [id]))!;
}

export async function updateSession(id: string, patch: Record<string, unknown>): Promise<CommitteeSession | null> {
  const conn = await db();
  if (patch.jury !== undefined) {
    await conn.query('update committee_sessions set jury = $2 where id = $1', [id, patch.jury]);
  }
  if (patch.windows !== undefined) {
    await conn.query('update committee_sessions set windows = $2 where id = $1', [id, patch.windows]);
  }
  await patchRow('committee_sessions', id, patch, {
    name: 'name',
    heldOn: 'held_on',
    minutesPerStartup: 'minutes_per_startup',
    location: 'location',
  });
  return one<CommitteeSession>(`select ${SESSION_COLS} from committee_sessions where id = $1`, [id]);
}

/** One sitting by id, jury included — for the rules that only need to know who sits. */
export async function findSessionById(id: string): Promise<CommitteeSession | null> {
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
      where session_id in (select id from committee_sessions where block_id = $1)
      ${ASSIGNMENT_ORDER}`,
    [blockId],
  );
}

/** What one sitting holds, in the order it was put there. */
export async function listSessionAssignments(sessionId: string): Promise<CommitteeAssignment[]> {
  return all<CommitteeAssignment>(
    `select ${ASSIGNMENT_COLS} from committee_assignments where session_id = $1 ${ASSIGNMENT_ORDER}`,
    [sessionId],
  );
}

/**
 * Adds candidates to a sitting, skipping any already on *that* sitting.
 *
 * It used to skip anyone already on any sitting of the block, which made a
 * startup's seat exclusive across the whole committee. A second jury on the
 * same startups — a second round, a control panel — had nowhere to exist, and
 * copying a sitting produced an empty one without saying why.
 */
export async function assignToSession(sessionId: string, candidateIds: string[]): Promise<number> {
  if (!candidateIds.length) return 0;
  const conn = await db();
  const blockId = await sessionBlockId(sessionId);
  if (!blockId) return 0;
  const taken = new Set((await listSessionAssignments(sessionId)).map((a) => a.candidateId));
  const fresh = candidateIds.filter((id) => !taken.has(id));
  // They go on in the order they were given, after whoever is already there.
  const last = await one<{ n: number }>(
    'select coalesce(max(position), -1)::int as n from committee_assignments where session_id = $1',
    [sessionId],
  );
  let position = (last?.n ?? -1) + 1;
  await conn.tx(async () => {
    for (const candidateId of fresh) {
      await conn.query(
        'insert into committee_assignments (id, session_id, candidate_id, token, position) values ($1,$2,$3,$4,$5)',
        [newId('asg'), sessionId, candidateId, newId('bk').replace('bk_', ''), position++],
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
  const candidate = await one<Candidate>(`${CANDIDATE_SELECT} where c.id = $1`, [
    assignment.candidateId,
  ]);
  if (!session || !candidate) return null;
  const block = await getBlock(session.blockId);
  const siblings = await all<CommitteeAssignment>(
    `select ${ASSIGNMENT_COLS} from committee_assignments where session_id = $1 ${ASSIGNMENT_ORDER}`,
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

export async function clearBlockOutcome(blockId: string, candidateId: string): Promise<void> {
  await (await db()).query('delete from block_outcomes where block_id = $1 and candidate_id = $2', [
    blockId,
    candidateId,
  ]);
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
  /** Which channel this went out through, so its result can be told apart. */
  channelId: string | null;
}

export async function listSends(blockId: string): Promise<OutreachSend[]> {
  return all<OutreachSend>(
    `select id, block_id as "blockId", subject, body, recipients,
            nullif(channel_id, '') as "channelId", sent_at::text as "sentAt"
       from outreach_sends where block_id = $1 order by sent_at desc`,
    [blockId],
  );
}

export async function recordSend(
  blockId: string,
  subject: string,
  body: string,
  recipients: string[],
  channelId: string | null = null,
): Promise<OutreachSend> {
  const id = newId('snd');
  await (await db()).query(
    `insert into outreach_sends (id, block_id, subject, body, recipients, channel_id)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, blockId, subject, body, recipients, channelId ?? ''],
  );
  return (await one<OutreachSend>(
    `select id, block_id as "blockId", subject, body, recipients,
            nullif(channel_id, '') as "channelId", sent_at::text as "sentAt"
       from outreach_sends where id = $1`,
    [id],
  ))!;
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export async function saveUpload(input: {
  filename: string;
  mime: string;
  bytes: Buffer;
  fieldId: string;
}): Promise<{ id: string; filename: string; size: number }> {
  const id = newId('upl');
  await (await db()).query(
    'insert into uploads (id, field_id, filename, mime, size, bytes) values ($1,$2,$3,$4,$5,$6)',
    [id, input.fieldId, input.filename, input.mime, input.bytes.length, input.bytes],
  );
  return { id, filename: input.filename, size: input.bytes.length };
}

/**
 * A file is uploaded before the form is sent, so it starts with no candidate.
 * Submitting is what attaches it — anything never claimed is an abandoned draft.
 */
export async function claimUploads(candidateId: string, answers: Record<string, unknown>): Promise<void> {
  /* All the way down, because an answer is no longer always one level deep: a
     CIN now sits inside the third associé of a repeatable group. A file that
     this misses stays unattached to any candidacy — and who may open a file
     follows from the candidacy it belongs to, so a missed one is an access
     rule with nothing behind it. */
  const ids = uploadIdsIn(Object.values(answers));
  if (!ids.length) return;
  await (await db()).query('update uploads set candidate_id = $1 where id = any($2::text[])', [candidateId, ids]);
}

export async function getUpload(id: string) {
  // The candidacy travels with the file: an attachment is somebody's business
  // plan, and who may open it follows from whose application it belongs to.
  return one<{ filename: string; mime: string; bytes: Buffer; candidateId: string | null; orgId: string | null }>(
    `select u.filename, u.mime, u.bytes, u.candidate_id as "candidateId", c.org_id as "orgId"
       from uploads u left join candidates c on c.id = u.candidate_id
      where u.id = $1`,
    [id],
  );
}
