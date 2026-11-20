/**
 * Les centres du réseau CEED, et la frontière entre eux.
 *
 * Every staff request carries a centre — the one the person is working in.
 * Everything a route touches by its identifiers is traced back to the centre
 * that owns it, and refused if it is not that one: a programme and all that
 * hangs from it belong to the centre that runs it; a person or an
 * organisation belongs to every centre whose community it has joined; tasks,
 * the knowledge base, Funding and team notes carry their centre directly.
 *
 * One place does this for every route, from the route's own parameters and
 * the identifiers its body names — rather than a check inside each handler,
 * where the one that was forgotten would be the one that leaks.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyRequest } from 'fastify';
import { newId, type StaffRole } from '@ceed/shared';
import { all, one } from '../db/client.js';
import { HttpError } from '../routes/util.js';

/** Le centre d'avant le réseau : toutes les données d'avant la migration y vivent. */
export const DEFAULT_CENTER = 'ctr_maroc';

/**
 * Le centre de la requête en cours, posé par le garde pour toute la suite de
 * son traitement : les listes s'y limitent, ce qui se crée y naît. Hors d'une
 * requête de l'équipe — un envoi programmé, un script, un test qui appelle un
 * service directement — c'est le centre d'avant le réseau.
 */
const context = new AsyncLocalStorage<{ centerId: string }>();
export const currentCenter = (): string => context.getStore()?.centerId ?? DEFAULT_CENTER;
/** Faire tourner `fn` dans un centre — pour le garde, et pour les tests. */
export const inCenter = <T>(centerId: string, fn: () => T): T => context.run({ centerId }, fn);

export interface CenterRow {
  id: string;
  name: string;
  country: string;
  city: string;
  logoUploadId: string | null;
  description: string;
  status: 'active' | 'inactive';
  /** Le nom qui signe ses lettres ; vide : celui de la plateforme. */
  mailName: string;
  /** Où arrivent les réponses à ses lettres ; vide : l'adresse de la plateforme. */
  replyTo: string;
  createdAt: string;
}

const CENTER_COLS = `id, name, country, city, logo_upload_id as "logoUploadId", description, status,
  mail_name as "mailName", reply_to as "replyTo", created_at::text as "createdAt"`;

export const listCenters = () => all<CenterRow>(`select ${CENTER_COLS} from centers order by created_at, name`);
export const getCenter = (id: string) => one<CenterRow>(`select ${CENTER_COLS} from centers where id = $1`, [id]);

/** Un nouveau centre du réseau. */
export async function createCenter(input: { name: string; country?: string; city?: string; description?: string }): Promise<CenterRow> {
  const id = newId('ctr');
  await all(`insert into centers (id, name, country, city, description) values ($1, $2, $3, $4, $5)`, [
    id, input.name.trim(), input.country ?? '', input.city ?? '', input.description ?? '',
  ]);
  return (await getCenter(id))!;
}

/** Ce qui change d'un centre : son identité, son statut, la signature de ses lettres. */
export async function updateCenter(
  id: string,
  patch: Partial<Pick<CenterRow, 'name' | 'country' | 'city' | 'description' | 'status' | 'mailName' | 'replyTo' | 'logoUploadId'>>,
): Promise<CenterRow | null> {
  const columns: Record<string, string> = {
    name: 'name', country: 'country', city: 'city', description: 'description', status: 'status',
    mailName: 'mail_name', replyTo: 'reply_to', logoUploadId: 'logo_upload_id',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    params.push(typeof value === 'string' ? value.trim() : value);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length) await all(`update centers set ${sets.join(', ')} where id = $1`, params);
  return getCenter(id);
}

/** L'équipe d'un centre, ses administrateurs d'abord. */
export const staffOf = (centerId: string) =>
  all<{ accountId: string; recordId: string; name: string; email: string; role: StaffRole }>(
    `select a.id as "accountId", a.record_id as "recordId", r.name, a.email, cs.role
       from center_staff cs join accounts a on a.id = cs.account_id join records r on r.id = a.record_id
      where cs.center_id = $1 and a.disabled_at is null
      order by case cs.role when 'admin' then 0 when 'editor' then 1 else 2 end, r.name`,
    [centerId],
  );

/**
 * Le réseau en chiffres, sans double compte : une startup présente dans deux
 * communautés est une startup ; un programme diffusé dans trois centres est un
 * programme. Les programmes et fiches de l'espace de test ne comptent pas.
 */
