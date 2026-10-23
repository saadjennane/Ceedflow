/**
 * La fiche d'une organisation : ce qu'elle garde, ce qu'elle demande, ce qu'elle compte.
 *
 * The bar exists to encourage, which only works if it is honest: a founder who
 * fills a field and watches nothing move stops filling, and a company asked
 * for a turnover it cannot have yet is told it is behind for being early. So
 * what does not apply is neither asked nor counted — and the jury's pane reads
 * the same rules, so the bar cannot promise a sheet that is not there.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  forEcosystem,
  fundingTotals,
  teamProblems,
  profileAsks,
  profileDone,
  profileMissing,
  profileOf,
  profileStarted,
  revenueYears,
} from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

const uniq = () => `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

describe('what the fiche asks', () => {
  it('asks a company being registered for nothing legal', () => {
    const p = profileOf({ legalStatus: 'in_creation' });
    const asks = profileAsks(p);
    for (const k of ['founded', 'legalForm', 'capital'] as const) assert.ok(!asks.includes(k), k);
    const registered = profileAsks(profileOf({ legalStatus: 'registered' }));
    for (const k of ['founded', 'legalForm', 'capital'] as const) assert.ok(registered.includes(k), k);
  });

  it('does not ask an idea for its turnover', () => {
    for (const maturity of ['ideation', 'prototype']) {
      const asks = profileAsks(profileOf({ maturity }));
      for (const k of ['revenues', 'clients', 'contracts', 'mvpUsers'] as const) assert.ok(!asks.includes(k), `${maturity}: ${k}`);
    }
  });

  it('asks an MVP whether anybody uses it, and nothing commercial beyond', () => {
    const asks = profileAsks(profileOf({ maturity: 'mvp' }));
    assert.ok(asks.includes('mvpUsers'));
    assert.ok(!asks.includes('revenues'));
  });

  it('asks a selling company for its figures, and the contracts only once there are some', () => {
    const p = profileOf({ maturity: 'traction', foundedYear: 2015 });
    const asks = profileAsks(p);
    for (const k of ['revenues', 'clients', 'contracts'] as const) assert.ok(asks.includes(k), k);
    assert.ok(!asks.includes('contractsDetail'));
    assert.ok(profileAsks(profileOf({ maturity: 'traction', signedContracts: 'yes' })).includes('contractsDetail'));
  });

  it('wants a number for a granted patent, and the procedure for a pending one', () => {
    const granted = profileOf({ patent: 'yes', patentDetails: { number: 'MA-123' } });
    assert.ok(profileMissing(granted).includes('patentDetails'), 'a number without a country is not enough');
    const pending = profileOf({ patent: 'pending', patentDetails: { procedure: 'Examen en cours' } });
    assert.ok(!profileMissing(pending).includes('patentDetails'));
    assert.ok(!profileAsks(profileOf({ patent: 'no' })).includes('patentDetails'));
  });

  it('asks for the last three closed years, none before the company existed', () => {
    const today = new Date('2026-10-22T12:00:00');
    assert.deepEqual(revenueYears(profileOf({ foundedYear: 2010 }), today), [2025, 2024, 2023]);
    assert.deepEqual(revenueYears(profileOf({ foundedOn: '2024-03-01' }), today), [2025, 2024]);
  });

  it('counts only what applies: a company that answered everything it was asked is complete', () => {
    /* En création, au stade de l'idée : ni juridique, ni chiffres. Elle a
       répondu à tout ce qui la concerne, et c'est cent. */
    const p = profileOf({
      logoUploadId: 'upl_x', pitch: 'Une phrase.', orgType: 'startup', legalStatus: 'in_creation',
      sector: 'agritech', website: 'https://x.ma', linkedin: 'https://linkedin.com/company/x',
      emails: ['contact@x.ma'], phones: ['+212600000000'],
      places: [{ city: 'Agadir', country: 'Morocco', address: '12 rue des Palmiers' }],
      bio: 'Ce qu’elle fait.', teamSize: 2, maturity: 'ideation', patent: 'no',
      activityNature: 'product', targetMarkets: ['b2b'], mainOffering: 'Un capteur.', salesZone: 'morocco',
      products: [{ id: 'p', name: 'Capteur', description: '', imageUploadId: null, status: '', price: '', position: 0 }],
      foundersCount: 2, womenCount: 1, hasFunding: 'no', pastPrograms: 'no', currentPrograms: 'no',
    });
    assert.deepEqual(profileMissing(p), []);
    assert.equal(profileDone(p), 100);
  });

  it('reads the old five-level stage as the new maturity', () => {
    assert.equal(profileOf({ stage: 'customers' }).maturity, 'commercialisation');
    assert.equal(profileOf({ stage: 'growing', maturity: 'scaleup' }).maturity, 'scaleup', 'a choice since wins');
  });

  it('keeps how to reach a company away from the ecosystem', () => {
    const p = forEcosystem(
      profileOf({
        emails: ['ceo@x.ma'], phones: ['+212600000000'],
        places: [{ city: 'Rabat', country: 'Morocco', address: '1 avenue Mohammed V' }], sector: 'fintech',
      }),
    );
    assert.deepEqual(p.emails, []);
    assert.deepEqual(p.phones, []);
    assert.deepEqual(p.places, [{ city: 'Rabat', country: 'Morocco' }]);
    assert.equal(p.sector, 'fintech', 'what the company is stays');
  });
});

