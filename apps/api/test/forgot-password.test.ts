/**
 * Mot de passe oublié.
 *
 * Asking for a new password must never be a way to lock somebody out: what is
 * sent is a second password, beside the first, for an hour. The first one used
 * wins, and using the mailed one means choosing your own straight after.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { all } from '../src/db/client.js';
import {
  createAccount,
  dropReset,
  findAccount,
  issueReset,
  resetRequestedRecently,
  useReset,
  verifyPassword,
} from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('a forgotten password', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  const someone = async () => {
    const mark = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const email = `oubli.${mark}@example.test`;
    const record = await dir.createRecord({ kind: 'person', name: `Salma ${mark}`, emails: [email], origin: 'manual' });
    const account = await createAccount({ email, password: 'mon-vieux-mot', recordId: record.id });
    return { email, account };
  };

  it('leaves the current password working, so asking cannot lock anybody out', async () => {
    const { email, account } = await someone();
    await issueReset(account.id, 'sable-cedre-4410');
    const found = await findAccount(email);
    assert.ok(await verifyPassword('mon-vieux-mot', found!.passwordHash), 'the old one still opens');
    assert.equal(found!.mustChangePassword, false);
  });

  it('makes the mailed one the password, provisional, the old one gone', async () => {
    const { email, account } = await someone();
    await issueReset(account.id, 'sable-cedre-4410');
    assert.equal(await useReset(account.id, 'pas-le-bon'), false);
    assert.equal(await useReset(account.id, 'sable-cedre-4410'), true);
    const found = await findAccount(email);
    assert.equal(found!.mustChangePassword, true, 'the next screen asks for one of their own');
    assert.ok(await verifyPassword('sable-cedre-4410', found!.passwordHash));
    assert.ok(!(await verifyPassword('mon-vieux-mot', found!.passwordHash)), 'the old one stops');
    assert.equal(await useReset(account.id, 'sable-cedre-4410'), false, 'and the mailed one is spent');
  });

  it('works for an hour, and not after', async () => {
    const { account } = await someone();
    await issueReset(account.id, 'sable-cedre-4410');
    await all(`update accounts set reset_expires_at = now() - interval '1 minute' where id = $1`, [account.id]);
    assert.equal(await useReset(account.id, 'sable-cedre-4410'), false);
  });

  it('is withdrawn when the usual password is used instead', async () => {
    const { account } = await someone();
    await issueReset(account.id, 'sable-cedre-4410');
    await dropReset(account.id);
    assert.equal(await useReset(account.id, 'sable-cedre-4410'), false);
  });

  it('is not sent twice in a few minutes', async () => {
    const { account } = await someone();
    assert.equal(await resetRequestedRecently(account.id), false);
    await issueReset(account.id, 'sable-cedre-4410');
    assert.equal(await resetRequestedRecently(account.id), true);
  });
});
