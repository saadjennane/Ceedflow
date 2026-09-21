import {
  idOf,
  matchKey,
  type Affiliation,
  type AffiliationView,
  type DirectoryRecord,
  type OrgAccess,
  type PersonRef,
  type RecordDetail,
  type RecordKind,
  type RemovalPlan,
  type TeamMember,
} from '@ceed/shared';
import { accountOfRecord, accountStatesByRecord } from '../services/auth.js';
import { db } from './client.js';

const COLS = `id, kind, name, first_name as "firstName", last_name as "lastName", roles, origin,
  email, phone, city, country, website, bio, tags, created_at::text as "createdAt"`;

const AFF_COLS = `id, person_id as "personId", org_id as "orgId", role, access, since`;

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
    params.push([filter.role]);
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

/**
 * Matches on the email, which is the one thing that tells two people apart when
 * they share a name — five different founders called Ali came through the import
 * on exactly that distinction.
 */
export async function findByEmail(kind: RecordKind, email: string): Promise<DirectoryRecord | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  return one<DirectoryRecord>(`select ${COLS} from records where kind = $1 and lower(email) = $2`, [kind, wanted]);
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
      input.roles ?? [],
      input.origin ?? 'manual',
      input.email ?? '',
      input.phone ?? '',
      input.city ?? '',
      input.country ?? '',
      input.website ?? '',
      input.bio ?? '',
      input.tags ?? [],
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
    params.push(patch[key]);
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
  access?: OrgAccess;
  since?: string;
}): Promise<Affiliation> {
  const id = idOf.affiliation();
  await (await db()).query(
    `insert into affiliations (id, person_id, org_id, role, access, since) values ($1,$2,$3,$4,$5,$6)
     on conflict (person_id, org_id) do update
       set role = excluded.role, access = excluded.access, since = excluded.since`,
    [id, input.personId, input.orgId, input.role ?? '', input.access ?? 'member', input.since ?? ''],
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

/* ------------------------------------------------------------------ */
/* A team, seen from its organisation                                  */
/* ------------------------------------------------------------------ */

/** What this person may do on that page, or null when they are a stranger to it. */
export async function accessOf(personId: string, orgId: string): Promise<OrgAccess | null> {
  const row = await one<{ access: OrgAccess }>(
    'select access from affiliations where person_id = $1 and org_id = $2',
    [personId, orgId],
  );
  return row?.access ?? null;
}

export const affiliationById = (id: string) =>
  one<Affiliation>(`select ${AFF_COLS} from affiliations where id = $1`, [id]);

export async function setAffiliation(
  id: string,
  patch: { role?: string; access?: OrgAccess },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of [
    ['role', 'role'],
    ['access', 'access'],
  ] as const) {
    if (patch[key] === undefined) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length) await (await db()).query(`update affiliations set ${sets.join(', ')} where id = $1`, params);
}

/** How many people still hold the page. An organisation is never left with none. */
export async function adminCountOf(orgId: string): Promise<number> {
  const row = await one<{ n: number }>(
    `select count(*)::int as n from affiliations where org_id = $1 and access = 'admin'`,
    [orgId],
  );
  return Number(row?.n ?? 0);
}

/** The team as its administrator sees it: titles, rights, and who has a way in. */
export async function teamOf(orgId: string): Promise<TeamMember[]> {
  const rows = await all<Affiliation>(`select ${AFF_COLS} from affiliations where org_id = $1`, [orgId]);
  if (!rows.length) return [];
  const people = await all<DirectoryRecord>(`select ${COLS} from records where id = any($1::text[])`, [
    rows.map((r) => r.personId),
  ]);
  const accounts = await accountStatesByRecord();

  const team: TeamMember[] = [];
  for (const affiliation of rows) {
    const person = people.find((p) => p.id === affiliation.personId);
    if (!person) continue;
    team.push({
      affiliationId: affiliation.id,
      person,
      role: affiliation.role,
      access: affiliation.access,
      account: accounts.get(person.id) ?? null,
    });
  }
  // Whoever holds the page first, then the rest by name — the order a founder
  // reads their own team in.
  const rank: Record<OrgAccess, number> = { admin: 0, editor: 1, member: 2 };
  return team.sort((a, b) => rank[a.access] - rank[b.access] || a.person.name.localeCompare(b.person.name));
}

/** The organisations a person belongs to, by id alone — for the rules that only
 *  need to know whether somebody is on the inside of one. */
export async function orgIdsOf(personId: string): Promise<Set<string>> {
  const rows = await all<{ orgId: string }>(
    'select org_id as "orgId" from affiliations where person_id = $1',
    [personId],
  );
  return new Set(rows.map((r) => r.orgId));
}

/** Whole records for a set of ids, for screens that need more than a name. */
export async function recordsByIds(ids: string[]): Promise<DirectoryRecord[]> {
  if (!ids.length) return [];
  return all<DirectoryRecord>(`select ${COLS} from records where id = any($1::text[])`, [ids]);
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

/* ------------------------------------------------------------------ */
/* Taking somebody out                                                 */
/* ------------------------------------------------------------------ */

/**
 * What removing this record will take with it. Read first, acted on second, so
 * the confirmation can name the consequences rather than warn in general.
 *
 * The two shapes it takes: a founder leaves with the application they filed and
 * with any page nobody else holds; a juror is only lifted off the sittings they
 * sat on, and the marks they already gave stay — a published ranking must not
 * move because somebody left the directory.
 */
export async function removalPlan(id: string): Promise<RemovalPlan | null> {
  const record = await getRecord(id);
  if (!record) return null;

  const account = await accountOfRecord(id);
  const blocked: string[] = [];

  // Nobody deletes the last way into the workspace. The account would go with
  // the record, and no route exists to put an administrator back from outside.
  if (account) {
    const admins = await all<{ n: number; id: string }>(
      `select count(*) over ()::int as n, id from accounts where staff_role = 'admin'`,
    );
    if (admins.length === 1 && admins[0].id === account.id) {
      blocked.push('They are the only CEED administrator — name another one first.');
    }
  }

  const candidacies = await all<{ id: string; orgName: string }>(
    `select c.id, coalesce(r.name, '') as "orgName"
       from candidates c left join records r on r.id = c.org_id
      where c.person_id = $1 order by r.name`,
    [id],
  );

  // A page somebody else also holds is not this person's to take away.
  const organisations =
    record.kind === 'person'
      ? await all<{ id: string; name: string }>(
          `select r.id, r.name from records r
             join affiliations a on a.org_id = r.id
            where a.person_id = $1
              and (select count(*) from affiliations b where b.org_id = r.id) = 1
            order by r.name`,
          [id],
        )
      : [];

  const panels = await all<{ id: string; name: string }>(
    `select id, name from committee_sessions where jury @> $1::jsonb order by name`,
    [[id]],
  );

  const evaluations = await all<{ id: string; name: string }>(
    `select id, name from blocks where config -> 'evaluators' @> $1::jsonb order by name`,
    [[id]],
  );

  const scores = await all<{ n: number }>(
    `select count(*)::int as n from evaluation_scores where evaluator_id = $1`,
    [id],
  );

  return {
    name: record.name,
    kind: record.kind,
    account: account ? { email: account.email, state: account.state } : null,
    candidacies,
    organisations,
    panels,
    evaluations,
    scoresKept: Number(scores[0]?.n ?? 0),
    blocked,
  };
}

/**
 * Carries the plan out. Order matters: a candidacy holds its organisation by a
 * `restrict` foreign key, so the applications go before the pages they point at,
 * and the record goes last because the account hangs off it.
 */
export async function removeRecord(id: string, plan: RemovalPlan): Promise<void> {
  const client = await db();

  for (const candidacy of plan.candidacies) {
    await client.query('delete from candidates where id = $1', [candidacy.id]);
  }

  for (const org of plan.organisations) {
    // A page can carry applications somebody else filed; they go with the page.
    await client.query('delete from candidates where org_id = $1', [org.id]);
    await client.query('delete from records where id = $1', [org.id]);
  }

  // Lifted off the sittings, which stay. The marks already filed stay too —
  // `evaluator_name` is stored beside them for exactly this moment.
  await client.query(
    `update committee_sessions set jury = jury - $2 where jury @> $1::jsonb`,
    [[id], id],
  );
  await client.query(
    `update blocks
        set config = jsonb_set(config, '{evaluators}', (config -> 'evaluators') - $2)
      where config -> 'evaluators' @> $1::jsonb`,
    [[id], id],
  );

  await client.query('delete from records where id = $1', [id]);
}

/** Where a person is used, so deleting them cannot punch a hole in a ranking. */
export async function usesOf(id: string): Promise<string[]> {
  const uses: string[] = [];
  const sittings = await all<{ name: string }>(
    `select name from committee_sessions where jury @> $1::jsonb order by name`,
    [[id]],
  );
  for (const s of sittings) uses.push(`sits on ${s.name}`);

  const blocks = await all<{ name: string }>(
    `select name from blocks where config -> 'evaluators' @> $1::jsonb order by name`,
    [[id]],
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
  return {
    record,
    links: await linksOf(record),
    // An account belongs to a person. An organisation is reached through its people.
    account: record.kind === 'person' ? await accountOfRecord(id) : null,
  };
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