describe('a startup’s fiche, kept', { skip: skipWithoutServer }, () => {

  it('keeps everything the first fiche asked for, and gives it back', async () => {
    const org = await dir.createRecord({
      kind: 'org', name: `Nakhla Bio ${uniq()}`, origin: 'manual',
      pitch: 'Des dattes bio, vendues en direct aux épiceries fines.',
      sector: 'agrifood', stage: 'mvp', foundedYear: 2021, teamSize: 7,
      linkedin: 'https://www.linkedin.com/company/nakhla-bio',
    });
    const back = profileOf((await dir.getRecord(org.id))!);
    assert.equal(back.pitch, 'Des dattes bio, vendues en direct aux épiceries fines.');
    assert.equal(back.maturity, 'mvp');
    assert.equal(back.teamSize, 7);
  });

  it('keeps the sections’ answers, lists and objects included', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${uniq()}`, origin: 'manual' });
    await dir.updateRecord(org.id, {
      orgType: 'startup', legalStatus: 'registered', foundedOn: '2019-05-14', legalForm: 'sarl_au',
      capitalAmount: 100000, capitalCurrency: 'MAD', secondarySectors: ['ai', 'software'],
      socials: ['https://instagram.com/atlas'], maturity: 'traction', activeClients: 0,
      patent: 'yes', patentDetails: { number: 'MA-42', country: 'Morocco', office: 'OMPIC' },
      signedContracts: 'yes', contractsCount: 3, contractsAmount: 450000,
      places: [{ city: 'Casablanca', country: 'Morocco', address: '5 bd Zerktouni' }],
    });
    const p = profileOf((await dir.getRecord(org.id))!);
    assert.equal(p.legalForm, 'sarl_au');
    assert.equal(p.capitalAmount, 100000);
    assert.equal(p.foundedYear, 2019, 'the year follows the date');
    assert.deepEqual(p.secondarySectors, ['ai', 'software']);
    assert.deepEqual(p.patentDetails, { number: 'MA-42', country: 'Morocco', office: 'OMPIC' });
    assert.equal(p.activeClients, 0, 'zero clients is an answer, and is kept');
    assert.equal(p.places[0]?.address, '5 bd Zerktouni');
    assert.equal(p.city, 'Casablanca');
  });

  it('keeps a turnover per year, zero and "not available" included, and forgets an emptied one', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Chiffres ${uniq()}`, origin: 'manual' });
    await dir.putRevenue(org.id, 2025, { amount: 1200000, unavailable: false, currency: 'MAD' });
    await dir.putRevenue(org.id, 2024, { amount: 0, unavailable: false, currency: 'MAD' });
    await dir.putRevenue(org.id, 2023, { amount: null, unavailable: true, currency: 'MAD' });
    await dir.putRevenue(org.id, 2025, { amount: 1300000, unavailable: false, currency: 'EUR' });
    let p = profileOf((await dir.getRecord(org.id))!);
    assert.deepEqual(
      p.revenues.map((r) => [r.year, r.amount, r.unavailable, r.currency]),
      [[2025, 1300000, false, 'EUR'], [2024, 0, false, 'MAD'], [2023, null, true, 'MAD']],
    );
    await dir.putRevenue(org.id, 2024, { amount: null, unavailable: false, currency: 'MAD' });
    p = profileOf((await dir.getRecord(org.id))!);
    assert.deepEqual(p.revenues.map((r) => r.year), [2025, 2023]);
  });

  it('counts a fresh organisation as nothing filled in, and does not show it', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Vide ${uniq()}`, origin: 'manual' });
    const profile = profileOf(org);
    assert.equal(profileDone(profile), 0);
    assert.equal(profileStarted(profile), false);
  });

  it('leaves a person’s record out of it', async () => {
    const person = await dir.createRecord({ kind: 'person', name: `Karim ${uniq()}`, origin: 'manual' });
    assert.equal(person.maturity, '');
    assert.equal(person.teamSize, null);
    assert.deepEqual(person.revenues, []);
  });
});

describe('the second half of the fiche', () => {
  it('asks for countries only when it sells abroad', () => {
    assert.ok(!profileAsks(profileOf({ salesZone: 'morocco' })).includes('salesCountries'));
    assert.ok(profileAsks(profileOf({ salesZone: 'both' })).includes('salesCountries'));
  });

  it('asks for the rounds only once it says it was funded, and the programmes once it says it was accompanied', () => {
    assert.ok(!profileAsks(profileOf({ hasFunding: 'no' })).includes('fundings'));
    assert.ok(profileAsks(profileOf({ hasFunding: 'yes' })).includes('fundings'));
    assert.ok(!profileAsks(profileOf({ pastPrograms: 'no', currentPrograms: 'no' })).includes('programs'));
    const now = profileOf({ currentPrograms: 'yes', ceedPrograms: [{ editionId: 'e', program: 'Grow', edition: '2026', startsOn: null, endsOn: null, done: false }] });
    assert.ok(!profileMissing(now).includes('programs'), 'a programme followed here counts');
  });

  it('never adds a loan or a grant to what was raised, nor dirhams to euros', () => {
    const totals = fundingTotals([
      { id: '1', onDate: '', amount: 500000, currency: 'MAD', nature: 'equity', funderName: '', funderId: null },
      { id: '2', onDate: '', amount: 200000, currency: 'MAD', nature: 'grant', funderName: '', funderId: null },
      { id: '3', onDate: '', amount: 100000, currency: 'MAD', nature: 'honour_loan', funderName: '', funderId: null },
      { id: '4', onDate: '', amount: 50000, currency: 'EUR', nature: 'equity', funderName: '', funderId: null },
      { id: '5', onDate: '', amount: null, currency: 'MAD', nature: 'debt', funderName: '', funderId: null },
    ]);
    assert.deepEqual(totals, [
      { currency: 'MAD', equity: 500000, grant: 200000, other: 100000, total: 800000 },
      { currency: 'EUR', equity: 50000, grant: 0, other: 0, total: 50000 },
    ]);
  });

  it('refuses more women than people', () => {
    assert.ok(teamProblems(profileOf({ teamSize: 4, womenCount: 5 })).womenCount);
    assert.deepEqual(teamProblems(profileOf({ teamSize: 4, womenCount: 4 })), {});
    assert.deepEqual(teamProblems(profileOf({ womenCount: 3 })), {}, 'nothing to compare with yet');
  });
});

describe('the fiche’s lists, kept', { skip: skipWithoutServer }, () => {
  it('adds, changes and removes a product, a round and a programme — on its own page only', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Listes ${uniq()}`, origin: 'manual' });
    const other = await dir.createRecord({ kind: 'org', name: `Autre ${uniq()}`, origin: 'manual' });
    await dir.addSheetItem('products', org.id, { name: 'Datte Medjool', status: 'commercialised', price: '120 MAD/kg' });
    await dir.addSheetItem('products', org.id, { name: 'Pâte de dattes' });
    await dir.addSheetItem('fundings', org.id, { amount: 300000, currency: 'MAD', nature: 'grant', funderName: 'Innov Invest' });
    await dir.addSheetItem('programs', org.id, { name: 'Accélérateur X', status: 'done' });

    let p = profileOf((await dir.getRecord(org.id))!);
    assert.deepEqual(p.products.map((x) => x.name), ['Datte Medjool', 'Pâte de dattes'], 'in the order they were added');
    assert.equal(p.fundings[0]?.amount, 300000);
    assert.equal(p.programs[0]?.name, 'Accélérateur X');

    const first = p.products[0]!.id;
    assert.equal(await dir.changeSheetItem('products', other.id, first, { name: 'Volé' }), false, 'not through another page');
    assert.equal(await dir.changeSheetItem('products', org.id, first, { price: '130 MAD/kg' }), true);
    assert.equal(await dir.dropSheetItem('products', other.id, first), false);
    assert.equal(await dir.dropSheetItem('fundings', org.id, p.fundings[0]!.id), true);

    p = profileOf((await dir.getRecord(org.id))!);
    assert.equal(p.products[0]?.price, '130 MAD/kg');
    assert.equal(p.fundings.length, 0);
  });

  it('reads the programmes followed here from the applications that were kept, and only those', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Retenue ${uniq()}`, origin: 'manual' });
    const program = await repo.createProgram({ name: `Grow ${uniq()}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const candidate = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: null, originBlockId: null });
    assert.deepEqual(profileOf((await dir.getRecord(org.id))!).ceedPrograms, [], 'applying is not taking part');
    await repo.updateCandidate(candidate.id, { status: 'Selected' });
    const kept = profileOf((await dir.getRecord(org.id))!).ceedPrograms;
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.program, program.name);
  });

  it('has one main contact at most', async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Contact ${uniq()}`, origin: 'manual' });
    const a = await dir.createRecord({ kind: 'person', name: `Amal ${uniq()}`, origin: 'manual' });
    const b = await dir.createRecord({ kind: 'person', name: `Badr ${uniq()}`, origin: 'manual' });
    const la = await dir.linkRecords({ personId: a.id, orgId: org.id, role: 'founder' });
    const lb = await dir.linkRecords({ personId: b.id, orgId: org.id, role: 'ceo' });
    await dir.setAffiliation(la.id, { primary: true });
    await dir.setAffiliation(lb.id, { primary: true });
    const team = await dir.teamOf(org.id);
    assert.deepEqual(team.filter((m) => m.primary).map((m) => m.person.id), [b.id]);
  });
});
