/**
 * Une organisation nommée par quelqu'un.
 *
 * La même règle sert à la page qu'on ouvre dans son espace et à l'organisation
 * qu'on nomme en postulant : une nouvelle est à qui l'ouvre, une connue se
 * demande — son équipe ou CEED valide —, et la sienne ne se rejoint pas deux fois.
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

  it('asks to join one CEED already knows, rather than walking in', async () => {
    /* N'importe qui tapait un nom et lisait les statuts, l'équipe et les
       livrables d'une société qui n'était pas la sienne. */
    const name = `Atlas ${uniq()}`;
    const known = await dir.createRecord({ kind: 'org', name, emails: ['contact@atlas.test'], origin: 'manual' });
    const sanaa = await someone();
    const { org, joined, pending } = await dir.openOrganisation(sanaa.id, { name: `  ${name}  `, emails: ['me@x.test'] });
    assert.equal(org.id, known.id, 'no twin');
    assert.equal(joined, false);
    assert.equal(pending, true);
    assert.equal(await dir.accessOf(sanaa.id, known.id), null, 'nothing opens until somebody says yes');
    assert.deepEqual((await dir.getRecord(known.id))!.emails, ['contact@atlas.test'], 'and the page is not rewritten');

    const [request] = await dir.requestsFor(known.id);
    assert.equal(request?.personId, sanaa.id);
    await dir.openOrganisation(sanaa.id, { name });
    assert.equal((await dir.requestsFor(known.id)).length, 1, 'asking twice is still one request');

    await dir.acceptRequest(request!.id);
    assert.equal(await dir.accessOf(sanaa.id, known.id), 'member');
    assert.equal((await dir.requestsFor(known.id)).length, 0);
  });

  it('lets somebody the directory already placed there straight in', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Imported ${uniq()}`, origin: 'manual' });
    const founder = await someone();
    await dir.linkRecords({ personId: founder.id, orgId: org.id, role: 'CEO', access: 'admin' });
    const { pending, joined } = await dir.openOrganisation(founder.id, { name: org.name });
    assert.equal(pending, false);
    assert.equal(joined, true);
    assert.equal(await dir.accessOf(founder.id, org.id), 'admin');
  });

  it('forgets a declined request', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Nope ${uniq()}`, origin: 'manual' });
    const someoneElse = await someone();
    await dir.openOrganisation(someoneElse.id, { name: org.name });
    const [request] = await dir.requestsFor(org.id);
    assert.equal(await dir.declineRequest(request!.id), true);
    assert.equal(await dir.accessOf(someoneElse.id, org.id), null);
    assert.equal((await dir.requestsFor(org.id)).length, 0);
  });

  it('leaves an administrator who names their own organisation an administrator', async () => {
    /* La rejoindre une seconde fois réécrivait l'accès : retaper le nom de sa
       propre société en postulant faisait perdre la main sur sa page. */
    const karim = await someone();
    const { org } = await dir.openOrganisation(karim.id, { name: `Noor ${uniq()}` });
    await dir.openOrganisation(karim.id, { name: org.name });
    assert.equal(await dir.accessOf(karim.id, org.id), 'admin');
  });

  it('keeps what a new record is created with — its photo and its sheet, not only its name', async () => {
    /* La photo d'une personne ajoutée à l'annuaire était reçue puis oubliée :
       la liste et la fiche n'affichaient que ses initiales. */
    const person = await dir.createRecord({ kind: 'person', name: `Photo ${uniq()}`, origin: 'manual', logoUploadId: 'upl_photo' });
    assert.equal(person.logoUploadId, 'upl_photo');
    const org = await dir.createRecord({
      kind: 'org', name: `Sheet ${uniq()}`, origin: 'manual', logoUploadId: 'upl_logo', orgType: 'startup', legalForm: 'sarl', foundedOn: '2023-04-01',
    });
    assert.equal(org.logoUploadId, 'upl_logo');
    const sheet = org as unknown as { orgType: string; legalForm: string; foundedYear: number | null };
    assert.equal(sheet.orgType, 'startup');
    assert.equal(sheet.legalForm, 'sarl');
    assert.equal(sheet.foundedYear, 2023, 'the year follows the date');
  });

  it('opens a new organisation with the logo and sector it was named with', async () => {
    const karim = await someone();
    const { org } = await dir.openOrganisation(karim.id, { name: `Logo ${uniq()}`, logoUploadId: 'upl_x', sector: 'Fintech' });
    assert.equal(org.logoUploadId, 'upl_x');
    assert.equal(org.sector, 'Fintech');
  });
});
