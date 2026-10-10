/**
 * Plusieurs numéros pour la même personne, et pour une société.
 *
 * Un fondateur a un portable et un fixe ; une société a un standard et le
 * numéro qu'elle donne à ses clients. Il n'y avait qu'une case, alors le
 * second s'écrivait dans la description — ou nulle part, et c'est le jour où
 * l'on cherche à joindre quelqu'un qu'on s'en aperçoit.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createRecordInput } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;

describe('several numbers for the same person', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('keeps them all, in the order they were given', async () => {
    const who = await dir.createRecord({
      kind: 'person', name: `Sanaa ${uniq()}`, origin: 'manual',
      phones: ['+212 6 12 34 56 78', '05 22 00 11 22'],
    });
    assert.deepEqual(who.phones, ['+212 6 12 34 56 78', '05 22 00 11 22']);
  });

  it('shows the first wherever there is room for only one', async () => {
    /* Le tableau des candidatures, un export, une recherche : une douzaine
       d'endroits lisent `phone`, et il ne peut pas diverger de la liste
       puisque la base le calcule. */
    const who = await dir.createRecord({
      kind: 'person', name: `Karim ${uniq()}`, origin: 'manual',
      phones: ['+212 6 11 11 11 11', '+212 5 22 22 22 22'],
    });
    assert.equal(who.phone, '+212 6 11 11 11 11');

    await dir.updateRecord(who.id, { phones: ['+212 5 22 22 22 22', '+212 6 11 11 11 11'] });
    const after = await dir.getRecord(who.id);
    assert.equal(after!.phone, '+212 5 22 22 22 22', 'remonter un numéro change celui qu’on donne');
  });

  it('finds somebody by a number that is not the first', async () => {
    const mark = uniq().replace(/\D/g, '').slice(-6);
    const who = await dir.createRecord({
      kind: 'org', name: `Rafid ${uniq()}`, origin: 'manual',
      phones: ['+212 5 00 00 00 00', `+212 6 ${mark}`],
    });
    const found = await dir.listRecords({ kind: 'org', q: mark });
    assert.ok(found.some((r) => r.id === who.id), 'cherché sur le second, trouvé quand même');
  });

  it('leaves nothing behind for somebody who has none', async () => {
    const who = await dir.createRecord({ kind: 'person', name: `Sans ${uniq()}`, origin: 'manual' });
    assert.deepEqual(who.phones, []);
    assert.equal(who.phone, '');
  });

  it('drops the empty lines and refuses what is not a number', () => {
    /* Une ligne ajoutée puis pas remplie n'est pas un numéro : la refuser
       ferait un message d'erreur pour un clic de trop. */
    const kept = createRecordInput.parse({ kind: 'person', name: 'Sanaa', phones: ['06 12 34 56 78', '  ', ''] });
    assert.deepEqual(kept.phones, ['06 12 34 56 78']);

    const bad = createRecordInput.safeParse({ kind: 'person', name: 'Sanaa', phones: ['06 12 34 56 78', 'à venir'] });
    assert.equal(bad.success, false, 'un seul numéro fautif suffit à refuser');
  });
});
