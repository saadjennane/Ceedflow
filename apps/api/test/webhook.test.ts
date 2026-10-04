/**
 * Que seul le fournisseur puisse faire taire une adresse.
 *
 * This endpoint retires an address. Without a verified signature it is a way
 * for anybody who learns the URL to cut one founder out of every letter the
 * programme sends — silently, and in a way nobody would think to look for. So
 * most of what is tested here is refusal.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { db, migrate } from '../src/db/client.js';
import { mailRoutes } from '../src/routes/mail.js';
import { suppressed } from '../src/services/mail.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

const SECRET = `whsec_${Buffer.from('a-secret-only-resend-has').toString('base64')}`;

/** A call signed the way Svix signs, which is what Resend sends. */
function call(body: unknown, over: { secret?: string; id?: string; at?: number } = {}) {
  const raw = JSON.stringify(body);
  const id = over.id ?? 'msg_1';
  const at = String(over.at ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from((over.secret ?? SECRET).replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${at}.${raw}`).digest('base64');
  return {
    payload: raw,
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': at,
      'svix-signature': `v1,${sig}`,
    },
  };
}

describe('what the provider tells us back', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const KEY = process.env.RESEND_WEBHOOK_SECRET;

  before(async () => {
    await app.register(mailRoutes);
    await app.ready();
  });
  after(async () => {
    await app.close();
    if (KEY === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = KEY;
  });
  beforeEach(async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    await (await db()).query('delete from email_suppressions');
    await (await db()).query('delete from outbox');
  });

  const send = (c: ReturnType<typeof call>) =>
    app.inject({ method: 'POST', url: '/api/webhooks/resend', ...c });

  const bounce = (email: string, type = 'Permanent') => ({
    type: 'email.bounced',
    data: { email_id: 'em_1', to: [email], bounce: { type, subType: 'General' } },
  });

  it('retires an address that came back for good', async () => {
    const res = await send(call(bounce('parti@example.test')));
    assert.equal(res.statusCode, 200);
    assert.equal(await suppressed('parti@example.test'), true);
  });

  it('keeps writing to one whose mailbox was merely full', async () => {
    /* A transient bounce is a bad afternoon, not a dead address. Retiring on
       one would quietly drop a founder for the rest of the programme. */
    await send(call(bounce('plein@example.test', 'Transient')));
    assert.equal(await suppressed('plein@example.test'), false);
  });

  it('retires an address whose owner called it spam, whatever it does next', async () => {
    await send(call({ type: 'email.complained', data: { email_id: 'em_2', to: 'fache@example.test' } }));
    assert.equal(await suppressed('fache@example.test'), true);
  });

  it('refuses a call nobody signed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(bounce('cible@example.test')),
    });
    assert.equal(res.statusCode, 401);
    assert.equal(await suppressed('cible@example.test'), false, 'and nothing was retired');
  });

  it('refuses a call signed with the wrong key', async () => {
    const other = `whsec_${Buffer.from('not-the-secret').toString('base64')}`;
    const res = await send(call(bounce('cible@example.test'), { secret: other }));
    assert.equal(res.statusCode, 401);
    assert.equal(await suppressed('cible@example.test'), false);
  });

  it('refuses a body changed after it was signed', async () => {
    const c = call(bounce('innocent@example.test'));
    c.payload = JSON.stringify(bounce('cible@example.test'));
    const res = await send(c);
    assert.equal(res.statusCode, 401);
    assert.equal(await suppressed('cible@example.test'), false);
  });

  it('refuses one captured and replayed later', async () => {
    // A signature is valid forever unless the time it names is checked.
    const res = await send(call(bounce('cible@example.test'), { at: Math.floor(Date.now() / 1000) - 3600 }));
    assert.equal(res.statusCode, 401);
    assert.equal(await suppressed('cible@example.test'), false);
  });

  it('refuses everything while no secret is set, rather than listening openly', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await send(call(bounce('cible@example.test')));
    assert.equal(res.statusCode, 503);
    assert.equal(await suppressed('cible@example.test'), false);
  });

  it('marks the message that bounced, so the history says what became of it', async () => {
    await (await db()).query(
      `insert into outbox (id, kind, to_email, subject, body, state, provider_id)
       values ('msg_x', 'deliverable_request', 'parti@example.test', 's', 'b', 'sent', 'em_1')`,
    );
    await send(call(bounce('parti@example.test')));
    const [row] = await (await db()).query<{ state: string; error: string }>(
      `select state, error from outbox where id = 'msg_x'`,
    );
    assert.equal(row?.state, 'bounced');
    assert.match(row!.error, /Permanent/);
  });

  it('records when a letter actually arrived, which is not when we handed it over', async () => {
    await (await db()).query(
      `insert into outbox (id, kind, to_email, subject, body, state, provider_id)
       values ('msg_d', 'deliverable_request', 'arrive@example.test', 's', 'b', 'sent', 'em_3')`,
    );
    await send(call({ type: 'email.delivered', data: { email_id: 'em_3' } }));
    const [row] = await (await db()).query<{ deliveredAt: string | null }>(
      `select delivered_at::text as "deliveredAt" from outbox where id = 'msg_d'`,
    );
    assert.ok(row?.deliveredAt, 'the hour the receiving server took it');
  });

  it('keeps the first delivery when the provider reports it twice', async () => {
    /* "Arrived at 9:02" becoming "arrived at 14:30" on a retry would make the
       history say something that never happened. */
    await (await db()).query(
      `insert into outbox (id, kind, to_email, subject, body, state, provider_id, delivered_at)
       values ('msg_e', 'x', 'deux@example.test', 's', 'b', 'sent', 'em_4', timestamptz '2026-10-01 09:02:00+00')`,
    );
    await send(call({ type: 'email.delivered', data: { email_id: 'em_4' } }));
    const [row] = await (await db()).query<{ deliveredAt: string }>(
      `select delivered_at::text as "deliveredAt" from outbox where id = 'msg_e'`,
    );
    assert.match(row!.deliveredAt, /09:02/);
  });

  it('acknowledges an event it has no opinion about', async () => {
    // A provider that gains a new event type must not start seeing failures.
    const res = await send(call({ type: 'email.opened', data: { email_id: 'em_9' } }));
    assert.equal(res.statusCode, 200);
  });
});
