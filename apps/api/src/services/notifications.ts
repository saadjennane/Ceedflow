/**
 * Le centre de notifications : ce qui attend une personne, à elle seule.
 *
 * Two ways in. Every letter the platform posts to somebody who can sign in
 * leaves a notification too — the same event, in the app rather than only in
 * a mailbox. And the events that have no letter — a startup finishing what
 * was asked of it, a centre answering an offer, a task waiting on somebody —
 * notify directly. Never throws: a notification is a consequence of an act,
 * not the act.
 */
import { newId } from '@ceed/shared';
import { all, one } from '../db/client.js';
import { currentCenter } from './centers.js';

export interface Notification {
  id: string;
  centerId: string | null;
  centerName: string | null;
  kind: string;
  title: string;
  body: string;
  href: string;
  actorName: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotifyInput {
  /** Les fiches qui la reçoivent — une ligne chacune. */
  recordIds: string[];
  kind: string;
  title: string;
  body?: string;
  href?: string;
  actorName?: string;
  /** Le centre où c'est arrivé ; sans : celui où l'on travaille. Null : aucun. */
  centerId?: string | null;
  /** Une seule fois par personne pour cette clé. */
  dedupeKey?: string;
  /** Qui l'a déclenchée ne se notifie pas lui-même. */
  except?: string | null;
}

export async function notify(input: NotifyInput): Promise<number> {
  try {
    const center = input.centerId === undefined ? currentCenter() : input.centerId;
    let made = 0;
    for (const recordId of new Set(input.recordIds.filter(Boolean))) {
      if (recordId === input.except) continue;
      const rows = await all<{ id: string }>(
        `insert into notifications (id, record_id, center_id, kind, title, body, href, actor_name, dedupe_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (record_id, dedupe_key) where dedupe_key is not null do nothing returning id`,
        [newId('ntf'), recordId, center, input.kind, input.title.slice(0, 300), (input.body ?? '').slice(0, 1000), input.href ?? '', input.actorName ?? '', input.dedupeKey ?? null],
      );
      made += rows.length;
    }
    return made;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* From a letter                                                        */
/* ------------------------------------------------------------------ */

/** Ce qui ne devient pas une notification : l'accès au compte, et les essais. */
const SILENT = new Set(['password_reset', 'account_invite', 'account_known', 'team_invite', 'test_access']);

/**
 * Une lettre à quelqu'un qui peut se connecter laisse la même chose dans
 * l'application. Le destinataire est le compte qui porte l'adresse — celui
 * qui lira — et non la fiche dont la lettre parle.
 */
export async function notifyFromLetter(letter: { kind: string; to: string; subject: string; centerId: string | null }): Promise<void> {
  if (SILENT.has(letter.kind) || letter.kind.endsWith('_test')) return;
  try {
    const reader = await one<{ recordId: string; staff: boolean }>(
      `select a.record_id as "recordId",
              (a.global_role = 'admin' or exists (select 1 from center_staff cs where cs.account_id = a.id)) as staff
         from accounts a where lower(a.email) = $1 and a.disabled_at is null`,
      [letter.to.trim().toLowerCase()],
    );
    if (!reader) return;
    const tasks = letter.kind.startsWith('task');
    await notify({
      recordIds: [reader.recordId],
      kind: letter.kind,
      title: letter.subject,
      href: tasks && reader.staff ? '/tasks' : tasks ? '/me?tab=Tasks' : reader.staff ? '' : '/me',
      centerId: letter.centerId,
    });
  } catch {
    /* une notification ne fait jamais échouer une lettre */
  }
}

/* ------------------------------------------------------------------ */
/* The inbox                                                            */
/* ------------------------------------------------------------------ */

export function inbox(recordId: string, filter: { unread?: boolean; center?: string | null; limit?: number }): Promise<Notification[]> {
  const where = ['n.record_id = $1'];
  const params: unknown[] = [recordId];
  if (filter.unread) where.push('n.read_at is null');
  if (filter.center) {
    params.push(filter.center);
    where.push(`(n.center_id = $${params.length} or n.center_id is null)`);
  }
  params.push(Math.min(filter.limit ?? 100, 300));
  return all<Notification>(
    `select n.id, n.center_id as "centerId", c.name as "centerName", n.kind, n.title, n.body, n.href,
            n.actor_name as "actorName", n.created_at::text as "createdAt", n.read_at::text as "readAt"
       from notifications n left join centers c on c.id = n.center_id
      where ${where.join(' and ')}
      order by n.created_at desc limit $${params.length}`,
    params,
  );
}

export async function unreadCount(recordId: string): Promise<number> {
  const row = await one<{ n: number }>('select count(*)::int as n from notifications where record_id = $1 and read_at is null', [recordId]);
  return row?.n ?? 0;
}

/** Lues : celles-ci, ou toutes. Seulement les siennes. */
export async function markRead(recordId: string, ids: string[] | 'all'): Promise<void> {
  if (ids === 'all') {
    await all('update notifications set read_at = now() where record_id = $1 and read_at is null', [recordId]);
  } else if (ids.length) {
    await all('update notifications set read_at = now() where record_id = $1 and id = any($2::text[]) and read_at is null', [recordId, ids]);
  }
}

/* ------------------------------------------------------------------ */
/* Who to tell                                                          */
/* ------------------------------------------------------------------ */

/** L'équipe d'un centre qui peut agir : ses administrateurs et éditeurs. */
export async function teamOfCenter(centerId: string, roles: string[] = ['admin', 'editor']): Promise<string[]> {
  const rows = await all<{ id: string }>(
    `select a.record_id as id from center_staff cs join accounts a on a.id = cs.account_id
      where cs.center_id = $1 and cs.role = any($2::text[]) and a.disabled_at is null`,
    [centerId, roles],
  );
  return rows.map((r) => r.id);
}
