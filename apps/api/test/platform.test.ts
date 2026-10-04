/**
 * Que la plateforme sache où elle habite.
 *
 * A letter whose only instruction is "go to your space" is worth nothing
 * without an address, and the address used to be a variable somebody had to
 * set — a step forgotten exactly once, and then four hundred dead links. So
 * the platform reads it off the requests it serves, and these say which hosts
 * it believes and which it does not.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { db, migrate } from '../src/db/client.js';
import { noteOrigin, publicOrigin } from '../src/services/platform.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

/* Each test uses a host of its own on purpose. The write side skips an upsert
   for an origin it has already put down — which is what keeps a health check
   from being a database write — so two tests sharing a hostname would have the
   second one quietly write nothing. */
describe('where this platform thinks it lives', { skip: skipWithoutServer }, () => {
  const APP_URL = process.env.APP_URL;
  beforeEach(async () => {
    delete process.env.APP_URL;
    await (await db()).query(`delete from settings where key = 'public_origin'`);
  });
  after(() => {
    if (APP_URL === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = APP_URL;
  });

  it('learns it from what it is asked on', async () => {
    await noteOrigin('https', 'www.ceedflow.com');
    assert.equal(await publicOrigin(), 'https://www.ceedflow.com');
  });

  it('keeps it across a restart, for a notice going out before anybody opens a page', async () => {
    // A host of its own: the write side skips an upsert for an origin it has
    // already put down, which is the point of that cache.
    await noteOrigin('https', 'app.ceedflow.com');
    const rows = await (await db()).query<{ value: string }>(
      `select value from settings where key = 'public_origin'`,
    );
    assert.equal(rows[0]?.value, 'https://app.ceedflow.com', 'written down, not only remembered');
  });

  it('follows a change of domain without a deploy', async () => {
    await noteOrigin('https', 'old.ceedflow.com');
    await noteOrigin('https', 'www.ceedflow.com');
    assert.equal(await publicOrigin(), 'https://www.ceedflow.com');
  });

  it('writes https unless the proxy in front says plainly otherwise', async () => {
    /* Only public hosts reach this, and the two mistakes are not equal: an
       https link to an http-only site fails once, in front of one person. An
       http link walks four hundred founders onto an unencrypted page. */
    await noteOrigin(undefined, 'secure.ceedflow.com');
    assert.equal(await publicOrigin(), 'https://secure.ceedflow.com', 'no word from a proxy: assume https');

    await noteOrigin('http', 'plain.ceedflow.com');
    assert.equal(await publicOrigin(), 'http://plain.ceedflow.com', 'said plainly: believed');
  });

  it('ignores the names this process calls itself', async () => {
    /* A health check and a platform's internal mesh are this process talking
       to itself. Believing one of them invites a founder to visit a hostname
       that exists only inside the datacentre. */
    for (const host of ['localhost:4000', '127.0.0.1:4000', 'postgres.railway.internal', 'api.local', '[::1]:4000']) {
      await noteOrigin('http', host);
      assert.equal(await publicOrigin(), '', `believed ${host}`);
    }
  });

  it('a setting given by hand still wins', async () => {
    await noteOrigin('https', 'www.ceedflow.com');
    process.env.APP_URL = 'https://staging.ceedflow.com/';
    assert.equal(await publicOrigin(), 'https://staging.ceedflow.com', 'and the trailing slash goes');
  });

  it('says nothing rather than guessing, when nothing has told it', async () => {
    assert.equal(await publicOrigin(), '');
  });
});
