/**
 * Une organisation nommée par quelqu'un.
 *
 * La même règle sert à la page qu'on ouvre dans son espace et à l'organisation
 * qu'on nomme en postulant : une nouvelle est à qui l'ouvre, une connue gagne
 * un contact plutôt qu'un double, et la sienne ne se rejoint pas deux fois.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => Math.random().toString(36).slice(2, 8);

describe('naming an organisation', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  const someone = () => dir.createRecord({ kind: 'person', name: `Karim ${uniq()}`, origin: 'manual' });

  it('makes whoever opens a new one its administrator', async () => {
    const karim = await someone();
    const { org, joined } = await dir.openOrganisation(karim.id, { name: `Rafid ${uniq()}`, website: 'rafid.ma' });
    assert.equal(joined, false);
    assert.equal(org.website, 'rafid.ma');
    assert.equal(await dir.accessOf(karim.id, org.id), 'admin');
  });

  it('joins one CEED already knows as a member, rather than making a twin', async () => {
    const name = `Atlas ${uniq()}`;
    const known = await dir.createRecord({ kind: 'org', name, origin: 'manual' });
    const sanaa = await someone();
    const { org, joined } = await dir.openOrganisation(sanaa.id, { name: `  ${name}  ` });
    assert.equal(joined, true);
    assert.equal(org.id, known.id);
    assert.equal(await dir.accessOf(sanaa.id, known.id), 'member');
  });

  it('leaves an administrator who names their own organisation an administrator', async () => {
    /* La rejoindre une seconde fois réécrivait l'accès : retaper le nom de sa
       propre société en postulant faisait perdre la main sur sa page. */
    const karim = await someone();
    const { org } = await dir.openOrganisation(karim.id, { name: `Noor ${uniq()}` });
    await dir.openOrganisation(karim.id, { name: org.name });
    assert.equal(await dir.accessOf(karim.id, org.id), 'admin');
  });
});
