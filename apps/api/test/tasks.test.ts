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
import { isLate, progress } from '@ceed/shared';
import { all } from '../src/db/client.js';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { teamOf } from '../src/services/people.js';
import {
  addItems, changeItem, changeTask, createTasks, dropTask, getTask, listTasks, orderItems,
} from '../src/services/tasks.js';
import { restore } from '../src/services/trash.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => Math.random().toString(36).slice(2, 8);
const CEED = { id: 'acc_ceed', name: 'Reda Rzig' };

const blank = {
  detail: '', dueOn: null, recordId: null, editionId: null, blockId: null, candidateId: null,
};

describe('a task', { skip: skipWithoutServer }, () => {
  before(migrate);

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

describe('a checklist', { skip: skipWithoutServer }, () => {
  before(migrate);

  const someone = async () =>
    dir.createRecord({ kind: 'person', name: `Karim ${uniq()}`, origin: 'manual' });

  it('is copied to each person the task is given to', async () => {
    /* Chacun coche la sienne, comme chacun close la sienne. */
    const [one, two] = [await someone(), await someone()];
    const made = await createTasks(
      { ...blank, title: 'Préparer le jury', ownerIds: [one.id, two.id], items: ['Grille', ' ', 'Salle'] },
      CEED,
    );
    assert.equal(made.length, 2);
    for (const task of made) assert.deepEqual(task.items.map((i) => i.label), ['Grille', 'Salle'], 'les lignes vides en moins');
    assert.notEqual(made[0]!.items[0]!.id, made[1]!.items[0]!.id);

    await changeItem(made[0]!.id, made[0]!.items[0]!.id, { done: true }, CEED);
    const other = await getTask(made[1]!.id);
    assert.equal(progress(other!).done, 0, 'cocher la sienne ne coche pas celle de l’autre');
  });

  it('says who ticked a line, and forgets it when unticked', async () => {
    const [task] = await createTasks({ ...blank, title: 'Dossier', ownerIds: [(await someone()).id], items: ['RIB'] }, CEED);
    const line = task!.items[0]!;
    const ticked = await changeItem(task!.id, line.id, { done: true }, { id: 'x', name: 'Sanaa' });
    assert.equal(ticked?.done, true);
    assert.equal(ticked?.doneByName, 'Sanaa');
    assert.ok(ticked?.doneAt);

    const back = await changeItem(task!.id, line.id, { done: false }, CEED);
    assert.equal(back?.doneByName, '');
    assert.equal(back?.doneAt, null);
  });

  it('puts the task in progress on the first tick, only from to do', async () => {
    const owner = (await someone()).id;
    const [fresh] = await createTasks({ ...blank, title: 'A', ownerIds: [owner], items: ['un', 'deux'] }, CEED);
    await changeItem(fresh!.id, fresh!.items[0]!.id, { done: true }, CEED);
    assert.equal((await getTask(fresh!.id))?.state, 'doing');

    const [stuck] = await createTasks({ ...blank, title: 'B', ownerIds: [owner], items: ['un'] }, CEED);
    await changeTask(stuck!.id, { state: 'stuck' }, CEED);
    await changeItem(stuck!.id, stuck!.items[0]!.id, { done: true }, CEED);
    assert.equal((await getTask(stuck!.id))?.state, 'stuck', 'bloquée, elle le reste');
  });

  it('does not close the task when every line is ticked', async () => {
    /* Une checklist dit rarement tout ce qu'il y a à faire. */
    const [task] = await createTasks({ ...blank, title: 'C', ownerIds: [(await someone()).id], items: ['seule'] }, CEED);
    await changeItem(task!.id, task!.items[0]!.id, { done: true }, CEED);
    const after = await getTask(task!.id);
    assert.deepEqual(progress(after!), { done: 1, total: 1 });
    assert.notEqual(after?.state, 'done');
  });

  it('keeps the order it is given, and adds at the end', async () => {
    const [task] = await createTasks({ ...blank, title: 'D', ownerIds: [(await someone()).id], items: ['a', 'b', 'c'] }, CEED);
    const [a, b, c] = task!.items;
    await orderItems(task!.id, [c!.id, a!.id, b!.id]);
    await addItems(task!.id, ['d']);
    assert.deepEqual((await getTask(task!.id))?.items.map((i) => i.label), ['c', 'a', 'b', 'd']);
  });

  it('will not touch a line through another task', async () => {
    const owner = (await someone()).id;
    const [mine] = await createTasks({ ...blank, title: 'E', ownerIds: [owner], items: ['à moi'] }, CEED);
    const [other] = await createTasks({ ...blank, title: 'F', ownerIds: [owner] }, CEED);
    assert.equal(await changeItem(other!.id, mine!.items[0]!.id, { done: true }, CEED), null);
  });

  it('goes with its task', async () => {
    const [task] = await createTasks({ ...blank, title: 'G', ownerIds: [(await someone()).id], items: ['x'] }, CEED);
    await dropTask(task!.id);
    assert.equal((await all('select id from task_items where task_id = $1', [task!.id])).length, 0);
  });
});

describe('the team of a programme', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('has four groups, each from where it really lives', async () => {
    /* Les quatre viennent d'endroits différents — des comptes, des séances, du
       banc de l'édition, des candidatures — et c'est pour ça que les
       rassembler est un service plutôt qu'une requête recopiée. */
    const mark = uniq();
    const program = await repo.createProgram({ name: `The Builders ${mark}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;

    const mentor = await dir.createRecord({ kind: 'person', name: `Mentor ${mark}`, roles: ['Mentor'], origin: 'manual' });
    const juror = await dir.createRecord({ kind: 'person', name: `Jure ${mark}`, roles: ['Jury'], origin: 'manual' });
    const org = await dir.createRecord({ kind: 'org', name: `Startup ${mark}`, origin: 'manual' });
    await repo.updateEdition(edition.id, { mentors: [mentor.id] });
    const panel = await repo.createBlock(track.phases[0]!.id, 'committee', 'Jury Day');
    await repo.createSession(panel.id, { name: 'Jour 1', jury: [juror.id] } as never);
    await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });

    const team = await teamOf(edition.id);
    const of = (key: string) => team.find((g) => g.key === key)!.people.map((p) => p.name);
    assert.deepEqual(of('mentors'), [mentor.name]);
    assert.deepEqual(of('jury'), [juror.name]);
    assert.deepEqual(of('startups'), [org.name]);
    /* Et la startup est rendue comme une organisation : une tâche adressée à
       la société est vue par tous ceux qui tiennent sa page. */
    assert.equal(team.find((g) => g.key === 'startups')!.people[0]!.kind, 'org');
  });

  it('shows, on the edition, what was asked about one of its startups', async () => {
    /* Le lien est la candidature — « le dossier de Rafid Tech dans cette
       cohorte » — et non l'édition. Sans cette lecture, la tâche n'existerait
       que sur la fiche de la startup, c'est-à-dire nulle part où on la
       cherche. */
    const mark = uniq();
    const program = await repo.createProgram({ name: `The Builders ${mark}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const org = await dir.createRecord({ kind: 'org', name: `Rafid ${mark}`, origin: 'manual' });
    const candidate = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id });
    const who = await dir.createRecord({ kind: 'person', name: `Rima ${mark}`, origin: 'manual' });

    await createTasks(
      { ...blank, title: 'Vérifier le registre', ownerIds: [who.id], candidateId: candidate.id },
      CEED,
    );

    const [task] = await listTasks({ editionId: edition.id });
    assert.equal(task?.title, 'Vérifier le registre');
    assert.equal(task?.aboutName, org.name, 'et elle se lit au nom de la startup');
  });

  it('leaves out a startup that was not kept', async () => {
    const mark = uniq();
    const program = await repo.createProgram({ name: `The Builders ${mark}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const out = await dir.createRecord({ kind: 'org', name: `Écartée ${mark}`, origin: 'manual' });
    const candidate = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: out.id });
    await repo.updateCandidate(candidate.id, { status: 'Not selected' });

    const team = await teamOf(edition.id);
    assert.deepEqual(team.find((g) => g.key === 'startups')!.people, [], 'une refusée n’est plus de l’équipe');
  });
});
