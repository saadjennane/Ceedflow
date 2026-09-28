/**
 * What a committee card says about itself.
 *
 * Both numbers come from one query against a jsonb column, unnested and
 * counted distinct. That is precisely the kind of SQL PGlite forgives and a
 * server does not, so these run against a server or they say they were
 * skipped.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as repo from '../src/db/repo.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('counting a committee', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('counts each juror once, however many sittings they sit on', async () => {
    // The jury is jsonb, so the count unnests it — the kind of query PGlite
    // forgives and a server does not, which is why this runs against one.
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const phase = detail!.tracks[0].phases[0];
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');

    const sitting = (name: string, jury: string[]) =>
      repo.createSession(committee.id, {
        name, heldOn: '2026-10-28',
        windows: [{ startsAt: '09:00', endsAt: '12:30' }], minutesPerStartup: 25, jury,
      });
    await sitting('Morning', ['rec_a', 'rec_b', 'rec_c']);
    // rec_a judges twice; that is one person, not two.
    await sitting('Afternoon', ['rec_a', 'rec_d']);

    const again = await repo.getEditionDetail(edition.id);
    const card = again!.tracks[0].phases[0].blocks.find((b) => b.id === committee.id)!;
    assert.equal(card.sittings, 2, 'two sittings');
    assert.equal(card.jurors, 4, 'four people, five seats');
  });

  it('says nobody rather than nothing when a sitting has no jury', async () => {
    const program = await repo.createProgram({ name: 'Empty' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const phase = detail!.tracks[0].phases[0];
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');
    await repo.createSession(committee.id, {
      name: 'Morning', heldOn: '2026-10-28',
      windows: [{ startsAt: '09:00', endsAt: '12:30' }], minutesPerStartup: 25, jury: [],
    });

    const again = await repo.getEditionDetail(edition.id);
    const card = again!.tracks[0].phases[0].blocks.find((b) => b.id === committee.id)!;
    assert.equal(card.sittings, 1, 'the sitting still counts');
    assert.equal(card.jurors, 0, 'and nobody is on it');
  });
});
