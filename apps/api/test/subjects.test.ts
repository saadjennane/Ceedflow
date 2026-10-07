/**
 * L'objet d'une lettre appartient à CEED, comme son corps.
 *
 * Il était fabriqué dans le code — « Due diligence admin — Rafid Tech » — et
 * c'est pourtant la seule ligne qu'un destinataire lit avant de décider s'il
 * ouvre. Ce qui est tenu ici : qu'il se règle, qu'il se remplisse avec les
 * mêmes valeurs que le corps, et qu'un champ vidé par mégarde ne fasse pas
 * partir un message sans objet.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parseBlockConfig, SUBJECT_DELIVERABLE_REQUEST, type DeliverableConfig } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { deliverableNotices } from '../src/services/deliverables.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const ITEMS = [
  { id: 'rc', type: 'file', label: 'Registre de commerce', help: '', required: true, options: [], showInTable: false, pageId: '' },
];

describe('the subject of what goes out', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  const setUp = async (subjects?: Record<string, string>) => {
    const program = await repo.createProgram({ name: `The Builders ${Date.now()}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0];
    const phase = track.phases[0];
    const due = await repo.createBlock(phase.id, 'deliverable', 'Due diligence admin');
    await repo.updateBlock(due.id, {
      config: { visibility: 'open', items: ITEMS, ...(subjects ? { messages: { subjects } } : {}) },
    });
    const org = await dir.createRecord({ kind: 'org', name: `Rafid Tech ${Date.now()}`, origin: 'manual' });
    const candidate = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    await repo.updateCandidate(candidate.id, { email: 'karim@rafid.test' });
    return { due, candidate, orgName: org.name };
  };

  it('arrives already written, and it is what used to be hard-coded', async () => {
    const { due } = await setUp();
    const config = (await repo.getBlock(due.id))!.config as DeliverableConfig;
    assert.equal(config.messages.subjects.request, SUBJECT_DELIVERABLE_REQUEST);
    assert.equal(config.messages.subjects.rejected, '{{phase}} — {{piece}} à renvoyer');
  });

  it('fills the subject with the same values as the letter', async () => {
    const { due, candidate, orgName } = await setUp();
    const letter = await deliverableNotices.letter(due.id, 'request', candidate.id, 'Bonjour {{startup}}.');
    assert.equal(letter?.subject, `Due diligence admin — ${orgName}`);
    assert.ok(letter?.body.includes(orgName), 'et le corps parle de la même startup');
  });

  it('takes the wording CEED gives it', async () => {
    const { due, candidate, orgName } = await setUp({
      request: 'Votre dossier {{startup}} — pièces à transmettre',
    });
    const letter = await deliverableNotices.letter(due.id, 'request', candidate.id, 'Bonjour.');
    assert.equal(letter?.subject, `Votre dossier ${orgName} — pièces à transmettre`);
  });

  it('never sends a letter with no subject at all', async () => {
    /* Vidé à la main, le champ retombe sur le nom de la brique : un message
       sans objet se lit comme un spam, et personne n'a voulu ça en effaçant. */
    const { due, candidate } = await setUp({ request: '   ' });
    const letter = await deliverableNotices.letter(due.id, 'request', candidate.id, 'Bonjour.');
    assert.equal(letter?.subject, 'Due diligence admin');
  });

  it('leaves a block configured before this existed exactly as it was', async () => {
    /* Une brique enregistrée avant ce champ n'a pas de `subjects` dans sa
       config : elle doit repartir avec les défauts, pas avec du vide. */
    const parsed = parseBlockConfig('deliverable', {
      visibility: 'open',
      messages: { request: 'Bonjour {{prenom}}.', access: '' },
    }) as DeliverableConfig;
    assert.equal(parsed.messages.request, 'Bonjour {{prenom}}.');
    assert.equal(parsed.messages.subjects.request, SUBJECT_DELIVERABLE_REQUEST);
  });
});