export async function networkFigures(): Promise<{
  totals: { centers: number; programs: number; startups: number; members: number };
  centers: (CenterRow & { activePrograms: number; completedPrograms: number; startups: number; members: number })[];
}> {
  /* Un programme actif : une édition en cours. Terminé : des éditions, toutes terminées. */
  const programState = `
    select p.id, p.center_id,
           bool_or(e.status = 'Live') as live,
           count(e.id) > 0 and bool_and(e.status = 'Completed') as done
      from programs p join editions e on e.program_id = p.id and e.deleted_at is null
     where p.deleted_at is null and not p.is_test
     group by p.id, p.center_id`;
  /* Une startup accompagnée : une organisation candidate à un programme du centre, sans s'être retirée. */
  const startups = `
    select distinct p.center_id, c.org_id
      from candidates c join editions e on e.id = c.edition_id join programs p on p.id = e.program_id
      join records o on o.id = c.org_id
     where c.deleted_at is null and c.status <> 'Withdrawn' and not p.is_test and o.deleted_at is null and o.test_owner is null`;
  const members = `
    select cm.center_id, cm.record_id from center_members cm join records r on r.id = cm.record_id
     where r.deleted_at is null and r.test_owner is null`;

  const [centers, perProgram, perStartup, perMember, totals] = await Promise.all([
    listCenters(),
    all<{ center_id: string; active: number; completed: number }>(
      `select center_id, count(*) filter (where live)::int as active, count(*) filter (where done)::int as completed
         from (${programState}) s group by center_id`,
    ),
    all<{ center_id: string; n: number }>(`select center_id, count(*)::int as n from (${startups}) s group by center_id`),
    all<{ center_id: string; n: number }>(`select center_id, count(*)::int as n from (${members}) m group by center_id`),
    one<{ centers: number; programs: number; startups: number; members: number }>(
      `select (select count(*)::int from centers where status = 'active') as centers,
              (select count(*)::int from (${programState}) s where live) as programs,
              (select count(distinct org_id)::int from (${startups}) s) as startups,
              (select count(distinct record_id)::int from (${members}) m) as members`,
    ),
  ]);
  const of = <T extends { center_id: string }>(rows: T[], id: string) => rows.find((r) => r.center_id === id);
  return {
    totals: totals ?? { centers: 0, programs: 0, startups: 0, members: 0 },
    centers: centers.map((c) => ({
      ...c,
      activePrograms: of(perProgram, c.id)?.active ?? 0,
      completedPrograms: of(perProgram, c.id)?.completed ?? 0,
      startups: of(perStartup, c.id)?.n ?? 0,
      members: of(perMember, c.id)?.n ?? 0,
    })),
  };
}

/** Les programmes du réseau, chacun une fois : son centre, son état, ses dates, où il est diffusé. */
export const networkPrograms = () =>
  all<{
    id: string; name: string; colour: string; centerId: string; centerName: string;
    status: 'Draft' | 'Live' | 'Completed'; startsOn: string | null; endsOn: string | null;
    distributedTo: { centerId: string; name: string; status: string }[];
  }>(
    `select p.id, p.name, p.colour, p.center_id as "centerId", c.name as "centerName",
            case when bool_or(e.status = 'Live') then 'Live'
                 when count(e.id) > 0 and bool_and(e.status = 'Completed') then 'Completed'
                 else 'Draft' end as status,
            min(e.starts_on)::text as "startsOn", max(e.ends_on)::text as "endsOn",
            coalesce((select json_agg(json_build_object('centerId', d.center_id, 'name', dc.name, 'status', d.status) order by dc.name)
                        from program_distributions d join centers dc on dc.id = d.center_id where d.program_id = p.id), '[]'::json) as "distributedTo"
       from programs p join centers c on c.id = p.center_id
       left join editions e on e.program_id = p.id and e.deleted_at is null
      where p.deleted_at is null and not p.is_test
      group by p.id, c.name
      order by c.name, p.name`,
  );

/** Où une personne de l'équipe travaille, et avec quel rôle dans chacun. */
export const centersOfAccount = (accountId: string) =>
  all<{ centerId: string; role: StaffRole }>(
    `select cs.center_id as "centerId", cs.role from center_staff cs
       join centers c on c.id = cs.center_id
      where cs.account_id = $1 order by c.created_at, c.name`,
    [accountId],
  );

