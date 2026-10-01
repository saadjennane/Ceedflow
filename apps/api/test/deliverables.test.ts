/**
 * What a due diligence asks of whom.
 *
 * The two rules that make the brick what it is and not a second form: only the
 * startups that got past the selection before it are asked, and an item only
 * counts as given when something is actually in it. Both run against a server,
 * because both are read out of the database in one go.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { deliverableView } from '../src/services/deliverables.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

const ITEMS = [
  { id: 'rc', type: 'file', label: 'Registre de commerce', help: '', required: true, options: [], showInTable: false, pageId: '' },
  { id: 'nb', type: 'number', label: 'Effectif', help: '', required: true, options: [], showInTable: false, pageId: '' },
  { id: 'cac', type: 'short_text', label: 'Commissaire', help: '', required: false, options: [], showInTable: false, pageId: '' },
];

describe('what a deliverables block asks, and of whom', { skip: skipWithoutServer }, () => {
  const setUp = async () => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const shortlist = await repo.createBlock(phase.id, 'selection', 'Shortlist');
    const due = await repo.createBlock(phase.id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });

    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
      return repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    };
    const kept = await candidacy('Rafid Tech');
    const cut = await candidacy('Atlas Mobility');
    // The shortlist keeps one of them, by hand.
    await repo.setOutcome(shortlist.id, kept.id, 'pass', true);
    return { due, kept, cut };
  };

  it('asks only the startups the selection kept', async () => {
    const { due, kept, cut } = await setUp();
    const view = (await deliverableView(due.id))!;
    assert.deepEqual(view.rows.map((r) => r.candidate.id), [kept.id], 'one of the two');
    assert.ok(!view.rows.some((r) => r.candidate.id === cut.id), 'and not the one that was cut');
  });

  it('counts a file against the required items only', async () => {
    const { due, kept } = await setUp();
    const before = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(before.required, 2, 'two of the three hold the file open');
    assert.equal(before.done, 0);
    assert.equal(before.complete, false);

    await repo.saveReturn(due.id, kept.id, 'cac', 'Cabinet Atlas');
    const optional = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(optional.done, 0, 'an optional answer moves nothing');
    assert.equal(optional.complete, false);

    await repo.saveReturn(due.id, kept.id, 'rc', { uploadId: 'up_1', filename: 'rc.pdf' });
    await repo.saveReturn(due.id, kept.id, 'nb', 12);
    const done = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(done.done, 2);
    assert.equal(done.complete, true, 'the file is complete without the optional one');
  });

  it('takes an answer back out when it is cleared', async () => {
    // An item emptied is an item not handed in. A row left behind saying
    // "returned, with nothing in it" would count as given on every screen.
    const { due, kept } = await setUp();
    await repo.saveReturn(due.id, kept.id, 'nb', 12);
    assert.equal((await deliverableView(due.id))!.rows[0]!.done, 1);

    await repo.saveReturn(due.id, kept.id, 'nb', null);
    const after = (await deliverableView(due.id))!.rows[0]!;
    assert.equal(after.done, 0);
    assert.ok(!after.returns.some((r) => r.itemId === 'nb'), 'and nothing is left behind');
  });

  it('keeps the day it first arrived when a correction follows', async () => {
    const { due, kept } = await setUp();
    await repo.saveReturn(due.id, kept.id, 'nb', 12);
    const first = (await deliverableView(due.id))!.rows[0]!.returns[0]!.returnedAt;

    await repo.saveReturn(due.id, kept.id, 'nb', 14);
    const again = (await deliverableView(due.id))!.rows[0]!.returns[0]!;
    assert.equal(again.value, 14, 'the correction lands');
    assert.equal(again.returnedAt, first, 'a correction does not make it newly arrived');
  });

  it('stops asking a startup that withdraws', async () => {
    const { due, kept } = await setUp();
    await repo.updateCandidate(kept.id, { status: 'Withdrawn' });
    const view = (await deliverableView(due.id))!;
    assert.equal(view.rows.length, 0, 'chasing documents from somebody who has left is chasing nobody');
  });
});
