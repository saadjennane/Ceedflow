/**
 * What the provider tells us back.
 *
 * Sending is only half of it. An address that has died — a founder who left
 * the company, a typo nobody caught at import — comes back, and writing to it
 * for another three months is how a sending reputation is lost and how a
 * startup is thought to have been told something it never heard.
 *
 * So Resend reports here, and the two facts worth keeping are kept: what
 * became of one message, and which addresses must never be written to again.
 */
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { suppress } from '../services/mail.js';

/**
 * Whether this really came from the provider.
 *
 * Not optional, and not a formality: an endpoint that retires an address on
 * request is, without this, a way for anybody who learns the URL to cut one
 * founder out of every letter the programme sends — silently, and in a way
 * nobody would think to look for.
 *
 * Svix's scheme, which is what Resend uses: HMAC-SHA256 over `id.timestamp.body`,
 * with the secret base64-decoded after its `whsec_` prefix. The signature
 * header may carry several, space separated, each as `v1,<base64>` — a key
 * being rotated has both for a while.
 */
function signed(secret: string, headers: Record<string, unknown>, raw: Buffer): boolean {
  const id = String(headers['svix-id'] ?? headers['webhook-id'] ?? '');
  const at = String(headers['svix-timestamp'] ?? headers['webhook-timestamp'] ?? '');
  const given = String(headers['svix-signature'] ?? headers['webhook-signature'] ?? '');
  if (!id || !at || !given) return false;

  /* A signature stays valid forever unless the time it names is checked, and a
     captured call replayed next month would retire an address all over again. */
  const age = Math.abs(Date.now() / 1000 - Number(at));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const mine = crypto.createHmac('sha256', key).update(`${id}.${at}.${raw.toString('utf8')}`).digest();

  return given.split(' ').some((part) => {
    const value = part.split(',')[1];
    if (!value) return false;
    const theirs = Buffer.from(value, 'base64');
    // Length first: timingSafeEqual throws on a mismatch rather than returning.
    return theirs.length === mine.length && crypto.timingSafeEqual(theirs, mine);
  });
}

interface Event {
  type?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    bounce?: { type?: string; subType?: string };
  };
}

/** The addresses an event is about, however the provider wrote them. */
const addressesOf = (to: Event['data'] extends infer D ? D : never): string[] => {
  const raw = to?.to;
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
};

export async function mailRoutes(app: FastifyInstance) {
  /* The raw body, because the signature is over the bytes that arrived and not
     over what JSON.parse made of them. Declared inside this plugin so no other
     route's parsing changes. */
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err) {
      done(err as Error);
    }
  });

  app.post('/api/webhooks/resend', async (req, reply) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    /* Nothing configured means nothing is listening. Refusing is the only safe
       reading: accepting unsigned calls "until the secret is set" is how an
       endpoint ships open and stays open. */
    if (!secret) return reply.code(503).send({ error: 'No webhook secret is set.' });

    const raw = (req as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    if (!signed(secret, req.headers as Record<string, unknown>, raw)) {
      return reply.code(401).send({ error: 'Signature does not match.' });
    }

    const event = req.body as Event;
    const kind = event.type ?? '';
    const id = event.data?.email_id;
    const conn = await db();

    if (kind === 'email.bounced') {
      if (id) {
        await conn.query(
          `update outbox set state = 'bounced', error = $2, updated_at = now() where provider_id = $1`,
          [id, `${event.data?.bounce?.type ?? 'bounce'} ${event.data?.bounce?.subType ?? ''}`.trim().slice(0, 500)],
        );
      }
      /* Only a bounce that will happen again. A full mailbox or a server
         having a bad afternoon is transient, and retiring an address over one
         would quietly drop a founder for the rest of the programme. */
      const permanent = (event.data?.bounce?.type ?? '').toLowerCase().startsWith('perm');
      if (permanent) {
        for (const email of addressesOf(event.data)) await suppress(email, 'hard bounce');
      }
    } else if (kind === 'email.complained') {
      // Somebody pressed "this is spam". Definitive, whatever the address does.
      for (const email of addressesOf(event.data)) await suppress(email, 'marked as spam');
    } else if (kind === 'email.delivered' && id) {
      /* The first delivery wins. A provider may report the same one twice, and
         "arrived at 9:02" moving to "arrived at 14:30" on a retry would make
         the history say something that never happened. */
      await conn.query(
        `update outbox set delivered_at = now(), updated_at = now()
          where provider_id = $1 and delivered_at is null`,
        [id],
      );
    }

    // Anything else is acknowledged and ignored: a provider that gains a new
    // event type must not start seeing failures from us.
    return { ok: true };
  });
}
