/**
 * La Knowledge Base : le circuit d'une connaissance, de son écriture à sa
 * publication.
 *
 *   Analysis Pending → To Review → To Validate → Published
 *
 * L'IA analyse et recommande, un membre autre que l'auteur relit, le président
 * valide — et rien de cela ne se décide dans le navigateur : chaque droit se
 * vérifie ici. L'IA ne modifie, ne fusionne, ne supprime ni ne publie jamais
 * rien ; une analyse échouée n'est jamais une absence de conflit.
 */
import { createHash } from 'node:crypto';
import {
  KB_DEFAULT_MODEL,
  KB_FINDING_KINDS,
  KB_OPEN,
  kbFindingBlocks,
  newId,
  type KbAnalysis,
  type KbCategory,
  type KbComment,
  type KbEntryDetail,
  type KbEvent,
  type KbFinding,
  type KbFindingKind,
  type KbListItem,
  type KbOverview,
  type KbRights,
  type KbSettings,
  type KbStatus,
  type KbVersion,
  type StaffRole,
} from '@ceed/shared';
import { all, db, one } from '../db/client.js';
import { HttpError } from '../routes/util.js';
import { aiKeys, askJson, type AiProvider } from './ai.js';
import { findAccount } from './auth.js';

/** Qui agit : son dossier, et son rôle dans l'équipe. */
export interface KbActor {
  recordId: string;
  role: StaffRole;
}

/* ---------------------------------------------------------------- */
/* Réglages et droits                                                */
/* ---------------------------------------------------------------- */

const SETTING = { president: 'kb.president', provider: 'kb.provider', model: 'kb.model' } as const;

async function setting(key: string): Promise<string> {
  return (await one<{ value: string }>('select value from settings where key = $1', [key]))?.value ?? '';
}

