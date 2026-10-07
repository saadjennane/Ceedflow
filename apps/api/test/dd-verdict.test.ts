/**
 * Récupérer n'est pas juger.
 *
 * La brique Deliverables compte : telle pièce est arrivée, telle autre non —
 * et parfois on demande des documents sans les évaluer, juste pour les avoir.
 * Un dossier complet dont les statuts sont mauvais ne doit pourtant pas
 * passer, et « incomplet » serait un mensonge pour le dire.
 *
 * D'où une Évaluation entre les deux : elle lit le dossier et lui donne un
 * mot. Ce que ces tests tiennent, c'est que la Sélection lise ce mot-là, et
 * que la complétude seule n'ouvre plus la porte.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { selectionSource } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { passSetOf } from '../src/services/selection.js';
import { setOutcomeByHand } from '../src/services/scoring.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const ITEMS = [
  { id: 'rc', type: 'file', label: 'Registre de commerce', help: '', required: true, options: [], showInTable: false, pageId: '' },
  { id: 'nb', type: 'number', label: 'Effectif', help: '', required: true, options: [], showInTable: false, pageId: '' },
];

const VERDICTS = [
  { id: 'ok', label: 'Dossier validé', tone: 'ok', minScore: null, whenSplit: false },
  { id: 'ko', label: 'Dossier rejeté', tone: 'stop', minScore: null, whenSplit: false },
];

describe('a due diligence that is read, not only counted', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  const setUp = async () => {
    const program = await repo.createProgram({ name: `The Builders ${Date.now()}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];

    const shortlist = await repo.createBlock(phase.id, 'selection', 'Passage au jury');
    const due = await repo.createBlock(phase.id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });
    /* L'examen des pièces : personne ne la note, CEED la tranche à la main. */
    const review = await repo.createBlock(phase.id, 'evaluation', 'Revue des pièces');
    await repo.updateBlock(review.id, { config: { method: 'verdict', outcomes: VERDICTS } });
    const final = await repo.createBlock(phase.id, 'selection', 'Selection finale');
    await repo.updateBlock(final.id, { config: { passOutcomeIds: ['ok'] } });

    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: `${orgName} ${Date.now()}`, origin: 'manual' });
      return repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    };
    const kept = await candidacy('Rafid Tech');
    const doubted = await candidacy('Nakhla Bio');
    for (const c of [kept, doubted]) await repo.setOutcome(shortlist.id, c.id, 'pass', true);

    /* Les deux dossiers sont complets : c'est tout l'objet du test. */
    for (const c of [kept, doubted]) {
      for (const item of ['rc', 'nb']) {
        await repo.saveReturn(due.id, c.id, item, item === 'nb' ? 12 : { uploadId: 'u', filename: 'f.pdf' });
        await repo.reviewReturn(due.id, c.id, item, 'accepted', '');
      }
    }

    const fresh = (await repo.getEditionDetail(edition.id))!.tracks.find((t) => t.id === track.id)!;
    const blockIn = (id: string) => fresh.phases[0].blocks.find((b) => b.id === id)!;
    return { edition, track: fresh, blockIn, due, review, final, kept, doubted };
  };

  it('lets the selection read the examination, not the count', async () => {
    const { track, blockIn, review, final } = await setUp();
    const source = selectionSource(track, blockIn(final.id));
    assert.equal(source?.id, review.id, 'the word given to the file, not whether it is complete');
  });

  it('holds a complete file back until somebody has said something about it', async () => {
    const { track, blockIn, final, kept, doubted } = await setUp();
    const all = await repo.listCandidates(track.editionId, track.id);
    const passed = await passSetOf(track, blockIn(final.id), all);
    /* Les deux dossiers sont complets, et pourtant personne ne passe : c'est
       exactement ce qu'on voulait — la complétude n'est plus un verdict. */
    assert.equal(passed.has(kept.id), false);
    assert.equal(passed.has(doubted.id), false);
  });

  it('passes the one that was validated, and keeps the other out', async () => {
    const { track, blockIn, review, final, kept, doubted } = await setUp();
    const block = (await repo.getBlock(review.id))!;
    await setOutcomeByHand(block, kept.id, 'ok');
    await setOutcomeByHand(block, doubted.id, 'ko');

    const all = await repo.listCandidates(track.editionId, track.id);
    const passed = await passSetOf(track, blockIn(final.id), all);
    assert.equal(passed.has(kept.id), true, 'validé passe');
    assert.equal(passed.has(doubted.id), false, 'rejeté reste, dossier complet ou non');
  });
});
