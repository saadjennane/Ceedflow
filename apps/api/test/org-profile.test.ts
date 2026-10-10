/**
 * La fiche d'une startup : ce qu'elle garde, et ce qu'elle compte.
 *
 * The bar exists to encourage, which only works if it is honest: a founder who
 * fills the sector and watches nothing move stops filling. And the jury's pane
 * reads the same function, so a bar that counted differently from the pane
 * would promise a sheet that is not there.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  PROFILE_ASKS,
  profileDone,
  profileMissing,
  profileOf,
  profileStarted,
} from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('a startup’s profile', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('keeps everything the fiche asks for, and gives it back', async () => {
    const org = await dir.createRecord({
      kind: 'org', name: `Nakhla Bio ${Date.now()}`, origin: 'manual',
      pitch: 'Des dattes bio, vendues en direct aux épiceries fines.',
      sector: 'Agroalimentaire', stage: 'mvp', foundedYear: 2021, teamSize: 7,
      linkedin: 'https://www.linkedin.com/company/nakhla-bio',
    });
    assert.equal(org.sector, 'Agroalimentaire');
    assert.equal(org.stage, 'mvp');
    assert.equal(org.foundedYear, 2021);
    assert.equal(org.teamSize, 7);

    const back = await dir.getRecord(org.id);
    assert.equal(back!.pitch, 'Des dattes bio, vendues en direct aux épiceries fines.');
    assert.equal(back!.linkedin, 'https://www.linkedin.com/company/nakhla-bio');
  });

  it('counts a fresh organisation as nothing filled in', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Vide ${Date.now()}`, origin: 'manual' });
    const profile = profileOf(org);
    assert.equal(profileDone(profile), 0);
    assert.equal(profileMissing(profile).length, PROFILE_ASKS.length);
    /* Une fiche que personne n'a touchée n'est pas montrée au jury : dix tirets
       devant un juré se lisent comme un reproche à la startup. */
    assert.equal(profileStarted(profile), false);
  });

  it('counts an empty team as an answer, not as a blank', async () => {
    /* Zéro salarié est une réponse — deux fondateurs non salariés, le cas le
       plus courant du portefeuille. La compter comme une case vide reprochait
       à la startup d'avoir répondu. */
    const org = await dir.createRecord({
      kind: 'org', name: `Deux associés ${Date.now()}`, origin: 'manual', teamSize: 0,
    });
    const profile = profileOf(org);
    assert.ok(!profileMissing(profile).includes('team'), 'zero is filled in');
    assert.equal(profileDone(profile), 10);
    assert.equal(profileStarted(profile), true);
  });

  it('moves as each ask is answered, and names what is left', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Pas à pas ${Date.now()}`, origin: 'manual' });
    await dir.updateRecord(org.id, {
      pitch: 'Une phrase.', sector: 'Santé', places: [{ city: 'Agadir', country: 'Morocco' }],
    });
    const after = profileOf((await dir.getRecord(org.id))!);
    assert.equal(profileDone(after), 30);
    assert.deepEqual(profileMissing(after), ['logo', 'stage', 'founded', 'team', 'website', 'linkedin', 'bio']);
  });

  it('is complete only when the ten are there', async () => {
    const org = await dir.createRecord({
      kind: 'org', name: `Complète ${Date.now()}`, origin: 'manual',
      pitch: 'Une phrase.', sector: 'Santé', stage: 'growing', foundedYear: 2019, teamSize: 24,
      places: [{ city: 'Casablanca', country: 'Morocco' }],
      website: 'https://exemple.ma', linkedin: 'https://linkedin.com/company/x',
      bio: 'Ce qu’elle fait, en long.',
    });
    assert.deepEqual(profileMissing(profileOf(org)), ['logo'], 'only the logo is missing');
    await dir.updateRecord(org.id, { logoUploadId: 'upl_test' });
    const full = profileOf((await dir.getRecord(org.id))!);
    assert.equal(profileDone(full), 100);
    assert.deepEqual(profileMissing(full), []);
  });

  it('leaves a person’s record out of it', async () => {
    /* Les colonnes sont sur records, les deux natures partagent la table : une
       personne n'a pas de stade ni d'effectif, et rien ne doit lui en inventer. */
    const person = await dir.createRecord({ kind: 'person', name: `Karim ${Date.now()}`, origin: 'manual' });
    assert.equal(person.stage, '');
    assert.equal(person.teamSize, null);
  });
});
