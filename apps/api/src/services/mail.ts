/**
 * Everything the platform means to say, and whether it got out.
 *
 * Two rules hold this together, and both exist because the database behind it
 * holds four hundred real addresses.
 *
 * The row is written before anything is attempted, so "was the invitation
 * sent" has an answer in the database rather than in a provider's dashboard
 * three weeks later. And nothing leaves outside production: the row is written
 * and marked held, so the whole chain can be exercised without one founder
 * hearing about it. Switching that off is one environment variable, set in one
 * place, on purpose.
 */
import { newId } from '@ceed/shared';
import { db } from '../db/client.js';

export type OutboxState = 'queued' | 'held' | 'sent' | 'failed' | 'bounced';

export interface Letter {
  kind: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;
  recordId?: string | null;
  blockId?: string | null;
  candidateId?: string | null;
  /**
   * Not before this instant. Used to spread a large send over days: a new
   * sending domain has no reputation, and four hundred letters on its first
   * morning is how it is classed as spam — after which every other letter the
   * programme sends goes to the same place.
   */
  sendAfter?: Date | null;
}

export interface OutboxRow extends Letter {
  id: string;
  state: OutboxState;
  error: string;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  /** When the receiving server took it — not when we handed it over. */
  deliveredAt: string | null;
}

/**
 * Whether anything actually leaves.
 *
 * Production and a key, both. Either alone is a way to find out by accident:
 * a key in a developer's shell, or a production deploy that forgot one and
 * silently dropped a week of password resets.
 */
export const sendingIsLive = () => process.env.NODE_ENV === 'production' && Boolean(process.env.RESEND_API_KEY);

/** Where a message says it comes from, and where a reply lands. */
const from = () => process.env.MAIL_FROM ?? 'CEED <no-reply@mail.ceedflow.com>';
const replyTo = () => process.env.MAIL_REPLY_TO ?? '';

/** An address that came back for good is never written to again. */
export async function suppressed(email: string): Promise<boolean> {
  const rows = await (await db()).query<{ email: string }>(
    'select email from email_suppressions where email = $1',
    [email.trim().toLowerCase()],
  );
  return rows.length > 0;
}

/** Which of these came back for good — one question, not fifty-four. */
export async function suppressedAmong(emails: string[]): Promise<Set<string>> {
  const wanted = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!wanted.length) return new Set();
  const rows = await (await db()).query<{ email: string }>(
    'select email from email_suppressions where email = any($1::text[])',
    [wanted],
  );
  return new Set(rows.map((r) => r.email));
}

export async function suppress(email: string, reason: string): Promise<void> {
  await (await db()).query(
    `insert into email_suppressions (email, reason) values ($1, $2)
     on conflict (email) do update set reason = excluded.reason`,
    [email.trim().toLowerCase(), reason],
  );
}

/**
 * Puts a message in the queue. Never throws: a password that could not be
 * posted is still a password that was reset, and a failure to queue must not
 * undo the act that asked for it.
 */
export async function post(letter: Letter): Promise<string | null> {
  const to = letter.to.trim().toLowerCase();
  if (!to) return null;
  try {
    const held = (await suppressed(to)) || !sendingIsLive();
    const id = newId('msg');
    await (await db()).query(
      `insert into outbox (id, kind, to_email, to_name, subject, body, record_id, block_id, candidate_id, state, send_after)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        letter.kind,
        to,
        letter.toName ?? '',
        letter.subject,
        letter.body,
        letter.recordId ?? null,
        letter.blockId ?? null,
        letter.candidateId ?? null,
        held ? 'held' : 'queued',
        letter.sendAfter ?? null,
      ],
    );
    return id;
  } catch {
    // Deliberately quiet. The caller is in the middle of an act the person
    // asked for; the post is a consequence of it, not the point of it.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

interface Sent {
  id?: string;
  message?: string;
  name?: string;
}

/**
 * Hands one message to the provider.
 *
 * Resend over plain HTTP rather than through its package: one call, and a
 * dependency that ships in the image for one POST is a dependency to keep
 * up to date for one POST.
 */
async function handOver(row: OutboxRow): Promise<{ ok: true; id: string } | { ok: false; why: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: from(),
      to: [row.toName ? `${row.toName} <${row.to}>` : row.to],
      subject: row.subject,
      text: row.body,
      ...(replyTo() ? { reply_to: replyTo() } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Sent;
  if (!res.ok) return { ok: false, why: body.message ?? `HTTP ${res.status}` };
  if (!body.id) return { ok: false, why: 'The provider accepted it without an id.' };
  return { ok: true, id: body.id };
}

/** How many times a message is offered before it is left alone. */
const GIVE_UP_AFTER = 4;

/**
 * Sends what is waiting, oldest first.
 *
 * Returns what it did rather than logging it, so whoever called — a timer, a
 * screen, a test — can say so in its own words.
 */
export async function flush(limit = 25): Promise<{ sent: number; failed: number }> {
  if (!sendingIsLive()) return { sent: 0, failed: 0 };
  const conn = await db();
  const rows = await conn.query<OutboxRow & { to: string }>(
    `select id, kind, to_email as "to", to_name as "toName", subject, body,
            state, error, attempts, created_at::text as "createdAt", sent_at::text as "sentAt"
       from outbox
      where state = 'queued' and (send_after is null or send_after <= now())
      order by send_after nulls first, created_at limit $1`,
    [limit],
  );

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const out = await handOver(row);
    if (out.ok) {
      sent++;
      await conn.query(
        `update outbox set state = 'sent', provider_id = $2, sent_at = now(),
                           attempts = attempts + 1, updated_at = now() where id = $1`,
        [row.id, out.id],
      );
    } else {
      failed++;
      // Kept in the queue until it has been offered a few times: a provider
      // having a bad minute is not a message that should never go.
      const done = row.attempts + 1 >= GIVE_UP_AFTER;
      await conn.query(
        `update outbox set state = $3, error = $2, attempts = attempts + 1, updated_at = now() where id = $1`,
        [row.id, out.why.slice(0, 500), done ? 'failed' : 'queued'],
      );
    }
  }
  return { sent, failed };
}

/** What went out, or did not, about one person — for the screen that asks. */
export async function letters(
  where: { email?: string; candidateId?: string; blockId?: string },
  limit = 50,
): Promise<OutboxRow[]> {
  const conn = await db();
  const select = `select id, kind, to_email as "to", to_name as "toName", subject, body,
                         state, error, attempts, created_at::text as "createdAt", sent_at::text as "sentAt",
                         delivered_at::text as "deliveredAt"
                    from outbox`;
  if (where.candidateId) {
    // Narrowed to one block when asked: a startup's history on this list is
    // what the row is about, not everything the platform ever wrote to it.
    return where.blockId
      ? conn.query<OutboxRow>(
          `${select} where candidate_id = $1 and block_id = $2 order by created_at desc limit $3`,
          [where.candidateId, where.blockId, limit],
        )
      : conn.query<OutboxRow>(`${select} where candidate_id = $1 order by created_at desc limit $2`, [
          where.candidateId,
          limit,
        ]);
  }
  return conn.query<OutboxRow>(`${select} where to_email = $1 order by created_at desc limit $2`, [
    (where.email ?? '').trim().toLowerCase(),
    limit,
  ]);
}
