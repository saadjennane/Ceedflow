/**
 * That saving your profile cannot cost you your name.
 *
 * Most records hold one name and neither half of it — that is what the import
 * and the quick add both write. Recomputing the display name from two empty
 * halves turned a phone number into an erasure, and nothing on the screen
 * would have warned anybody.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fullName } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { closeDb, skipWithoutServer } from './helpers.js';

/** What the route does with what the form sent. */
const nameAfterSave = (firstName: string, lastName: string) => {
  const both = fullName(firstName, lastName);
  return both ? { name: both } : {};
};

describe('saving a profile', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('keeps the name of somebody who has no first and last name on file', async () => {
    const person = await dir.createRecord({
      kind: 'person', name: 'Salma Berrada Souni', origin: 'manual',
    });
    assert.equal(person.firstName, '');

    // They change their phone and save. Nothing about the name was touched.
    await dir.updateRecord(person.id, { phone: '+212 6 11 22 33 44', ...nameAfterSave('', '') });
    const after = await dir.getRecord(person.id);
    assert.equal(after?.name, 'Salma Berrada Souni', 'saving a phone number erased the name');
    assert.equal(after?.phone, '+212 6 11 22 33 44');
  });

  it('follows the two halves when they say something', async () => {
    const person = await dir.createRecord({ kind: 'person', name: 'Old Name', origin: 'manual' });
    await dir.updateRecord(person.id, { firstName: 'Nawal', lastName: 'Cherkaoui', ...nameAfterSave('Nawal', 'Cherkaoui') });
    const after = await dir.getRecord(person.id);
    assert.equal(after?.name, 'Nawal Cherkaoui');
  });

  it('takes a first name alone', async () => {
    const person = await dir.createRecord({ kind: 'person', name: 'Anything', origin: 'manual' });
    await dir.updateRecord(person.id, { firstName: 'Karim', lastName: '', ...nameAfterSave('Karim', '') });
    assert.equal((await dir.getRecord(person.id))?.name, 'Karim');
  });
});
