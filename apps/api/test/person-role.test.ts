/**
 * Ce qu'une personne fait là où elle travaille.
 *
 * The directory knew what somebody is to CEED — mentor, juror, investor — and
 * nothing about their job. A jury is convened from this file, and the function
 * and the direction are what tell two people of the same name apart at the
 * moment of deciding who sits.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('what somebody does where they work', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('keeps the function and the direction, and finds people by either', async () => {
    /* Un jury se convoque depuis ce fichier : « Directrice de l'innovation,
       Direction des engagements » est exactement ce qui distingue deux Nadia
       au moment de décider qui siège. */
    const mark = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const person = await dir.createRecord({
      kind: 'person', name: `Nadia Boussaid ${mark}`, origin: 'manual',
      jobTitle: 'Directrice de l’innovation', department: `Direction des engagements ${mark}`,
    });
    assert.equal(person.jobTitle, 'Directrice de l’innovation');

    const byTitle = await dir.listRecords({ kind: 'person', q: 'directrice de l’innovation' });
    assert.ok(byTitle.some((r) => r.id === person.id), 'found by what they do');
    const byDepartment = await dir.listRecords({ kind: 'person', q: `des engagements ${mark}` });
    assert.ok(byDepartment.some((r) => r.id === person.id), 'and by where they do it');
  });

  it('lets both be corrected on somebody already on file', async () => {
    const person = await dir.createRecord({ kind: 'person', name: `Nadia ${Date.now()}`, origin: 'manual' });
    assert.equal(person.jobTitle, '', 'nothing on file to begin with');

    await dir.updateRecord(person.id, { jobTitle: 'Responsable RSE', department: 'Direction générale' });
    const after = await dir.getRecord(person.id);
    assert.equal(after?.jobTitle, 'Responsable RSE');
    assert.equal(after?.department, 'Direction générale');
  });
});
