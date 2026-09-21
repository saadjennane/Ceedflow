/**
 * The door that stops somebody guessing.
 *
 * Two of these guard against the control itself becoming the problem: shutting
 * one person out of their own account, or shutting the whole world out at
 * once. A rate limit that does either is worse than none.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { db, migrate } from '../src/db/client.js';
import { clearFailedLogins, loginAllowed, noteFailedLogin } from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const HERE = '203.0.113.7';
const ELSEWHERE = '198.51.100.22';
const ME = 'someone@example.test';
const SOMEBODY_ELSE = 'other@example.test';

describe('guessing passwords', { skip: skipWithoutServer }, () => {
  before(migrate);
  beforeEach(async () => {
    await (await db()).exec('delete from login_attempts');
  });
  after(closeDb);

  const failTimes = async (n: number, email = ME, ip = HERE) => {
    for (let i = 0; i < n; i += 1) await noteFailedLogin(email, ip);
  };

  it('lets somebody mistype a few times', async () => {
    await failTimes(4);
    assert.equal((await loginAllowed(ME, HERE)).allowed, true);
  });

  it('stops answering after five', async () => {
    await failTimes(5);
    const gate = await loginAllowed(ME, HERE);
    assert.equal(gate.allowed, false);
    assert.ok(gate.retryAfter > 0, 'nothing told the caller how long to wait');
  });

  it('does not let anyone lock a person out of their own account', async () => {
    // Somebody fails on your address from their machine; you sign in from yours.
    await failTimes(10, ME, HERE);
    assert.equal((await loginAllowed(ME, ELSEWHERE)).allowed, true);
  });

  it('does not shut a whole office out because of one account', async () => {
    await failTimes(5, ME, HERE);
    assert.equal((await loginAllowed(SOMEBODY_ELSE, HERE)).allowed, true);
  });

  it('stops one machine working down a list of addresses', async () => {
    for (let i = 0; i < 20; i += 1) await noteFailedLogin(`unknown${i}@example.test`, HERE);
    assert.equal((await loginAllowed('never-tried@example.test', HERE)).allowed, false);
  });

  it('forgets the fumbling of whoever got in', async () => {
    await failTimes(5);
    assert.equal((await loginAllowed(ME, HERE)).allowed, false);
    await clearFailedLogins(ME);
    assert.equal((await loginAllowed(ME, HERE)).allowed, true);
  });

  it('counts two spellings of one address as one', async () => {
    await failTimes(5, '  SOMEONE@Example.test  ');
    assert.equal((await loginAllowed(ME, HERE)).allowed, false);
  });
});
