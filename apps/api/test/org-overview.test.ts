/**
 * Ce que l'équipe CEED lit en ouvrant la fiche d'une organisation : ses
 * programmes avec un lien vers chacun, et ce qui coince.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { orgOverview } from '../src/services/orgOverview.js';
import { editionSetup, launchMoment, saveEditionSetup, saveProgramSetup } from '../src/services/reporting.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('an organisation, as CEED opens it', { skip: skipWithoutServer }, () => {
  it('lists its programmes with a way into each, and says what is stuck', async () => {
    const mark = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const due = await repo.createBlock(track.phases[0]!.id, 'deliverable', 'Pièces');
    await repo.updateBlock(due.id, {
      config: {
        visibility: 'open', closesAt: '2020-01-01',
        items: [{ id: 'rc', type: 'file', label: 'RC', help: '', required: true, options: [], showInTable: false, pageId: '' }],
      },
    });
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    const c = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    await repo.updateCandidate(c.id, { status: 'Selected' });

    await saveProgramSetup(program.id, {
      indicators: [{ id: 'i', type: 'number', label: 'Effectif', help: '', required: false, options: [], showInTable: false, pageId: '' }],
    });
    const start = (await editionSetup(edition.id)).moments[0]!;
    await saveEditionSetup(edition.id, { moments: [{ ...start, opensOn: '2020-01-01', closesOn: '2020-02-01' }] });
    await launchMoment(edition.id, start.id);

    const o = (await orgOverview(org.id))!;
    assert.equal(o.candidacies.length, 1);
    assert.equal(o.candidacies[0]!.status, 'Selected');
    assert.ok(o.candidacies[0]!.href.includes(`candidate=${c.id}`), 'opens the candidacy in its programme');
    const pieces = o.asked.find((a) => a.kind === 'deliverable');
    assert.ok(pieces, 'the pieces asked of it, as its own Home says');
    assert.equal(pieces!.status, 'late');
    assert.ok(pieces!.workHref?.includes(`block=${due.id}`), 'and where CEED follows them');
    assert.equal(o.asked.find((a) => a.kind === 'kpi')?.status, 'late', 'a measure not given');
    assert.ok(o.alerts.some((a) => a.kind === 'profile'), 'the sheet half empty');
    assert.equal(await orgOverview((await dir.createRecord({ kind: 'person', name: 'X', origin: 'manual' })).id), null);
  });
});
