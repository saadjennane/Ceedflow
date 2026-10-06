/**
 * Trente jours avant que ce soit vrai.
 *
 * Deleting used to be immediate and final, and the cascade made it worse than
 * it looks: removing one founder takes their organisation's page, the
 * application they filed, the files attached to it and the marks a jury gave
 * them. One wrong click, and the repair is reading last week's backup.
 *
 * So nothing leaves any more. A deletion marks its rows, they disappear from
 * every list, and they come back whole until the thirtieth day. What went
 * together carries one batch id and returns in one act — which is the only way
 * a founder comes back as a founder rather than as a name with nothing behind
 * it.
 *
 * Two things never come back, and they are the two the decision put aside: a
 * juror's seat on a sitting, because the sitting is not theirs to take away;
 * and the marks they filed, which stay where they are so a published ranking
 * cannot move because somebody left the directory.
 */
import { db } from '../db/client.js';

/** How long a deletion can be taken back. */
export const KEPT_DAYS = 30;

/** One thing that was deleted, in the words a screen uses. */
export interface BinnedItem {
  what: 'person' | 'organisation' | 'candidacy' | 'programme' | 'edition';
  label: string;
}

/** One deletion: everything that went in a single act. */
export interface Binned {
  batch: string;
  at: string;
  by: string;
  /** Whole days before it is purged, counting down from the deletion. */
  daysLeft: number;
  items: BinnedItem[];
}

interface Row {
  batch: string;
  at: string;
  by: string;
  what: BinnedItem['what'];
  label: string;
}

/* Les quatre tables qui ont une corbeille, lues d'un seul coup. A candidacy is
   named by its organisation, which may itself be in the bin — so the join
   deliberately does not filter on what is live. */
const EVERYTHING = `
  select deleted_batch as batch, deleted_at::text as at, coalesce(deleted_by, '') as by,
         case when kind = 'org' then 'organisation' else 'person' end as what,
         name as label
    from records where deleted_at is not null
  union all
  select c.deleted_batch, c.deleted_at::text, coalesce(c.deleted_by, ''), 'candidacy',
         coalesce(o.name, 'an application')
    from candidates c left join records o on o.id = c.org_id
   where c.deleted_at is not null
  union all
  select deleted_batch, deleted_at::text, coalesce(deleted_by, ''), 'programme', name
    from programs where deleted_at is not null
  union all
  select deleted_batch, deleted_at::text, coalesce(deleted_by, ''), 'edition', name
    from editions where deleted_at is not null`;

/** Everything still in the bin, newest deletion first. */
export async function binned(): Promise<Binned[]> {
  const rows = await (await db()).query<Row>(`${EVERYTHING} order by at desc`);
  const byBatch = new Map<string, Binned>();

  for (const row of rows) {
    /* A row deleted before batches existed has no batch of its own. It is
       still its own deletion, so it gets one rather than being lumped with
       every other orphan under the empty string. */
    const batch = row.batch || `alone:${row.what}:${row.label}:${row.at}`;
    const age = Math.floor((Date.now() - new Date(row.at).getTime()) / 86_400_000);
    const entry = byBatch.get(batch) ?? {
      batch,
      at: row.at,
      by: row.by,
      daysLeft: Math.max(0, KEPT_DAYS - age),
      items: [],
    };
    entry.items.push({ what: row.what, label: row.label });
    byBatch.set(batch, entry);
  }
  return [...byBatch.values()];
}

/**
 * Puts one deletion back, whole.
 *
 * The account comes back with the person: restoring somebody without their way
 * in would be handing back a file rather than a colleague. Only the accounts
 * this deletion put to sleep are woken — one an administrator disabled
 * yesterday, for a reason of their own, carries no batch and stays asleep.
 */
export async function restore(batch: string): Promise<number> {
  const conn = await db();
  let back = 0;
  for (const table of ['records', 'candidates', 'programs', 'editions']) {
    const rows = await conn.query<{ id: string }>(
      `update ${table} set deleted_at = null, deleted_batch = null, deleted_by = null
        where deleted_batch = $1 and deleted_at is not null returning id`,
      [batch],
    );
    back += rows.length;
  }
  await conn.query(
    `update accounts set disabled_at = null, deleted_batch = null
      where deleted_batch = $1`,
    [batch],
  );
  return back;
}

/**
 * Le trentième jour, pour de bon.
 *
 * Order is half the difficulty: a candidacy holds its organisation by a
 * `restrict` key, and an edition holds its programme, so what points goes
 * before what is pointed at.
 *
 * The other half is that the two do not always run out on the same day. An
 * organisation deleted in March and an application to it deleted in April
 * expire three weeks apart, and dropping the page while the application still
 * sits in the bin raises a foreign key — on an hourly sweep, that is an error
 * every hour and a bin that never empties again. So a row waits for whatever
 * still points at it, and goes on the sweep after.
 */
export async function purgeExpired(): Promise<number> {
  const conn = await db();
  const gone = `deleted_at is not null and deleted_at < now() - interval '${KEPT_DAYS} days'`;
  let dropped = 0;

  const drop = async (sql: string) => {
    const rows = await conn.query<{ id: string }>(sql);
    dropped += rows.length;
  };

  await drop(`delete from candidates where ${gone} returning id`);
  await drop(`delete from editions   where ${gone} returning id`);
  // Still named by an application, whenever that one runs out: it waits.
  await drop(`delete from records r where ${gone}
                and not exists (select 1 from candidates c where c.org_id = r.id or c.person_id = r.id)
              returning r.id`);
  await drop(`delete from programs p where ${gone}
                and not exists (select 1 from editions e where e.program_id = p.id)
              returning p.id`);
  return dropped;
}