export async function isGlobalAdmin(accountId: string): Promise<boolean> {
  const row = await one<{ g: string | null }>('select global_role as g from accounts where id = $1', [accountId]);
  return row?.g === 'admin';
}

/**
 * Le rattachement d'une fiche à un centre. Idempotent : deux candidatures au
 * même centre ne font qu'une ligne, et le premier motif reste.
 */
export async function joinCenter(recordId: string, centerId: string, origin: string): Promise<void> {
  await all(
    `insert into center_members (record_id, center_id, origin) values ($1, $2, $3)
     on conflict (record_id, center_id) do nothing`,
    [recordId, centerId, origin],
  );
}

/** Un compte de l'équipe de ce centre — une condition SQL sur l'alias d'un compte. */
export const staffOfCenter = (account: string, centerParam: string) =>
  `exists (select 1 from center_staff cs where cs.account_id = ${account}.id and cs.center_id = ${centerParam})`;

/** Un compte de l'équipe d'un centre, n'importe lequel, ou de CEED Global. */
export const staffAnywhere = (account: string) =>
  `(${account}.global_role = 'admin' or exists (select 1 from center_staff cs where cs.account_id = ${account}.id))`;

/**
 * Une fiche quitte la communauté d'un centre — sans être supprimée : elle
 * reste celle des autres. Les notes que ce centre avait prises partent avec.
 */
export async function leaveCenter(recordId: string, centerId: string): Promise<void> {
  await all('delete from center_members where record_id = $1 and center_id = $2', [recordId, centerId]);
  await all('delete from org_notes where org_id = $1 and center_id = $2', [recordId, centerId]);
}

/* ------------------------------------------------------------------ */
/* Which centre owns what                                               */
/* ------------------------------------------------------------------ */

/** D'un programme — et de tout ce qui pend sous lui — à son centre. */
const viaEdition = (edition: string) => `select p.center_id from editions e join programs p on p.id = e.program_id where e.id = ${edition}`;
const viaBlock = (block: string) =>
  `select p.center_id from blocks b join phases ph on ph.id = b.phase_id join tracks t on t.id = ph.track_id
     join editions e on e.id = t.edition_id join programs p on p.id = e.program_id where b.id = ${block}`;

/**
 * Pour chaque sorte d'objet : les centres auxquels il appartient. Une fiche
 * en a autant que de communautés ; tout le reste, un seul.
 */
const OWNERS = {
  program: `select center_id from programs where id = $1`,
  edition: viaEdition('$1'),
  track: `select p.center_id from tracks t join editions e on e.id = t.edition_id join programs p on p.id = e.program_id where t.id = $1`,
  phase: `select p.center_id from phases ph join tracks t on t.id = ph.track_id join editions e on e.id = t.edition_id join programs p on p.id = e.program_id where ph.id = $1`,
  block: viaBlock('$1'),
  candidate: `select p.center_id from candidates c join editions e on e.id = c.edition_id join programs p on p.id = e.program_id where c.id = $1`,
  session: viaBlock('(select block_id from committee_sessions where id = $1)'),
  assignment: viaBlock('(select s.block_id from committee_assignments a join committee_sessions s on s.id = a.session_id where a.id = $1)'),
  meeting: viaBlock('(select block_id from one_to_one_meetings where id = $1)'),
  day: viaBlock('(select block_id from one_to_one_days where id = $1)'),
  notice: viaBlock('(select block_id from deliverable_notices where id = $1)'),
  record: `select center_id from center_members where record_id = $1`,
  document: `select cm.center_id from org_documents d join center_members cm on cm.record_id = d.org_id where d.id = $1`,
  note: `select center_id from org_notes where id = $1`,
  affiliation: `select cm.center_id from affiliations a join center_members cm on cm.record_id = a.person_id where a.id = $1`,
  orgRequest: `select cm.center_id from org_requests r join center_members cm on cm.record_id = r.org_id where r.id = $1`,
  task: `select center_id from tasks where id = $1`,
  taskItem: `select t.center_id from task_items i join tasks t on t.id = i.task_id where i.id = $1`,
  taskAttachment: `select t.center_id from task_attachments a join tasks t on t.id = a.task_id where a.id = $1`,
  kbCategory: `select center_id from kb_categories where id = $1`,
  kbEntry: `select center_id from kb_entries where id = $1`,
  kbVersion: `select e.center_id from kb_versions v join kb_entries e on e.id = v.entry_id where v.id = $1`,
  kbFinding: `select e.center_id from kb_findings f join kb_versions v on v.id = f.version_id join kb_entries e on e.id = v.entry_id where f.id = $1`,
  fundingAnalysis: `select center_id from funding_analyses where id = $1`,
  fundingOpportunity: `select center_id from funding_opportunities where id = $1`,
  fundingAction: `select a.center_id from funding_actions x join funding_analyses a on a.id = x.analysis_id where x.id = $1`,
  funderResult: `select cm.center_id from funder_search_results r join center_members cm on cm.record_id = r.record_id where r.id = $1`,
  meetingAnalysis: `select center_id from meeting_analyses where id = $1`,
  suggestion: `select m.center_id from meeting_task_suggestions s join meeting_analyses m on m.id = s.meeting_id where s.id = $1`,
  staff: `select center_id from center_staff where account_id = $1`,
  orgProduct: `select cm.center_id from org_products x join center_members cm on cm.record_id = x.org_id where x.id = $1`,
  orgFunding: `select cm.center_id from org_fundings x join center_members cm on cm.record_id = x.org_id where x.id = $1`,
  orgProgram: `select cm.center_id from org_programs x join center_members cm on cm.record_id = x.org_id where x.id = $1`,
} as const;
export type OwnedKind = keyof typeof OWNERS;

