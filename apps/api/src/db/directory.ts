import {
  idOf,
  matchKey,
  type Affiliation,
  type AffiliationView,
  type DirectoryRecord,
  type RecordDetail,
  type RecordKind,
} from '@ceed/shared';
import { db } from './client.js';

const COLS = `id, kind, name, roles, ownership, origin, email, phone, city, country, website, bio,
  tags, invited_at::text as "invitedAt", claimed_at::text as "claimedAt", created_at::text as "createdAt"`;

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
  ownership?: string;
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
  if (filter.ownership) {
    params.push(filter.ownership);
    where.push(`ownership = $${params.length}`);
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
  roles?: string[];
  ownership?: string;
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
  const claimed = input.ownership === 'Claimed';
  await (await db()).query(
    `insert into records (id, kind, name, roles, ownership, origin, email, phone, city, country,
       website, bio, tags, claimed_at)
     values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
    [
      id,
      input.kind,
      input.name.trim(),
      JSON.stringify(input.roles ?? []),
      input.ownership ?? 'Unclaimed',
      input.origin ?? 'manual',
      input.email ?? '',
      input.phone ?? '',
      input.city ?? '',
      input.country ?? '',
      input.website ?? '',
      input.bio ?? '',
      JSON.stringify(input.tags ?? []),
      claimed ? new Date().toISOString() : null,
    ],
  );
  return (await getRecord(id))!;
}

const FIELDS: Record<string, string> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  city: 'city',
  country: 'country',
  website: 'website',
  bio: 'bio',
  ownership: 'ownership',
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
  // The two dated states are stamped rather than typed, so the page can say when.
  if (patch.ownership === 'Invited') sets.push(`invited_at = coalesce(invited_at, now())`);
  if (patch.ownership === 'Claimed') sets.push(`claimed_at = coalesce(claimed_at, now())`);
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
