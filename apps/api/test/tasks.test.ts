/**
 * Qui fait quoi, d'ici quand.
 *
 * Trois choses à tenir, et ce sont les trois décisions prises en ouvrant le
 * chantier : une tâche par destinataire pour que « fait » ait un sujet, une
 * tâche confiée à une société vue par ceux qui tiennent sa page, et le retard
 * déduit de la date plutôt que stocké.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { isLate } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { changeTask, createTasks, listTasks } from '../src/services/tasks.js';
import { restore } from '../src/services/trash.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => Math.random().toString(36).slice(2, 8);
const CEED = { id: 'acc_ceed', name: 'Reda Rzig' };

const blank = {
  detail: '', dueOn: null, recordId: null, editionId: null, blockId: null, candidateId: null,
};

describe('a task', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  const people = async () => {
    const mark = uniq();
    const org = await dir.createRecord({ kind: 'org', name: `Rafid ${mark}`, origin: 'manual' });
    const one = await dir.createRecord({ kind: 'person', name: `Karim ${mark}`, origin: 'manual' });
    const two = await dir.createRecord({ kind: 'person', name: `Sanaa ${mark}`, origin: 'manual' });
    await dir.linkRecords({ personId: one.id, orgId: org.id, access: 'admin' });
    return { org, one, two };
  };

  it('given to two people, is two tasks', async () => {
    /* Sinon « fait » ne veut rien dire : fait par qui, et l'autre doit-elle
       encore s'en occuper ? */
    const { one, two } = await people();
    const made = await createTasks({ ...blank, title: 'Relire la grille', ownerIds: [one.id, two.id] }, CEED);
    assert.equal(made.length, 2);
    assert.deepEqual(made.map((t) => t.ownerName).sort(), [one.name, two.name].sort());
  });

  it('given to a company, reaches whoever holds its page', async () => {
    const { org, one, two } = await people();
    await createTasks({ ...blank, title: 'Envoyer le RIB', ownerIds: [org.id] }, CEED);

    const hers = await listTasks({ ownerIds: [one.id, ...(await dir.orgIdsOf(one.id))], open: true });
    assert.ok(hers.some((t) => t.title === 'Envoyer le RIB'), 'celle qui tient la page la voit');
    const theirs = await listTasks({ ownerIds: [two.id, ...(await dir.orgIdsOf(two.id))], open: true });
    assert.ok(!theirs.some((t) => t.title === 'Envoyer le RIB'), 'et personne d’autre');
  });

  it('counts late from the day after, not the day itself', async () => {
    /* Quelqu'un a jusqu'au soir : une tâche qui rougit au réveil du jour dit
       est une tâche qui a tort. */
    const today = '2026-10-12';
    assert.equal(isLate({ dueOn: today, state: 'open' }, today), false);
    assert.equal(isLate({ dueOn: '2026-10-11', state: 'open' }, today), true);
    assert.equal(isLate({ dueOn: '2026-10-11', state: 'done' }, today), false, 'faite, elle n’est plus en retard');
  });

  it('remembers the last hand that closed it, not the first', async () => {
    const { one } = await people();
    const [task] = await createTasks({ ...blank, title: 'Appeler le notaire', ownerIds: [one.id] }, CEED);
    const done = await changeTask(task!.id, { state: 'done' }, { id: one.id, name: 'Karim' });
    assert.equal(done?.doneByName, 'Karim');
    assert.ok(done?.doneAt);

    const back = await changeTask(task!.id, { state: 'open' }, CEED);
    assert.equal(back?.doneAt, null, 'rouverte, elle n’est plus close par personne');
    assert.equal(back?.doneByName, '');

    const again = await changeTask(task!.id, { state: 'done' }, { id: 'x', name: 'Rima Arrach' });
    assert.equal(again?.doneByName, 'Rima Arrach', 'la dernière main, pas la première');
  });

  it('leaves the lists with whoever was binned, and comes back with them', async () => {
    /* La corbeille ne supprime pas, elle met de côté — trente jours. Une tâche
       confiée à quelqu'un qu'on vient de mettre de côté n'a rien à faire dans
       une liste de choses à faire, et elle doit revenir intacte s'il revient. */
    const { one } = await people();
    await createTasks({ ...blank, title: 'Relancer', ownerIds: [one.id] }, CEED);
    assert.equal((await listTasks({ ownerIds: [one.id] })).length, 1);

    const plan = (await dir.removalPlan(one.id))!;
    const batch = await dir.removeRecord(one.id, plan, 'test');
    assert.equal((await listTasks({ ownerIds: [one.id] })).length, 0, 'plus dans la liste');

    await restore(batch);
    assert.equal((await listTasks({ ownerIds: [one.id] })).length, 1, 'et de retour avec elle');
  });
});