/** Les centres d'un objet — vide s'il n'existe pas (la route dira alors « introuvable »). */
export async function centersOf(kind: OwnedKind, id: string): Promise<string[]> {
  const rows = await all<{ center_id: string }>(OWNERS[kind], [id]);
  return rows.map((r) => r.center_id);
}

/**
 * Les paramètres de route, par préfixe : `/api/blocks/:id` est une brique,
 * `/api/blocks/:id/deliverables/:candidateId` une brique et une candidature.
 * Un paramètre qui n'est pas un objet d'un centre (une année, une clé de
 * réglage, un rang dans une liste) est nommé dans FREE, pour qu'aucun ne soit
 * laissé de côté par oubli : le test des routes refuse un paramètre inconnu.
 */
export const PARAM_KINDS: { prefix: string; param: string; kind: OwnedKind }[] = [
  { prefix: '/api/programs/', param: 'id', kind: 'program' },
  { prefix: '/api/editions/', param: 'id', kind: 'edition' },
  { prefix: '/api/tracks/', param: 'id', kind: 'track' },
  { prefix: '/api/phases/', param: 'id', kind: 'phase' },
  { prefix: '/api/blocks/', param: 'id', kind: 'block' },
  { prefix: '/api/blocks/', param: 'noticeId', kind: 'notice' },
  { prefix: '/api/candidates/', param: 'id', kind: 'candidate' },
  { prefix: '/api/sessions/', param: 'id', kind: 'session' },
  { prefix: '/api/assignments/', param: 'id', kind: 'assignment' },
  { prefix: '/api/meetings/', param: 'id', kind: 'meeting' },
  { prefix: '/api/one-to-one-days/', param: 'id', kind: 'day' },
  { prefix: '/api/records/', param: 'id', kind: 'record' },
  { prefix: '/api/records/', param: 'docId', kind: 'document' },
  { prefix: '/api/notes/', param: 'id', kind: 'note' },
  { prefix: '/api/affiliations/', param: 'id', kind: 'affiliation' },
  { prefix: '/api/org-requests/', param: 'requestId', kind: 'orgRequest' },
  { prefix: '/api/tasks/', param: 'id', kind: 'task' },
  { prefix: '/api/tasks/', param: 'itemId', kind: 'taskItem' },
  { prefix: '/api/tasks/', param: 'attachmentId', kind: 'taskAttachment' },
  { prefix: '/api/kb/categories/', param: 'id', kind: 'kbCategory' },
  { prefix: '/api/kb/entries/', param: 'id', kind: 'kbEntry' },
  { prefix: '/api/kb/versions/', param: 'id', kind: 'kbVersion' },
  { prefix: '/api/kb/findings/', param: 'id', kind: 'kbFinding' },
  { prefix: '/api/meeting-assistant/backlog/checklist/', param: 'entryId', kind: 'kbEntry' },
  { prefix: '/api/funding/analyses/', param: 'id', kind: 'fundingAnalysis' },
  { prefix: '/api/funding/opportunities/', param: 'id', kind: 'fundingOpportunity' },
  { prefix: '/api/funding/actions/', param: 'id', kind: 'fundingAction' },
  { prefix: '/api/funding/found/', param: 'id', kind: 'funderResult' },
  { prefix: '/api/funding/funders/', param: 'id', kind: 'record' },
  { prefix: '/api/meeting-assistant/meetings/', param: 'id', kind: 'meetingAnalysis' },
  { prefix: '/api/meeting-assistant/suggestions/', param: 'id', kind: 'suggestion' },
  { prefix: '/api/sandbox/people/', param: 'id', kind: 'record' },
  { prefix: '/api/staff/', param: 'accountId', kind: 'staff' },
  { prefix: '/api/records/:id/products/', param: 'itemId', kind: 'orgProduct' },
  { prefix: '/api/records/:id/fundings/', param: 'itemId', kind: 'orgFunding' },
  { prefix: '/api/records/:id/programs/', param: 'itemId', kind: 'orgProgram' },
];