async function putSetting(key: string, value: string): Promise<void> {
  await all(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

const canWrite = (role: StaffRole) => role === 'admin' || role === 'editor';

/** Le président désigné — s'il peut encore agir : un compte d'équipe en écriture, non désactivé. */
async function presidentRecord(): Promise<{ recordId: string; name: string; email: string } | null> {
  const id = await setting(SETTING.president);
  if (!id) return null;
  return one<{ recordId: string; name: string; email: string }>(
    `select r.id as "recordId", r.name, a.email
       from records r join accounts a on a.record_id = r.id
      where r.id = $1 and a.staff_role in ('admin', 'editor') and a.disabled_at is null`,
    [id],
  );
}

export async function rightsOf(actor: KbActor): Promise<KbRights> {
  const president = await presidentRecord();
  return {
    recordId: actor.recordId,
    canWrite: canWrite(actor.role),
    isAdmin: actor.role === 'admin',
    isPresident: Boolean(president && president.recordId === actor.recordId && canWrite(actor.role)),
    presidentName: president?.name ?? '',
  };
}

export async function kbSettings(): Promise<KbSettings> {
  const provider = (await setting(SETTING.provider)) as KbSettings['provider'];
  return {
    president: await presidentRecord(),
    provider: provider === 'anthropic' || provider === 'openai' ? provider : '',
    model: await setting(SETTING.model),
    keys: aiKeys(),
  };
}

/**
 * Désigner le président : un administrateur le fait, et jamais pour lui-même —
 * personne ne s'attribue le droit de publier.
 */
export async function saveKbSettings(
  input: { presidentEmail: string; provider: '' | AiProvider; model: string },
  actor: KbActor,
): Promise<KbSettings> {
  if (actor.role !== 'admin') throw new HttpError(403, 'Only a CEED administrator can change these settings.');
  if (!input.presidentEmail) await putSetting(SETTING.president, '');
  else {
    const account = await findAccount(input.presidentEmail);
    if (!account) throw new HttpError(422, 'No CeedFlow account has this address.', { presidentEmail: 'No account has this address.' });
    if (account.staffRole !== 'admin' && account.staffRole !== 'editor') {
      throw new HttpError(422, 'The president has to be on the CEED team, with write access.', { presidentEmail: 'Not on the CEED team with write access.' });
    }
    if (account.disabledAt) throw new HttpError(422, 'This account is disabled.', { presidentEmail: 'This account is disabled.' });
    if (account.recordId === actor.recordId && (await setting(SETTING.president)) !== actor.recordId) {
      throw new HttpError(403, 'You cannot designate yourself — another administrator has to.', { presidentEmail: 'Another administrator has to designate you.' });
    }
    await putSetting(SETTING.president, account.recordId);
  }
  await putSetting(SETTING.provider, input.provider);
  await putSetting(SETTING.model, input.model || (input.provider ? KB_DEFAULT_MODEL[input.provider] : ''));
  return kbSettings();
}

/** Un appel minuscule au fournisseur choisi : la connexion répond-elle ? */
export async function testAi(): Promise<{ ok: boolean; message: string }> {
  const { provider, model } = await kbSettings();
  if (!provider) return { ok: false, message: 'No AI provider is chosen.' };
  try {
    await askJson(provider, model, 'Answer only with the JSON object {"ok": true}.', 'Connection test.', { maxTokens: 2000, timeoutMs: 60_000 });
    return { ok: true, message: `${provider === 'openai' ? 'OpenAI' : 'Anthropic'} answers with ${model}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/* ---------------------------------------------------------------- */
/* Catégories                                                        */
/* ---------------------------------------------------------------- */

const STARTING_CATEGORIES = [
  ['kbc_programmes', 'Programmes'],
  ['kbc_rh', 'Ressources humaines'],
  ['kbc_finance', 'Finance & Administration'],
  ['kbc_gouvernance', 'Gouvernance'],
  ['kbc_operations', 'Opérations'],
  ['kbc_partenariats', 'Partenariats'],
  ['kbc_communication', 'Communication'],
  ['kbc_autres', 'Autres'],
] as const;

export async function listCategories(): Promise<KbCategory[]> {
  const rows = await all<KbCategory>('select id, name, position, active from kb_categories order by position, name');
  if (rows.length) return rows;
  /* Les catégories de départ, posées à la première lecture. */
  for (const [i, [id, name]] of STARTING_CATEGORIES.entries()) {
    await all('insert into kb_categories (id, name, position) values ($1, $2, $3) on conflict (id) do nothing', [id, name, i + 1]);
  }
  return all<KbCategory>('select id, name, position, active from kb_categories order by position, name');
}

export async function createCategory(input: { name: string }, actor: KbActor): Promise<KbCategory[]> {
  if (actor.role !== 'admin') throw new HttpError(403, 'Only a CEED administrator manages the categories.');
  const last = (await listCategories()).reduce((n, c) => Math.max(n, c.position), 0);
  await all('insert into kb_categories (id, name, position) values ($1, $2, $3)', [newId('kbc'), input.name, last + 1]);
  return listCategories();
}

export async function changeCategory(id: string, input: { name?: string; position?: number; active?: boolean }, actor: KbActor): Promise<KbCategory[]> {
  if (actor.role !== 'admin') throw new HttpError(403, 'Only a CEED administrator manages the categories.');
  const found = await one<{ id: string }>('select id from kb_categories where id = $1', [id]);
  if (!found) throw new HttpError(404, 'Category not found.');
  await all(
    `update kb_categories set name = coalesce($2, name), position = coalesce($3, position), active = coalesce($4, active) where id = $1`,
    [id, input.name ?? null, input.position ?? null, input.active ?? null],
  );
  return listCategories();
}

/* ---------------------------------------------------------------- */
/* Lecture                                                           */
/* ---------------------------------------------------------------- */

export const hashOf = (title: string, body: string) =>
  createHash('sha256').update(`${title.trim()}\n${body.replace(/\r\n/g, '\n').trim()}`).digest('hex');

const person = (id: string | null, name: string | null) => (id ? { id, name: name ?? '' } : null);

interface VersionRow {
  id: string; entryId: string; number: number; title: string; body: string; contentHash: string; changeSummary: string;
  status: KbStatus; authorId: string | null; authorName: string | null; revision: number;
  reviewedById: string | null; reviewedByName: string | null; reviewedAt: string | null; reviewedHash: string | null; reviewComment: string;
  validatedById: string | null; validatedByName: string | null; validatedAt: string | null; decision: KbVersion['decision']; decisionNote: string;
  publishedAt: string | null; createdAt: string; updatedAt: string;
}

const VERSION_COLS = `v.id, v.entry_id as "entryId", v.number, v.title, v.body, v.content_hash as "contentHash",
  v.change_summary as "changeSummary", v.status, v.author_id as "authorId", au.name as "authorName", v.revision,
  v.reviewed_by as "reviewedById", rv.name as "reviewedByName", v.reviewed_at::text as "reviewedAt", v.reviewed_hash as "reviewedHash",
  v.review_comment as "reviewComment", v.validated_by as "validatedById", va.name as "validatedByName",
  v.validated_at::text as "validatedAt", v.decision, v.decision_note as "decisionNote", v.published_at::text as "publishedAt",
  v.created_at::text as "createdAt", v.updated_at::text as "updatedAt"
  from kb_versions v
  left join records au on au.id = v.author_id
  left join records rv on rv.id = v.reviewed_by
  left join records va on va.id = v.validated_by`;

const toVersion = (r: VersionRow): KbVersion => ({
  id: r.id, entryId: r.entryId, number: r.number, title: r.title, body: r.body, contentHash: r.contentHash,
  changeSummary: r.changeSummary, status: r.status, author: person(r.authorId, r.authorName), revision: r.revision,
  reviewedBy: person(r.reviewedById, r.reviewedByName), reviewedAt: r.reviewedAt, reviewedHash: r.reviewedHash,
  reviewComment: r.reviewComment, validatedBy: person(r.validatedById, r.validatedByName), validatedAt: r.validatedAt,
  decision: r.decision, decisionNote: r.decisionNote, publishedAt: r.publishedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
});

export async function getVersion(id: string): Promise<KbVersion | null> {
  const row = await one<VersionRow>(`select ${VERSION_COLS} where v.id = $1`, [id]);
  return row ? toVersion(row) : null;
}

/** Les constats d'une version, sur son texte actuel seulement. */
async function findingsOf(version: Pick<KbVersion, 'id' | 'contentHash'>): Promise<KbFinding[]> {
  const rows = await all<{
    id: string; versionId: string; source: 'ai' | 'member'; kind: KbFindingKind; confidence: number; excerpt: string;
    otherExcerpt: string; explanation: string; recommendation: string; state: KbFinding['state']; justification: string;
    decidedById: string | null; decidedByName: string | null; decidedAt: string | null; createdAt: string;
    otherVersionId: string | null; otherEntryId: string | null; otherNumber: number | null; otherTitle: string | null; otherStatus: KbStatus | null;
  }>(
    `select f.id, f.version_id as "versionId", f.source, f.kind, f.confidence, f.excerpt, f.other_excerpt as "otherExcerpt",
            f.explanation, f.recommendation, f.state, f.justification, f.decided_by as "decidedById", d.name as "decidedByName",
            f.decided_at::text as "decidedAt", f.created_at::text as "createdAt",
            o.id as "otherVersionId", o.entry_id as "otherEntryId", o.number as "otherNumber", o.title as "otherTitle", o.status as "otherStatus"
       from kb_findings f
       left join records d on d.id = f.decided_by
       left join kb_versions o on o.id = f.other_version_id
      where f.version_id = $1 and f.content_hash = $2
      order by case f.kind when 'conflict' then 0 when 'duplicate' then 1 else 2 end, f.created_at`,
    [version.id, version.contentHash],
  );
  return rows.map((r) => ({
    id: r.id, versionId: r.versionId, source: r.source, kind: r.kind, confidence: r.confidence, excerpt: r.excerpt,
    otherExcerpt: r.otherExcerpt, explanation: r.explanation, recommendation: r.recommendation, state: r.state,
    justification: r.justification, decidedBy: person(r.decidedById, r.decidedByName), decidedAt: r.decidedAt, createdAt: r.createdAt,
    other: r.otherVersionId
      ? { entryId: r.otherEntryId!, versionId: r.otherVersionId, number: r.otherNumber!, title: r.otherTitle!, status: r.otherStatus! }
      : null,
  }));
}

async function latestAnalysis(versionId: string): Promise<KbAnalysis | null> {
  const row = await one<KbAnalysis & { result: { summary?: string } }>(
    `select id, version_id as "versionId", content_hash as "contentHash", provider, model, status, result, error,
            created_at::text as "createdAt", finished_at::text as "finishedAt"
       from kb_analyses where version_id = $1 order by created_at desc limit 1`,
    [versionId],
  );
  if (!row) return null;
  const { result, ...rest } = row;
  return { ...rest, summary: result?.summary ?? '' };
}

async function activityWhere(where: string, params: unknown[], limit = 500): Promise<KbEvent[]> {
  const rows = await all<{
    id: string; entryId: string; entryTitle: string | null; versionId: string | null; versionNumber: number | null; action: string;
    actorId: string | null; actorName: string | null; note: string; createdAt: string;
  }>(
    `select a.id, a.entry_id as "entryId",
            (select v2.title from kb_versions v2 where v2.entry_id = a.entry_id order by v2.number desc limit 1) as "entryTitle",
            a.version_id as "versionId", v.number as "versionNumber", a.action, a.actor_id as "actorId", r.name as "actorName",
            a.note, a.created_at::text as "createdAt"
       from kb_activity a
       left join kb_versions v on v.id = a.version_id
       left join records r on r.id = a.actor_id
      ${where}
      order by a.created_at desc, a.id desc
      limit ${limit}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id, entryId: r.entryId, entryTitle: r.entryTitle ?? '', versionId: r.versionId, versionNumber: r.versionNumber,
    action: r.action, actor: person(r.actorId, r.actorName), note: r.note, createdAt: r.createdAt,
  }));
}

export const kbHistory = (limit = 300) => activityWhere('', [], Math.min(Math.max(limit, 1), 1000));

const plain = (body: string) =>
  body.replace(/[#*_>`-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);

export async function kbOverview(actor: KbActor): Promise<KbOverview> {
  const categories = await listCategories();
  const entries = await all<{ id: string; categoryId: string; officialVersionId: string | null }>(
    'select id, category_id as "categoryId", official_version_id as "officialVersionId" from kb_entries',
  );
  const versions = (await all<VersionRow>(`select ${VERSION_COLS} order by v.number`)).map(toVersion);
  const byEntry = new Map<string, KbVersion[]>();
  for (const v of versions) byEntry.set(v.entryId, [...(byEntry.get(v.entryId) ?? []), v]);

  const items: KbListItem[] = [];
  let conflicts = 0;
  for (const e of entries) {
    const list = byEntry.get(e.id) ?? [];
    if (!list.length) continue;
    const official = list.find((v) => v.id === e.officialVersionId) ?? null;
    const open = list.find((v) => KB_OPEN.includes(v.status)) ?? null;
    const latest = list[list.length - 1]!;
    const blocking = open ? (await findingsOf(open)).filter(kbFindingBlocks).length : 0;
    conflicts += blocking;
    items.push({
      entryId: e.id,
      category: categories.find((c) => c.id === e.categoryId) ?? null,
      official: official && { id: official.id, number: official.number, title: official.title, publishedAt: official.publishedAt, author: official.author },
      open: open && { id: open.id, number: open.number, title: open.title, status: open.status, author: open.author, createdAt: open.createdAt, updatedAt: open.updatedAt },
      latest: { id: latest.id, number: latest.number, title: latest.title, status: latest.status },
      blocking,
      excerpt: plain((official ?? open ?? latest).body),
    });
  }
  items.sort((a, b) => (a.official?.title ?? a.latest.title).localeCompare(b.official?.title ?? b.latest.title, 'fr'));
  return {
    counts: {
      published: items.filter((i) => i.official).length,
      toReview: items.filter((i) => i.open?.status === 'to_review').length,
      toValidate: items.filter((i) => i.open?.status === 'to_validate').length,
      conflicts,
    },
    items,
    categories,
    me: await rightsOf(actor),
  };
}

/** La recherche classique : titre, contenu, catégorie — sur la version officielle et celle en chemin. */
export async function kbSearch(q: string): Promise<string[]> {
  const needle = `%${q.trim().toLowerCase()}%`;
  if (needle === '%%') return [];
  const rows = await all<{ entryId: string }>(
    `select distinct v.entry_id as "entryId"
       from kb_versions v join kb_entries e on e.id = v.entry_id
       left join kb_categories c on c.id = e.category_id
      where (v.id = e.official_version_id or v.status = any($2::text[]))
        and (lower(v.title) like $1 or lower(v.body) like $1 or lower(coalesce(c.name, '')) like $1)`,
    [needle, [...KB_OPEN]],
  );
  return rows.map((r) => r.entryId);
}

export async function kbEntry(entryId: string, actor: KbActor): Promise<KbEntryDetail | null> {
  const entry = await one<{ id: string; categoryId: string; officialVersionId: string | null }>(
    'select id, category_id as "categoryId", official_version_id as "officialVersionId" from kb_entries where id = $1',
    [entryId],
  );
  if (!entry) return null;
  const versions = (await all<VersionRow>(`select ${VERSION_COLS} where v.entry_id = $1 order by v.number desc`, [entryId])).map(toVersion);
  const analyses: KbEntryDetail['analyses'] = {};
  const findings: KbEntryDetail['findings'] = {};
  const comments: KbEntryDetail['comments'] = {};
  for (const v of versions) {
    analyses[v.id] = await latestAnalysis(v.id);
    findings[v.id] = await findingsOf(v);
    comments[v.id] = (
      await all<{ id: string; versionId: string; authorId: string | null; authorName: string | null; body: string; createdAt: string }>(
        `select c.id, c.version_id as "versionId", c.author_id as "authorId", r.name as "authorName", c.body, c.created_at::text as "createdAt"
           from kb_comments c left join records r on r.id = c.author_id where c.version_id = $1 order by c.created_at`,
        [v.id],
      )
    ).map((c): KbComment => ({ id: c.id, versionId: c.versionId, author: person(c.authorId, c.authorName), body: c.body, createdAt: c.createdAt }));
  }
  const categories = await listCategories();
  return {
    entryId,
    category: categories.find((c) => c.id === entry.categoryId) ?? null,
    officialVersionId: entry.officialVersionId,
    versions,
    analyses,
    findings,
    comments,
    activity: await activityWhere('where a.entry_id = $1', [entryId]),
    me: await rightsOf(actor),
  };
}

/* ---------------------------------------------------------------- */
/* Écrire                                                            */
/* ---------------------------------------------------------------- */

async function log(entryId: string, versionId: string | null, action: string, actorId: string | null, note = '', meta: object = {}) {
  await all(
    /* L'heure exacte, pas celle du début de la transaction : approuvée puis publiée se lisent dans cet ordre. */
    `insert into kb_activity (id, entry_id, version_id, action, actor_id, note, meta, created_at)
     values ($1, $2, $3, $4, $5, $6, $7::text::jsonb, clock_timestamp())`,
    [newId('kba', 10), entryId, versionId, action, actorId, note.slice(0, 2000), JSON.stringify(meta)],
  );
}

function mustWrite(actor: KbActor) {
  if (!canWrite(actor.role)) throw new HttpError(403, 'Your access to the Knowledge Base is read-only.');
}

async function mustVersion(id: string): Promise<KbVersion> {
  const v = await getVersion(id);
  if (!v) throw new HttpError(404, 'Version not found.');
  return v;
}

async function activeCategory(id: string): Promise<void> {
  const c = await one<{ active: boolean }>('select active from kb_categories where id = $1', [id]);
  if (!c?.active) throw new HttpError(422, 'Pick a category.', { categoryId: 'Pick a category.' });
}

/** Une connaissance nouvelle : sa version 1 attend son analyse. */
export async function createKnowledge(
  input: { categoryId: string; title: string; body: string },
  actor: KbActor,
): Promise<{ entryId: string; versionId: string }> {
  mustWrite(actor);
  await listCategories();
  await activeCategory(input.categoryId);
  const entryId = newId('kbe', 10);
  const versionId = newId('kbv', 10);
  await (await db()).tx(async () => {
    await all('insert into kb_entries (id, category_id, created_by) values ($1, $2, $3)', [entryId, input.categoryId, actor.recordId]);
    await all(
      `insert into kb_versions (id, entry_id, number, title, body, content_hash, status, author_id)
       values ($1, $2, 1, $3, $4, $5, 'analysis_pending', $6)`,
      [versionId, entryId, input.title, input.body, hashOf(input.title, input.body), actor.recordId],
    );
    await log(entryId, versionId, 'created', actor.recordId);
  });
  return { entryId, versionId };
}

/**
 * Proposer une mise à jour d'une connaissance : une nouvelle version, qui refait
 * tout le circuit. L'officielle reste la référence jusqu'à la publication.
 */
export async function proposeUpdate(
  entryId: string,
  input: { title: string; body: string; changeSummary: string },
  actor: KbActor,
): Promise<{ versionId: string }> {
  mustWrite(actor);
  const entry = await one<{ id: string }>('select id from kb_entries where id = $1', [entryId]);
  if (!entry) throw new HttpError(404, 'Knowledge not found.');
  const open = await one<{ id: string }>('select id from kb_versions where entry_id = $1 and status = any($2::text[])', [entryId, [...KB_OPEN]]);
  if (open) throw new HttpError(409, 'A new version is already on its way — work on that one.');
  const versionId = newId('kbv', 10);
  await (await db()).tx(async () => {
    const last = await one<{ n: number }>('select coalesce(max(number), 0)::int as n from kb_versions where entry_id = $1', [entryId]);
    await all(
      `insert into kb_versions (id, entry_id, number, title, body, content_hash, change_summary, status, author_id)
       values ($1, $2, $3, $4, $5, $6, $7, 'analysis_pending', $8)`,
      [versionId, entryId, (last?.n ?? 0) + 1, input.title, input.body, hashOf(input.title, input.body), input.changeSummary, actor.recordId],
    );
    await log(entryId, versionId, 'update_proposed', actor.recordId, input.changeSummary);
  });
  return { versionId };
}

/**
 * Corriger une version en chemin — son auteur, ou un administrateur. Un titre
 * ou un contenu changé annule la review et relance l'analyse : on ne valide
 * jamais que le texte exact qui a été relu.
 */
export async function editVersion(
  id: string,
  input: { title: string; body: string; changeSummary: string; categoryId?: string; revision: number },
  actor: KbActor,
): Promise<{ reanalyse: boolean }> {
  mustWrite(actor);
  const v = await mustVersion(id);
  if (!KB_OPEN.includes(v.status)) throw new HttpError(409, 'This version can no longer change — propose an update instead.');
  if (v.author?.id !== actor.recordId && actor.role !== 'admin') {
    throw new HttpError(403, 'Only its author — or an administrator — corrects a version.');
  }
  if (input.categoryId) await activeCategory(input.categoryId);
  const hash = hashOf(input.title, input.body);
  const changed = hash !== v.contentHash;
  await (await db()).tx(async () => {
    const done = await all<{ id: string }>(
      `update kb_versions set title = $3, body = $4, content_hash = $5, change_summary = $6, revision = revision + 1, updated_at = now(),
              status = case when $7::boolean then 'analysis_pending' else status end,
              reviewed_by = case when $7::boolean then null else reviewed_by end,
              reviewed_at = case when $7::boolean then null else reviewed_at end,
              reviewed_hash = case when $7::boolean then null else reviewed_hash end,
              review_comment = case when $7::boolean then '' else review_comment end
        where id = $1 and revision = $2 returning id`,
      [id, input.revision, input.title, input.body, hash, input.changeSummary, changed],
    );
    if (!done.length) throw new HttpError(409, 'Somebody saved this version in the meantime — reload it to see their changes.');
    if (input.categoryId) await all('update kb_entries set category_id = $2 where id = $1', [v.entryId, input.categoryId]);
    await log(v.entryId, id, changed ? 'edited' : 'details_changed', actor.recordId, input.changeSummary, {
      reviewVoided: changed && Boolean(v.reviewedHash),
    });
  });
  return { reanalyse: changed };
}

/** Relire : un membre autre que l'auteur, sur le texte exact qu'il a sous les yeux. */
export async function reviewVersion(
  id: string,
  input: { action: 'reviewed' | 'changes'; comment: string; contentHash: string },
  actor: KbActor,
): Promise<void> {
  mustWrite(actor);
  const v = await mustVersion(id);
  if (v.status !== 'to_review') throw new HttpError(409, v.status === 'analysis_pending' || v.status === 'analysis_failed'
    ? 'The AI analysis has to succeed before a review.'
    : 'This version is not waiting for a review.');
  if (v.author?.id === actor.recordId) throw new HttpError(403, 'Somebody other than its author reviews it.');
  if (input.contentHash !== v.contentHash) throw new HttpError(409, 'The text changed while you were reading it — reload it.');
  if (input.action === 'changes' && !input.comment) {
    throw new HttpError(422, 'Say what has to change.', { comment: 'Say what has to change.' });
  }
  await (await db()).tx(async () => {
    const done = await all<{ id: string }>(
      input.action === 'reviewed'
        ? `update kb_versions set status = 'to_validate', reviewed_by = $2, reviewed_at = now(), reviewed_hash = $3, review_comment = $4, updated_at = now()
            where id = $1 and status = 'to_review' and content_hash = $3 returning id`
        : `update kb_versions set status = 'changes_requested', review_comment = $4, updated_at = now()
            where id = $1 and status = 'to_review' and content_hash = $3 and $2::text is not null returning id`,
      [id, actor.recordId, input.contentHash, input.comment],
    );
    if (!done.length) throw new HttpError(409, 'This version moved on in the meantime — reload it.');
    if (input.comment) await all('insert into kb_comments (id, version_id, author_id, body) values ($1, $2, $3, $4)', [newId('kbm', 10), id, actor.recordId, input.comment]);
    await log(v.entryId, id, input.action === 'reviewed' ? 'reviewed' : 'review_changes', actor.recordId, input.comment);
  });
}

/** La version retournée à son auteur repart vers la review, telle quelle ou corrigée. */
export async function resubmit(id: string, actor: KbActor): Promise<void> {
  mustWrite(actor);
  const v = await mustVersion(id);
  if (v.status !== 'changes_requested') throw new HttpError(409, 'This version was not sent back.');
  if (v.author?.id !== actor.recordId && actor.role !== 'admin') throw new HttpError(403, 'Only its author sends it back to review.');
  const analysis = await latestAnalysis(id);
  /* Le texte n'a pas changé depuis l'analyse : elle vaut encore. Sinon, une nouvelle. */
  const next = analysis?.status === 'done' && analysis.contentHash === v.contentHash ? 'to_review' : 'analysis_pending';
  await all(`update kb_versions set status = $2, updated_at = now() where id = $1 and status = 'changes_requested'`, [id, next]);
  await log(v.entryId, id, 'resubmitted', actor.recordId);
}

/**
 * Valider : le président seul, sur la version relue exactement. Publier verrouille
 * la connaissance le temps d'échanger son officielle — deux validations
 * concurrentes n'en publient jamais deux.
 */
export async function validateVersion(
  id: string,
  input: { action: 'approve' | 'changes' | 'reject'; note: string; contentHash: string },
  actor: KbActor,
): Promise<void> {
  const rights = await rightsOf(actor);
  if (!rights.isPresident) throw new HttpError(403, 'Only the president of CEED approves, sends back or rejects.');
  const v = await mustVersion(id);
  if (v.status !== 'to_validate') throw new HttpError(409, 'This version is not waiting for validation.');
  if (input.contentHash !== v.contentHash || v.reviewedHash !== v.contentHash) {
    throw new HttpError(409, 'Only the reviewed text can be validated — it changed since the review.');
  }
  if (input.action !== 'approve' && !input.note) throw new HttpError(422, 'Say why.', { note: 'Say why.' });
  if (input.action === 'approve') {
    const blocking = (await findingsOf(v)).filter(kbFindingBlocks);
    if (blocking.length) {
      throw new HttpError(409, `${blocking.length} conflict${blocking.length > 1 ? 's' : ''} or duplicate${blocking.length > 1 ? 's' : ''} still need${blocking.length > 1 ? '' : 's'} a decision before publishing.`);
    }
  }
  await (await db()).tx(async () => {
    await all('select id from kb_entries where id = $1 for update', [v.entryId]);
    const still = await one<{ status: KbStatus; contentHash: string }>(
      'select status, content_hash as "contentHash" from kb_versions where id = $1 for update',
      [id],
    );
    if (still?.status !== 'to_validate' || still.contentHash !== input.contentHash) {
      throw new HttpError(409, 'This version moved on in the meantime — reload it.');
    }
    if (input.action === 'approve') {
      await all(`update kb_versions set status = 'archived', updated_at = now() where entry_id = $1 and status = 'published'`, [v.entryId]);
      await all(
        `update kb_versions set status = 'published', validated_by = $2, validated_at = now(), decision = 'approved', decision_note = $3,
                published_at = now(), updated_at = now() where id = $1`,
        [id, actor.recordId, input.note],
      );
      await all('update kb_entries set official_version_id = $2 where id = $1', [v.entryId, id]);
      await log(v.entryId, id, 'approved', actor.recordId, input.note);
      await log(v.entryId, id, 'published', actor.recordId);
    } else {
      const status = input.action === 'reject' ? 'rejected' : 'changes_requested';
      await all(
        `update kb_versions set status = $2, validated_by = $3, validated_at = now(), decision = $4, decision_note = $5, updated_at = now(),
                reviewed_by = case when $2 = 'changes_requested' then null else reviewed_by end,
                reviewed_at = case when $2 = 'changes_requested' then null else reviewed_at end,
                reviewed_hash = case when $2 = 'changes_requested' then null else reviewed_hash end
          where id = $1`,
        [id, status, actor.recordId, input.action === 'reject' ? 'rejected' : 'changes_requested', input.note],
      );
      await log(v.entryId, id, input.action === 'reject' ? 'rejected' : 'validation_changes', actor.recordId, input.note);
    }
  });
}

export async function commentOn(id: string, body: string, actor: KbActor): Promise<void> {
  mustWrite(actor);
  const v = await mustVersion(id);
  await all('insert into kb_comments (id, version_id, author_id, body) values ($1, $2, $3, $4)', [newId('kbm', 10), id, actor.recordId, body]);
  await log(v.entryId, id, 'comment', actor.recordId, body);
}

/** Un membre signale lui-même un conflit, un doublon ou un point à clarifier. */
export async function flagFinding(
  id: string,
  input: { kind: KbFindingKind; otherEntryId?: string; excerpt: string; explanation: string },
  actor: KbActor,
): Promise<void> {
  mustWrite(actor);
  const v = await mustVersion(id);
  if (!KB_OPEN.includes(v.status)) throw new HttpError(409, 'Only a version on its way takes a flag — propose an update to the published one.');
  let otherVersionId: string | null = null;
  if (input.otherEntryId) {
    const other = await one<{ id: string }>(
      `select coalesce(e.official_version_id, (select id from kb_versions where entry_id = e.id order by number desc limit 1)) as id
         from kb_entries e where e.id = $1`,
      [input.otherEntryId],
    );
    if (!other?.id) throw new HttpError(404, 'The other knowledge was not found.');
    otherVersionId = other.id;
  }
  await all(
    `insert into kb_findings (id, analysis_id, version_id, content_hash, source, kind, confidence, excerpt, explanation, other_version_id)
     values ($1, null, $2, $3, 'member', $4, 0, $5, $6, $7)`,
    [newId('kbf', 10), id, v.contentHash, input.kind, input.excerpt, input.explanation, otherVersionId],
  );
  await log(v.entryId, id, 'flagged', actor.recordId, input.explanation, { kind: input.kind });
}

/** Décider d'un constat — toujours avec une justification, gardée avec les versions qu'il compare. */
export async function decideFinding(
  findingId: string,
  input: { state: 'not_a_conflict' | 'resolved' | 'acknowledged'; justification: string },
  actor: KbActor,
): Promise<void> {
  mustWrite(actor);
  const f = await one<{ versionId: string; contentHash: string; kind: KbFindingKind }>(
    'select version_id as "versionId", content_hash as "contentHash", kind from kb_findings where id = $1',
    [findingId],
  );
  if (!f) throw new HttpError(404, 'Finding not found.');
  const v = await mustVersion(f.versionId);
  if (f.contentHash !== v.contentHash) throw new HttpError(409, 'This finding was about an earlier text — it no longer applies.');
  if (!KB_OPEN.includes(v.status)) throw new HttpError(409, 'This version is no longer on its way.');
  await all(
    `update kb_findings set state = $2, justification = $3, decided_by = $4, decided_at = now() where id = $1`,
    [findingId, input.state, input.justification, actor.recordId],
  );
  await log(v.entryId, v.id, 'finding_decided', actor.recordId, input.justification, { state: input.state, kind: f.kind });
}

/* ---------------------------------------------------------------- */
/* L'analyse                                                         */
/* ---------------------------------------------------------------- */

export interface KbNeighbour {
  versionId: string;
  title: string;
  body: string;
  status: KbStatus;
  category: string;
}

export interface KbRawFinding {
  kind: KbFindingKind;
  confidence: number;
  otherVersionId: string | null;
  excerpt: string;
  otherExcerpt: string;
  explanation: string;
  recommendation: string;
}

export type KbAnalyzer = (input: {
  version: { title: string; body: string; category: string };
  neighbours: KbNeighbour[];
}) => Promise<{ summary: string; findings: KbRawFinding[] }>;

/* Les tests posent le leur : un fournisseur réel ne répond pas dans une suite de tests. */
let analyzerForTests: KbAnalyzer | null = null;
export function useAnalyzerForTests(analyzer: KbAnalyzer | null) {
  analyzerForTests = analyzer;
}

/**
 * Les connaissances les plus proches, publiées ou en chemin — jamais toute la
 * base : une recherche plein texte en français sur les mots du texte, les
 * meilleurs résultats d'abord.
 */
export async function neighboursOf(v: Pick<KbVersion, 'entryId' | 'title' | 'body'>, limit = 5): Promise<KbNeighbour[]> {
  const words = [
    ...new Set(
      `${v.title} ${v.title} ${v.body}`
        .toLowerCase()
        .normalize('NFC')
        .match(/[\p{L}\p{N}]{4,}/gu) ?? [],
    ),
  ].slice(0, 60);
  if (!words.length) return [];
  const query = words.map((w) => w.replace(/'/g, '')).join(' | ');
  return all<KbNeighbour>(
    `select v.id as "versionId", v.title, v.body, v.status, coalesce(c.name, '') as category
       from kb_versions v join kb_entries e on e.id = v.entry_id
       left join kb_categories c on c.id = e.category_id
      where v.entry_id <> $1
        and (v.id = e.official_version_id or v.status in ('to_review', 'to_validate', 'changes_requested'))
        and to_tsvector('french', v.title || ' ' || v.body) @@ to_tsquery('french', $2)
      order by ts_rank(to_tsvector('french', v.title || ' ' || v.body), to_tsquery('french', $2)) desc
      limit $3`,
    [v.entryId, query, limit],
  );
}

const SYSTEM = `Tu es l'analyste de la Knowledge Base interne de CEED Maroc, une organisation qui accompagne des startups.
Tu compares une nouvelle connaissance (ou une nouvelle version) aux connaissances existantes les plus proches, et tu signales :
- "duplicate" : la même information existe déjà, ou presque ;
- "conflict" : deux informations se contredisent réellement ;
- "clarification" : la nouvelle connaissance est ambiguë ou incomplète au point de pouvoir être mal appliquée.

Règles :
- Tiens compte du contexte avant de parler de contradiction : dates, années, programmes ou éditions concernés, exceptions explicites, versions qui se remplacent. Deux règles pour deux programmes différents ne se contredisent pas.
- Une information complémentaire n'est ni un doublon ni un conflit.
- Les extraits sont des citations exactes, courtes, copiées du texte.
- "confidence" est ton estimation de 0 à 100, pas une probabilité.
- N'invente rien ; si rien ne pose problème, rends une liste vide.
- Tu ne réécris pas la connaissance : tu expliques et tu recommandes.
- Écris en français.

Réponds uniquement avec un objet JSON :
{"summary": "une phrase", "findings": [{"kind": "duplicate|conflict|clarification", "confidence": 0-100, "other": "K1… ou null", "excerpt": "...", "otherExcerpt": "...", "explanation": "...", "recommendation": "..."}]}`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n[…]` : s);

async function providerAnalyzer(): Promise<{ analyzer: KbAnalyzer; provider: string; model: string } | null> {
  const { provider, model } = await kbSettings();
  if (!provider) return null;
  const analyzer: KbAnalyzer = async ({ version, neighbours }) => {
    const known = neighbours.map((n, i) => ({ key: `K${i + 1}`, n }));
    const user = [
      `NOUVELLE CONNAISSANCE — catégorie : ${version.category}`,
      `Titre : ${version.title}`,
      clip(version.body, 12_000),
      '',
      known.length ? 'CONNAISSANCES EXISTANTES LES PLUS PROCHES :' : "AUCUNE CONNAISSANCE PROCHE : signale seulement ce qui est ambigu ou incomplet.",
      ...known.map(({ key, n }) => `\n[${key}] (${n.status === 'published' ? 'publiée' : 'en cours de validation'}, ${n.category}) ${n.title}\n${clip(n.body, 4000)}`),
    ].join('\n');
    const raw = (await askJson(provider, model, SYSTEM, user)) as { summary?: unknown; findings?: unknown };
    const list = Array.isArray(raw.findings) ? raw.findings : [];
    return {
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      findings: list.map((f: Record<string, unknown>) => ({
        kind: f.kind as KbFindingKind,
        confidence: Number(f.confidence),
        otherVersionId: known.find((k) => k.key === f.other)?.n.versionId ?? null,
        excerpt: String(f.excerpt ?? ''),
        otherExcerpt: String(f.otherExcerpt ?? ''),
        explanation: String(f.explanation ?? ''),
        recommendation: String(f.recommendation ?? ''),
      })),
    };
  };
  return { analyzer, provider, model };
}

/**
 * Analyser une version. Le résultat ne vaut que pour le texte analysé : s'il a
 * changé entre-temps, l'analyse est gardée pour l'historique mais ne fait pas
 * avancer la version. Une panne laisse « Analysis Failed », jamais « rien à signaler ».
 */
export async function runAnalysis(versionId: string, actorId: string | null = null): Promise<void> {
  const v = await getVersion(versionId);
  if (!v || (v.status !== 'analysis_pending' && v.status !== 'analysis_failed')) return;
  const configured = analyzerForTests ? { analyzer: analyzerForTests, provider: 'test', model: 'test' } : await providerAnalyzer();
  const analysisId = newId('kbn', 10);
  await all(
    `insert into kb_analyses (id, version_id, content_hash, provider, model, status) values ($1, $2, $3, $4, $5, 'pending')`,
    [analysisId, versionId, v.contentHash, configured?.provider ?? '', configured?.model ?? ''],
  );
  await all(`update kb_versions set status = 'analysis_pending' where id = $1 and content_hash = $2 and status = 'analysis_failed'`, [versionId, v.contentHash]);

  const fail = async (message: string) => {
    await all(`update kb_analyses set status = 'failed', error = $2, finished_at = now() where id = $1`, [analysisId, message.slice(0, 2000)]);
    const moved = await all<{ id: string }>(
      `update kb_versions set status = 'analysis_failed' where id = $1 and content_hash = $2 and status = 'analysis_pending' returning id`,
      [versionId, v.contentHash],
    );
    if (moved.length) await log(v.entryId, versionId, 'analysis_failed', actorId, message);
  };
  if (!configured) return fail('No AI provider is set up — an administrator chooses one in Settings → Knowledge Base.');

  try {
    const category = (await one<{ name: string }>(
      'select c.name from kb_entries e join kb_categories c on c.id = e.category_id where e.id = $1',
      [v.entryId],
    ))?.name ?? '';
    const neighbours = await neighboursOf(v);
    const result = await configured.analyzer({ version: { title: v.title, body: v.body, category }, neighbours });
    const allowed = new Set(neighbours.map((n) => n.versionId));
    const findings = result.findings.filter((f) => KB_FINDING_KINDS.includes(f.kind) && (f.explanation || f.excerpt));
    await (await db()).tx(async () => {
      const still = await one<{ status: KbStatus; contentHash: string }>(
        'select status, content_hash as "contentHash" from kb_versions where id = $1 for update',
        [versionId],
      );
      await all(
        `update kb_analyses set status = 'done', result = $2::text::jsonb, finished_at = now() where id = $1`,
        [analysisId, JSON.stringify({ summary: result.summary, neighbours: neighbours.map((n) => n.versionId), findings: findings.length })],
      );
      if (still?.status !== 'analysis_pending' || still.contentHash !== v.contentHash) return;
      for (const f of findings) {
        await all(
          `insert into kb_findings (id, analysis_id, version_id, content_hash, source, kind, confidence, excerpt, other_excerpt,
                                    explanation, recommendation, other_version_id)
           values ($1, $2, $3, $4, 'ai', $5, $6, $7, $8, $9, $10, $11)`,
          [
            newId('kbf', 10), analysisId, versionId, v.contentHash, f.kind,
            Math.max(0, Math.min(100, Math.round(Number.isFinite(f.confidence) ? f.confidence : 0))),
            f.excerpt.slice(0, 2000), f.otherExcerpt.slice(0, 2000), f.explanation.slice(0, 5000), f.recommendation.slice(0, 5000),
            f.otherVersionId && allowed.has(f.otherVersionId) ? f.otherVersionId : null,
          ],
        );
      }
      await all(`update kb_versions set status = 'to_review' where id = $1`, [versionId]);
      const said = findings.length
        ? `${findings.length} point${findings.length > 1 ? 's' : ''} to look at`
        : 'No conflict found';
      await log(v.entryId, versionId, 'analysis_done', actorId, result.summary ? `${said} — ${result.summary}` : said);
    });
  } catch (err) {
    await fail((err as Error).message || 'The analysis failed.');
  }
}

/** Relancer une analyse échouée — ou restée en attente. */
export async function retryAnalysis(id: string, actor: KbActor): Promise<void> {
  mustWrite(actor);
  const v = await mustVersion(id);
  if (v.status !== 'analysis_failed' && v.status !== 'analysis_pending') throw new HttpError(409, 'This version is not waiting for an analysis.');
  await all(`update kb_versions set status = 'analysis_pending' where id = $1`, [id]);
}

/**
 * Ce que la Knowledge Base dit de CEED à propos d'un texte : les connaissances
 * publiées les plus proches — jamais une version en chemin, qui n'est pas une
 * référence officielle.
 */
export async function publishedContext(text: string, limit = 6): Promise<{ entryId: string; title: string; body: string }[]> {
  const words = [...new Set(text.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]{5,}/gu) ?? [])].slice(0, 80);
  const query = words.map((w) => w.replace(/'/g, '')).join(' | ');
  const rows = await all<{ entryId: string; title: string; body: string }>(
    `select e.id as "entryId", v.title, v.body
       from kb_entries e join kb_versions v on v.id = e.official_version_id
      ${query ? `order by ts_rank(to_tsvector('french', v.title || ' ' || v.body), to_tsquery('french', $1)) desc` : 'order by v.published_at desc'}
      limit ${Math.max(1, Math.min(limit, 20))}`,
    query ? [query] : [],
  );
  return rows;
}
