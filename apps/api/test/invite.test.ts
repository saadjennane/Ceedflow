/**
 * Qu'une invitation soit une porte, pas une annonce.
 *
 * It used to record that somebody had been invited and send nothing. The
 * person then had an account they had never heard of, and CEED had a screen
 * saying "invited" that was not true of anything the person could see.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { db, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { directoryRoutes } from '../src/routes/directory.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole, verifyPassword, findAccount } from '../src/services/auth.js';
import { letters } from '../src/services/mail.js';
// Renamed: this file already has a local `invite` that goes through the route.
import { invite as inviteDirect, inviteMany } from '../src/services/invitations.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('inviting somebody into an account', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  let session = '';

  before(async () => {
    await app.register(cookie);
    await app.register(directoryRoutes);
    await app.ready();

    const me = await dir.createRecord({ kind: 'person', name: 'CEED Staff', email: 'staff@example.test', origin: 'manual' });
    const account = await createAccount({ email: 'staff@example.test', password: 'chosen-by-them', recordId: me.id });
    await setStaffRole(account.id, 'admin');
    session = (await createSession(account.id)).token;
  });
  after(() => app.close());
  beforeEach(async () => {
    await (await db()).query('delete from outbox');
  });

  /** A founder with an account nobody has claimed. */
  const somebody = async (name: string) => {
    const email = `${name}.${Date.now()}@example.test`;
    const record = await dir.createRecord({ kind: 'person', name, email, origin: 'manual' });
    await createAccount({ email, password: 'given-by-ceed', recordId: record.id, mustChangePassword: true });
    return { record, email };
  };

  const invite = (recordId: string) =>
    app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/account/invite`,
      cookies: { [SESSION_COOKIE]: session },
    });

  it('writes to them, with a password that works', async () => {
    const { record, email } = await somebody('Karim');
    const res = await invite(record.id);
    assert.equal(res.statusCode, 200);

    const { password } = res.json() as { password: string };
    const account = await findAccount(email);
    assert.equal(await verifyPassword(password, account!.passwordHash), true, 'the one sent is the one that opens it');

    const [letter] = await letters({ email });
    assert.equal(letter?.kind, 'account_invite');
    assert.match(letter!.body, new RegExp(password), 'and it is in the letter, not only on the screen');
    assert.match(letter!.body, /Karim/);
  });

  it('records the invitation as well as sending it', async () => {
    const { record } = await somebody('Nawal');
    await invite(record.id);
    const after = (await app.inject({
      method: 'GET', url: `/api/records/${record.id}`, cookies: { [SESSION_COOKIE]: session },
    })).json() as { account?: { state: string } };
    assert.equal(after.account?.state, 'invited');
  });

  it('sent again, it is the new password that works and not the old', async () => {
    /* Inviting twice is somebody saying the first never arrived. What has to
       work is the one in their hand now. */
    const { record, email } = await somebody('Youssef');
    const first = (await invite(record.id)).json() as { password: string };
    const second = (await invite(record.id)).json() as { password: string };
    assert.notEqual(first.password, second.password);

    const account = await findAccount(email);
    assert.equal(await verifyPassword(second.password, account!.passwordHash), true);
    assert.equal(await verifyPassword(first.password, account!.passwordHash), false, 'the old one is dead');
  });

  it('refuses an account whose owner chose their own password', async () => {
    /* Otherwise this is a way to reset somebody's password without saying so —
       the reset route exists, says what it does, and ends their sessions. */
    const email = `claimed.${Date.now()}@example.test`;
    const record = await dir.createRecord({ kind: 'person', name: 'Déjà entrée', email, origin: 'manual' });
    await createAccount({ email, password: 'chosen-by-them', recordId: record.id });

    const res = await invite(record.id);
    assert.equal(res.statusCode, 422);
    assert.equal((await letters({ email })).length, 0, 'and nothing went out');
  });

  it('refuses an account that has been switched off', async () => {
    const { record, email } = await somebody('Fermé');
    await app.inject({
      method: 'PATCH', url: `/api/records/${record.id}/account`,
      cookies: { [SESSION_COOKIE]: session }, payload: { disabled: true },
    });
    const res = await invite(record.id);
    assert.equal(res.statusCode, 422, 'inviting somebody into a dead end');
    assert.equal((await letters({ email })).length, 0);
  });

  it('opens an account for somebody who has none, rather than refusing', async () => {
    /* Most of the four hundred in the directory have no account at all: an
       invitation that only works on people who already have one would be
       useless for the one case it exists for. */
    const email = `jamais.${Date.now()}@example.test`;
    const record = await dir.createRecord({ kind: 'person', name: `Jamais ${Date.now()}`, email, origin: 'manual' });
    const out = await inviteDirect(record.id);
    assert.equal(out.blocked, '');

    const account = await findAccount(email);
    assert.ok(account, 'an account exists now');
    assert.equal(await verifyPassword(out.password!, account!.passwordHash), true);
    assert.equal((await letters({ email }))[0]?.kind, 'account_invite');
  });

  it('spreads a long list over days instead of writing it all one morning', async () => {
    /* A sending domain with no reputation that writes everything at once is
       classed as spam, and from then on the convocations and the results go to
       the same place. */
    const stamp = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const email = `lot${i}.${stamp}@example.test`;
      const r = await dir.createRecord({ kind: 'person', name: `Lot ${i} ${stamp}`, email, origin: 'manual' });
      ids.push(r.id);
    }
    const out = await inviteMany(ids, 2);
    assert.equal(out.written, 5);
    assert.equal(out.days, 3);

    const rows = await (await db()).query<{ n: number }>(
      `select count(*)::int as n from outbox where record_id = any($1::text[]) and send_after is not null`,
      [ids],
    );
    assert.equal(rows[0]!.n, 3, 'the first two go now, the other three wait their turn');
  });

  it('names those it cannot invite instead of quietly dropping them', async () => {
    const stamp = Date.now();
    const mute = await dir.createRecord({ kind: 'person', name: `Sans ${stamp}`, origin: 'manual' });
    const claimedEmail = `claimee.${stamp}@example.test`;
    const claimed = await dir.createRecord({ kind: 'person', name: `Déjà ${stamp}`, email: claimedEmail, origin: 'manual' });
    await createAccount({ email: claimedEmail, password: 'chosen-by-them', recordId: claimed.id });

    const out = await inviteMany([mute.id, claimed.id], null);
    assert.equal(out.written, 0);
    assert.deepEqual(out.blocked.map((b) => b.blocked).sort(), ['claimed', 'no_email']);
    assert.ok(out.blocked.every((b) => b.name), 'each one by name');
  });

  it('says plainly whether anything left, rather than letting the screen assume', async () => {
    // Nothing leaves outside production, and "we have emailed it" is a
    // sentence somebody acts on.
    const { record } = await somebody('Amine');
    const out = (await invite(record.id)).json() as { emailed: boolean };
    assert.equal(out.emailed, false);
  });
});