/**
 * Des routes dont l'identifiant n'est l'objet d'aucun centre : les définitions
 * partagées par tout le réseau, comme les champs de la fiche d'une organisation
 * — la fiche est commune, ses champs le sont aussi.
 */
export const FREE_ROUTES: { prefix: string; param: string; why: string }[] = [
  { prefix: '/api/org-attributes/', param: 'id', why: 'a profile field definition, shared by the network' },
  { prefix: '/api/centers/', param: 'id', why: 'a centre itself — CEED Global only' },
];

/** Partout : une candidature nommée dans l'adresse est une candidature. */
const ANYWHERE: Record<string, OwnedKind> = { candidateId: 'candidate' };

/**
 * Ce qui n'est pas un objet d'un centre, ou n'en est un qu'à l'intérieur d'un
 * parent déjà vérifié par la même adresse.
 */
export const FREE_PARAMS: Record<string, string> = {
  evaluatorId: 'a juror inside a block already checked',
  momentId: 'a reporting moment inside an edition already checked',
  indicatorId: 'an indicator inside an edition already checked',
  index: 'a position in an analysis already checked',
  attributeId: 'a profile field definition, shared by the network',
  need: 'a need key on a record already checked',
  year: 'a year on a record already checked',
  key: 'a setting key',
  period: 'a period on a record already checked',
  batch: 'a trash batch — workspace admins only',
};

/** Les identifiants qu'un corps de requête peut nommer, et leur sorte. */
const BODY_KINDS: Record<string, OwnedKind> = {
  programId: 'program',
  editionId: 'edition',
  trackId: 'track',
  phaseId: 'phase',
  blockId: 'block',
  candidateId: 'candidate',
  candidateIds: 'candidate',
  recordId: 'record',
  orgId: 'record',
  personId: 'record',
  ownerIds: 'record',
  delegateId: 'record',
  analysisId: 'fundingAnalysis',
  entryId: 'kbEntry',
  categoryId: 'kbCategory',
};

export function kindOfParam(url: string, param: string): OwnedKind | null {
  const hit = PARAM_KINDS.find((k) => url.startsWith(k.prefix) && k.param === param);
  return hit?.kind ?? ANYWHERE[param] ?? null;
}

/**
 * Le contrôle : chaque objet nommé — dans l'adresse ou dans le corps — doit
 * appartenir au centre où l'on travaille. CEED Global n'y échappe pas : il
 * entre dans un centre, et y voit ce que voit ce centre.
 */
export async function assertInCenter(req: FastifyRequest, centerId: string): Promise<void> {
  const url = req.routeOptions?.url ?? '';
  const params = (req.params ?? {}) as Record<string, string>;
  const checks: { kind: OwnedKind; id: string }[] = [];
  for (const [param, value] of Object.entries(params)) {
    if (!value) continue;
    const kind = kindOfParam(url, param);
    if (kind) checks.push({ kind, id: value });
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : null;
  if (body) {
    for (const [key, kind] of Object.entries(BODY_KINDS)) {
      const value = body[key];
      const ids = Array.isArray(value) ? value : [value];
      for (const id of ids) if (typeof id === 'string' && id) checks.push({ kind, id });
    }
  }
  for (const { kind, id } of checks) {
    const owners = await centersOf(kind, id);
    /* Introuvable : la route le dira elle-même, avec son propre message. */
    if (!owners.length) continue;
    if (!owners.includes(centerId)) {
      throw new HttpError(404, 'Not found in this centre.');
    }
  }
}
