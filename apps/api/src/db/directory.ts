import {
  idOf,
  matchKey,
  type Affiliation,
  type AffiliationView,
  type DirectoryRecord,
  type PersonRef,
  type RecordDetail,
  type RecordKind,
} from '@ceed/shared';
import { db } from './client.js';

const COLS = `id, kind, name, first_name as "firstName", last_name as "lastName", roles, origin,
  email, phone, city, country, website, bio, tags, created_at::text as "createdAt"`;

const AFF_COLS = `id, person_id as "personId", org_id as "orgId", role, since`;

async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db()).query<T>(sql, params);
}
async function one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await all<T>(sql, params))[0] ?? null;
}

export interface RecordFilter {
  kind?: RecordKind;
  role?: string;
  q?: string;
}

export async function listRecords(filter: RecordFilter = {}): Promise<DirectoryRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) {
    params.push(filter.kind);
    where.push(`kind = $${params.length}`);
  }
  if (filter.role) {
    params.push(JSON.stringify([filter.role]));
    where.push(`roles @> $${params.length}::jsonb`);
  }
  if (filter.q?.trim()) {
    params.push(`%${filter.q.trim().toLowerCase()}%`);
    where.push(`(lower(name) like $${params.length} or lower(email) like $${params.length}
      or lower(city) like $${params.length} or lower(tags::text) like $${params.length})`);
  }
  return all<DirectoryRecord>(
    `select ${COLS} from records ${where.length ? 'where ' + where.join(' and ') : ''} order by name`,
    params,
  );
}

export const getRecord = (id: string) => one<DirectoryRecord>(`select ${COLS} from records where id = $1`, [id]);

/** Matches on the name once punctuation and accents are set aside. */
export async function findByName(kind: RecordKind, name: string): Promise<DirectoryRecord | null> {
  const rows = await all<DirectoryRecord>(`select ${COLS} from records where kind = $1`, [kind]);
  const key = matchKey(name);
  return rows.find((r) => matchKey(r.name) === key) ?? null;
}

export async function createRecord(input: {
  kind: RecordKind;
  name: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
  origin?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  website?: string;
  bio?: string;
  tags?: string[];
}): Promise<DirectoryRecord> {
  const id = idOf.record();
  await (await db()).query(
    `insert into records (id, kind, name, first_name, last_name, roles, origin, email, phone, city,
       country, website, bio, tags)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
    [
      id,
      input.kind,
      input.name.trim(),
      input.firstName ?? '',
      input.lastName ?? '',
      JSON.stringify(input.roles ?? []),
      input.origin ?? 'manual',
      input.email ?? '',
      input.phone ?? '',
      input.city ?? '',
      input.country ?? '',
      input.website ?? '',
      input.bio ?? '',
      JSON.stringify(input.tags ?? []),
    ],
  );
  return (await getRecord(id))!;
}

const FIELDS: Record<string, string> = {
  name: 'name',
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
  city: 'city',
  country: 'country',
  website: 'website',
  bio: 'bio',
};

export async function updateRecord(id: string, patch: Record<string, unknown>): Promise<DirectoryRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(FIELDS)) {
    if (patch[key] === undefined) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  for (const key of ['roles', 'tags'] as const) {
    if (patch[key] === undefined) continue;
    params.push(JSON.stringify(patch[key]));
    sets.push(`${key} = $${params.length}::jsonb`);
  }
  if (sets.length) await (await db()).query(`update records set ${sets.join(', ')} where id = $1`, params);
  return getRecord(id);
}

export async function deleteRecord(id: string): Promise<void> {
  await (await db()).query('delete from records where id = $1', [id]);
}

/* ------------------------------------------------------------------ */
/* Affiliations                                                        */
/* ------------------------------------------------------------------ */

export async function linkRecords(input: {
  personId: string;
  orgId: string;
  role?: string;
  since?: string;
}): Promise<Affiliation> {
  const id = idOf.affiliation();
  await (await db()).query(
    `insert into affiliations (id, person_id, org_id, role, since) values ($1,$2,$3,$4,$5)
     on conflict (person_id, org_id) do update set role = excluded.role, since = excluded.since`,
    [id, input.personId, input.orgId, input.role ?? '', input.since ?? ''],
  );
  return (await one<Affiliation>(
    `select ${AFF_COLS} from affiliations where person_id = $1 and org_id = $2`,
    [input.personId, input.orgId],
  ))!;
}

export async function unlinkRecords(id: string): Promise<void> {
  await (await db()).query('delete from affiliations where id = $1', [id]);
}

/** The other side of every affiliation this record has. */
export async function linksOf(record: DirectoryRecord): Promise<AffiliationView[]> {
  const mine = record.kind === 'person' ? 'person_id' : 'org_id';
  const other = record.kind === 'person' ? 'org_id' : 'person_id';
  const rows = await all<Affiliation & { otherId: string }>(
    `select ${AFF_COLS}, ${other} as "otherId" from affiliations where ${mine} = $1`,
    [record.id],
  );
  if (!rows.length) return [];
  const others = await all<DirectoryRecord>(`select ${COLS} from records where id = any($1::text[])`, [
    rows.map((r) => r.otherId),
  ]);

  const views: AffiliationView[] = [];
  for (const { otherId, ...affiliation } of rows) {
    const found = others.find((o) => o.id === otherId);
    if (found) views.push({ affiliation, record: found });
  }
  return views.sort((a, b) => a.record.name.localeCompare(b.record.name));
}

/** Resolves ids to what a screen needs to show, in the order they were given. */
export async function peopleByIds(ids: string[]): Promise<PersonRef[]> {
  if (!ids.length) return [];
  const rows = await all<PersonRef>(`select id, name from records where id = any($1::text[])`, [ids]);
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is PersonRef => Boolean(r));
}

/**
 * Scoring is what makes somebody a jury member, so the role fills itself in
 * rather than having to be set before a committee can be composed.
 */
export async function markAsJury(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await (await db()).query(
    `update records set roles = roles || '["Jury"]'::jsonb
      where id = any($1::text[]) and kind = 'person' and not roles @> '["Jury"]'::jsonb`,
    [ids],
  );
}

/** Where a person is used, so deleting them cannot punch a hole in a ranking. */
export async function usesOf(id: string): Promise<string[]> {
  const uses: string[] = [];
  const sittings = await all<{ name: string }>(
    `select name from committee_sessions where jury @> $1::jsonb order by name`,
    [JSON.stringify([id])],
  );
  for (const s of sittings) uses.push(`sits on ${s.name}`);

  const blocks = await all<{ name: string }>(
    `select name from blocks where config -> 'evaluators' @> $1::jsonb order by name`,
    [JSON.stringify([id])],
  );
  for (const b of blocks) uses.push(`evaluates on ${b.name}`);

  const scores = await all<{ n: number }>(
    `select count(*)::int as n from evaluation_scores where evaluator_id = $1`,
    [id],
  );
  if (scores[0]?.n) uses.push(`${scores[0].n} score${scores[0].n === 1 ? '' : 's'} given`);
  return uses;
}

export async function recordDetail(id: string): Promise<RecordDetail | null> {
  const record = await getRecord(id);
  if (!record) return null;
  return { record, links: await linksOf(record) };
}

/**
 * How many affiliations each record has, from either side: people holding an
 * organisation, organisations a person belongs to. One query rather than one
 * per row.
 */
export async function linkCounts(): Promise<Map<string, number>> {
  const rows = await all<{ id: string; n: number }>(
    `select org_id as id, count(*)::int as n from affiliations group by org_id
     union all
     select person_id as id, count(*)::int as n from affiliations group by person_id`,
  );
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}
