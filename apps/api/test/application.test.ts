/**
 * L'accusé de réception d'une candidature.
 *
 * It answers one question — did you get it — asked the minute after
 * submitting. On four hundred and forty files it is the single piece of
 * correspondence that removes the most support work, and it was the one the
 * platform never sent.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { acknowledge } from '../src/services/applicationNotices.js';
import { letters } from '../src/services/mail.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('acknowledging an application', { skip: skipWithoutServer }, () => {
  const setUp = async (over: Record<string, unknown> = {}) => {
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const form = await repo.createBlock(track.phases[0].id, 'application', 'Candidature');
    await repo.updateBlock(form.id, { config: { fields: [{ id: 'd', type: 'long_text', label: 'Quoi ?' }], ...over } });

    const org = await dir.createRecord({ kind: 'org', name: `Rafid Tech ${stamp}`, origin: 'manual' });
    const email = `rafid.${stamp}@example.test`;
    const person = await dir.createRecord({ kind: 'person', name: `Karim ${stamp}`, email, origin: 'manual' });
    const candidate = await repo.createCandidate({
      editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id, originBlockId: form.id,
    });
    return { form, candidate, email, org };
  };

  it('writes a receipt the moment it is filed', async () => {
    const { form, candidate, email, org } = await setUp();
    await acknowledge(form.id, candidate.id);

    const [letter] = await letters({ email });
    assert.equal(letter?.kind, 'application_received');
    assert.match(letter!.body, new RegExp(org.name));
    assert.match(letter!.body, /The Builders — Cohorte 1/, 'named the way an applicant knows it');
  });

  it('says nothing when the receipt is switched off', async () => {
    const { form, candidate, email } = await setUp({ confirmationEmail: false });
    await acknowledge(form.id, candidate.id);
    assert.equal((await letters({ email })).length, 0);
  });

  it('tells whoever at CEED asked to hear about each one', async () => {
    const watcher = `programme.${Date.now()}@ceed.test`;
    const { form, candidate, org } = await setUp({ notifyOnSubmit: [watcher] });
    await acknowledge(form.id, candidate.id);

    const [inside] = await letters({ email: watcher });
    assert.equal(inside?.kind, 'application_submitted');
    assert.match(inside!.subject, new RegExp(org.name), 'who applied, in the subject');
  });

  it('gives CEED what CEED needs, not a copy of the applicant’s receipt', async () => {
    /* Two audiences, two letters — the same rule as everywhere else. */
    const watcher = `programme.${Date.now()}@ceed.test`;
    const { form, candidate, email } = await setUp({ notifyOnSubmit: [watcher] });
    await acknowledge(form.id, candidate.id);
    const [inside] = await letters({ email: watcher });
    const [outside] = await letters({ email });
    assert.notEqual(inside!.body, outside!.body);
  });

  it('says nothing to a candidacy with no address, rather than failing the submission', async () => {
    const stamp = Date.now();
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const form = await repo.createBlock(track.phases[0].id, 'application', 'Candidature');
    const org = await dir.createRecord({ kind: 'org', name: `Sans adresse ${stamp}`, origin: 'manual' });
    const candidate = await repo.createCandidate({
      editionId: edition.id, trackId: track.id, orgId: org.id, originBlockId: form.id,
    });
    await acknowledge(form.id, candidate.id);
    assert.equal((await letters({ candidateId: candidate.id })).length, 0);
  });
});
