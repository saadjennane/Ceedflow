/**
 * That nothing leaves by accident.
 *
 * The database behind this holds four hundred real addresses, so the guard is
 * the feature and the sending is the consequence. These say exactly when a
 * message goes out and when it is only written down — in both directions,
 * because a guard that is never proved to let anything through is a guard that
 * quietly swallows a week of password resets.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { db, migrate } from '../src/db/client.js';
import { letters, post, replyTo, sendingIsLive, suppress, suppressed } from '../src/services/mail.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

/** Puts the process in a named state and gives it back afterwards. */
const as = async (env: { NODE_ENV?: string; RESEND_API_KEY?: string }, run: () => Promise<void>) => {
  const before = { NODE_ENV: process.env.NODE_ENV, RESEND_API_KEY: process.env.RESEND_API_KEY };
  if (env.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = env.NODE_ENV;
  if (env.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = env.RESEND_API_KEY;
  try {
    await run();
  } finally {
    if (before.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before.NODE_ENV;
    if (before.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = before.RESEND_API_KEY;
  }
};

describe('when sending is live at all', () => {
  it('takes production and a key, both', async () => {
    await as({ NODE_ENV: 'production', RESEND_API_KEY: 'rs_test' }, async () => {
      assert.equal(sendingIsLive(), true);
    });
  });

  it('is off on a developer machine, key or no key', async () => {
    // The case this exists for: a key left in a shell, and four hundred real
    // addresses in the database next to it.
    await as({ NODE_ENV: 'development', RESEND_API_KEY: 'rs_test' }, async () => {
      assert.equal(sendingIsLive(), false);
    });
    await as({ NODE_ENV: undefined, RESEND_API_KEY: 'rs_test' }, async () => {
      assert.equal(sendingIsLive(), false);
    });
  });

  it('is off in production without a key, rather than failing on each message', async () => {
    await as({ NODE_ENV: 'production', RESEND_API_KEY: undefined }, async () => {
      assert.equal(sendingIsLive(), false);
    });
  });
});

describe('the outbox', { skip: skipWithoutServer }, () => {
  beforeEach(async () => {
    await (await db()).query('delete from outbox');
    await (await db()).query('delete from email_suppressions');
  });

  it('writes the message down and holds it where sending is not live', async () => {
    await as({ NODE_ENV: 'development', RESEND_API_KEY: 'rs_test' }, async () => {
      await post({ kind: 'password_reset', to: 'Nawal@Example.Test', subject: 'Hello', body: 'Body' });
    });
    const [row] = await letters({ email: 'nawal@example.test' });
    assert.equal(row!.state, 'held', 'written, and deliberately not sent');
    assert.equal(row!.subject, 'Hello', 'and kept whole, so it can be read back');
  });

  it('lower-cases the address, so one person is one history', async () => {
    await as({ NODE_ENV: 'development' }, async () => {
      await post({ kind: 'x', to: '  Nawal@Example.Test ', subject: 'a', body: 'b' });
    });
    assert.equal((await letters({ email: 'nawal@example.test' })).length, 1);
  });

  it('queues it where sending is live', async () => {
    await as({ NODE_ENV: 'production', RESEND_API_KEY: 'rs_test' }, async () => {
      await post({ kind: 'password_reset', to: 'karim@example.test', subject: 'Hello', body: 'Body' });
    });
    assert.equal((await letters({ email: 'karim@example.test' }))[0]!.state, 'queued');
  });

  it('treats a blank reply address as none at all', () => {
    /* Vidée dans une console d'hébergeur, la variable garde souvent un espace
       — et « reply_to: " " » fait refuser toutes les lettres, pas une. */
    const before = process.env.MAIL_REPLY_TO;
    try {
      process.env.MAIL_REPLY_TO = '   ';
      assert.equal(replyTo(), '', 'a space is not an address');
      delete process.env.MAIL_REPLY_TO;
      assert.equal(replyTo(), '', 'and neither is nothing');
      process.env.MAIL_REPLY_TO = '  contact@ceedflow.com ';
      assert.equal(replyTo(), 'contact@ceedflow.com', 'a real one survives, tidied');
    } finally {
      if (before === undefined) delete process.env.MAIL_REPLY_TO;
      else process.env.MAIL_REPLY_TO = before;
    }
  });

  it('holds anything addressed to somebody who bounced for good', async () => {
    await suppress('gone@example.test', 'hard bounce');
    assert.equal(await suppressed('GONE@example.test'), true, 'the address is matched however it is written');

    await as({ NODE_ENV: 'production', RESEND_API_KEY: 'rs_test' }, async () => {
      await post({ kind: 'account_invite', to: 'gone@example.test', subject: 'Hello', body: 'Body' });
    });
    const [row] = await letters({ email: 'gone@example.test' });
    assert.equal(row!.state, 'held', 'written down, because it was meant; not sent, because it cannot arrive');
  });

  it('says nothing and does nothing when there is no address', async () => {
    // A record with no email is ordinary — most of the 439 imported ones had
    // none — and asking to write to one must not be an error.
    assert.equal(await post({ kind: 'x', to: '   ', subject: 'a', body: 'b' }), null);
    assert.equal((await letters({ email: '' })).length, 0);
  });

  it('keeps what was sent about one candidacy together', async () => {
    await as({ NODE_ENV: 'development' }, async () => {
      await post({ kind: 'deliverable_rejected', to: 'a@example.test', subject: '1', body: 'x', candidateId: 'cnd_1' });
      await post({ kind: 'deliverable_rejected', to: 'b@example.test', subject: '2', body: 'x', candidateId: 'cnd_1' });
      await post({ kind: 'x', to: 'c@example.test', subject: '3', body: 'x', candidateId: 'cnd_2' });
    });
    assert.equal((await letters({ candidateId: 'cnd_1' })).length, 2);
  });
});
