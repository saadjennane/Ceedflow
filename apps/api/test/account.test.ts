/**
 * The two things an administrator can do to somebody else's way in.
 *
 * Both are deliberate overrides of rules that exist for good reasons — one
 * never overwrites a password its owner chose, the other lets anybody with the
 * password in — so both deserve a test that says exactly how far they go, and
 * what they leave alone.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { accountStateOf, fullName, splitName, suggestPassword } from '@ceed/shared';
import { db, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import {
  accountOfRecord,
  createAccount,
  createSession,
  accountForToken,
  findAccount,
  reissueProvisionalPassword,
  setAccountDisabled,
  setPassword,
  verifyPassword,
} from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('what a disabled account is', () => {
  it('is disabled before it is anything else', () => {
    // A claimed account that has been closed is closed, first. Reading the
    // other two fields first would have shown it as "Claimed", in green.
    assert.equal(
      accountStateOf({ mustChangePassword: false, invitedAt: null, disabledAt: '2026-09-29T10:00:00Z' }),
      'disabled',
    );
    assert.equal(
      accountStateOf({ mustChangePassword: true, invitedAt: '2026-09-01', disabledAt: '2026-09-29' }),
      'disabled',
    );
  });

  it('leaves the other three alone', () => {
    assert.equal(accountStateOf({ mustChangePassword: false, invitedAt: null, disabledAt: null }), 'claimed');
    assert.equal(accountStateOf({ mustChangePassword: true, invitedAt: '2026-09-01', disabledAt: null }), 'invited');
    assert.equal(accountStateOf({ mustChangePassword: true, invitedAt: null, disabledAt: null }), 'unclaimed');
  });
});

before(migrate);
after(closeDb);

/** Somebody with an account they have made their own. */
const withClaimedAccount = async (email: string) => {
  const person = await dir.createRecord({ kind: 'person', name: 'Nawal Cherkaoui', emails: [email], origin: 'manual' });
  await createAccount({ email, password: 'given-by-ceed', recordId: person.id, mustChangePassword: true });
  const account = (await accountOfRecord(person.id))!;
  // She replaces it, which is what makes the account hers.
  await setPassword(account.id, 'her-own-password');
  return { person, account };
};

describe('resetting a password', { skip: skipWithoutServer }, () => {
  it('replaces one its owner had chosen, and hands the account back unclaimed', async () => {
    const { person } = await withClaimedAccount('reset.one@example.test');
    assert.equal((await accountOfRecord(person.id))!.state, 'claimed');

    const fresh = suggestPassword();
    await reissueProvisionalPassword((await accountOfRecord(person.id))!.id, fresh);

    const after = (await accountOfRecord(person.id))!;
    assert.equal(after.state, 'unclaimed', 'a password CEED knows is not theirs');

    const stored = await findAccount('reset.one@example.test');
    assert.ok(await verifyPassword(fresh, stored!.passwordHash), 'the new one works');
    assert.equal(await verifyPassword('her-own-password', stored!.passwordHash), false, 'the old one does not');
  });

  it('ends the sessions the old password had opened', async () => {
    const { person } = await withClaimedAccount('reset.two@example.test');
    const account = (await accountOfRecord(person.id))!;
    const { token } = await createSession(account.id);
    assert.ok(await accountForToken(token), 'signed in');

    await reissueProvisionalPassword(account.id, suggestPassword());
    assert.equal(await accountForToken(token), null, 'and signed out by the reset');
  });
});

describe('closing an account', { skip: skipWithoutServer }, () => {
  it('stops the sessions already open, which is the case you close one for', async () => {
    const { person } = await withClaimedAccount('shut.one@example.test');
    const account = (await accountOfRecord(person.id))!;
    const { token } = await createSession(account.id);
    assert.ok(await accountForToken(token));

    await setAccountDisabled(account.id, true);
    assert.equal(await accountForToken(token), null, 'a fortnight of session does not survive it');
    assert.equal((await accountOfRecord(person.id))!.state, 'disabled');
    assert.ok((await accountOfRecord(person.id))!.disabledAt, 'and it says since when');
  });

  it('keeps the password, so opening it again asks nothing of anybody', async () => {
    const { person } = await withClaimedAccount('shut.two@example.test');
    const account = (await accountOfRecord(person.id))!;
    await setAccountDisabled(account.id, true);
    await setAccountDisabled(account.id, false);

    const back = (await accountOfRecord(person.id))!;
    assert.equal(back.state, 'claimed', 'it is theirs again, not handed back unclaimed');
    assert.equal(back.disabledAt, null);
    const stored = await findAccount('shut.two@example.test');
    assert.ok(await verifyPassword('her-own-password', stored!.passwordHash), 'the same password still works');
  });

  it('leaves the person in the directory', async () => {
    // The whole point: they are still a juror who scored, a founder on a
    // candidacy, a contact on a record. Only the way in closes.
    const { person } = await withClaimedAccount('shut.three@example.test');
    await setAccountDisabled((await accountOfRecord(person.id))!.id, true);

    const record = await dir.getRecord(person.id);
    assert.equal(record?.name, 'Nawal Cherkaoui');
    assert.equal(record?.email, 'shut.three@example.test');
  });

  it('keeps the row rather than deleting it', async () => {
    const { person } = await withClaimedAccount('shut.four@example.test');
    const account = (await accountOfRecord(person.id))!;
    await setAccountDisabled(account.id, true);

    const rows = await (await db()).query<{ n: number }>(
      'select count(*)::int as n from accounts where id = $1',
      [account.id],
    );
    assert.equal(Number(rows[0]!.n), 1, 'closing is not deleting');
  });
});

describe('a name cut in two', () => {
  it('cuts at the first space, and leaves the rest whole', () => {
    assert.deepEqual(splitName('Sarah Benali'), { firstName: 'Sarah', lastName: 'Benali' });
    /* Faux pour un prénom composé, et volontairement : quatre cent soixante-neuf
       noms ne se relisent pas un par un, et une coupe qu'on voit et qu'on
       corrige vaut mieux qu'un champ vide que personne ne remarque. */
    assert.deepEqual(splitName('Mohamed Amine Beniouri'), { firstName: 'Mohamed', lastName: 'Amine Beniouri' });
    assert.deepEqual(splitName('Cher'), { firstName: 'Cher', lastName: '' });
    assert.deepEqual(splitName('  Saad   Jennane  '), { firstName: 'Saad', lastName: 'Jennane' });
    assert.deepEqual(splitName(''), { firstName: '', lastName: '' });
  });

  it('goes back to the one name every screen shows', () => {
    const { firstName, lastName } = splitName('Mohamed Amine Beniouri');
    assert.equal(fullName(firstName, lastName), 'Mohamed Amine Beniouri', 'nothing lost on the round trip');
    assert.equal(fullName('Cher', ''), 'Cher', 'and no trailing space where there is no last name');
  });
});
