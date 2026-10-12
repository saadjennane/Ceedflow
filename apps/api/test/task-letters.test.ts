/**
 * Prévenir quelqu'un qu'on attend quelque chose de lui.
 *
 * Ce qui porte le risque ici n'est pas d'écrire — c'est d'écrire deux fois, et
 * d'écrire à la mauvaise personne. Une tâche confiée à une société n'a pas
 * d'adresse à elle ; un rappel de retard qui repart tous les matins est du
 * courrier qu'on filtre au bout de trois jours ; et une lettre qui n'a pas pu
 * partir doit laisser la tâche en état d'être annoncée.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { TASK_GIVEN_DEFAULT, fillTemplate } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { accountOfRecord, createAccount } from '../src/services/auth.js';
import { setHouseLetter } from '../src/services/houseLetters.js';
import { letters } from '../src/services/mail.js';
import { changeTask, createTasks } from '../src/services/tasks.js';
import { sendLateDigests, tellOwner, whoHears } from '../src/services/taskNotices.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => Math.random().toString(36).slice(2, 8);
const CEED = { id: 'acc_ceed', name: 'Rima Arrach' };
const blank = { detail: '', dueOn: null, recordId: null, editionId: null, blockId: null, candidateId: null };

const day = (shift: number) => new Date(Date.now() + shift * 86400000).toISOString().slice(0, 10);
/** Après l'heure d'envoi, pour que la garde du matin ne soit pas ce qu'on teste. */
const MORNING = new Date('2026-10-12T09:00:00Z');

const give = (ownerId: string, title: string, dueOn: string | null = null) =>
  createTasks({ ...blank, title, dueOn, ownerIds: [ownerId] }, CEED);

describe('telling somebody a task is theirs', { skip: skipWithoutServer }, () => {
  before(migrate);

  it('writes to the person it was given to, with the house letter', async () => {
    const mark = uniq();
    const who = await dir.createRecord({
      kind: 'person', name: `Karim Benali ${mark}`, emails: [`karim.${mark}@example.test`], origin: 'manual',
    });
    const [task] = await give(who.id, 'Relire la grille', day(4));

    assert.equal((await tellOwner(task!.id)).told, true);

    const [sent] = await letters({ email: `karim.${mark}@example.test` });
    assert.equal(sent!.kind, 'task_given');
    assert.match(sent!.subject, /Relire la grille/);
    assert.match(sent!.body, /Bonjour Karim,/);
    assert.match(sent!.body, /Rima Arrach vous a confié/);
    assert.match(sent!.body, /À faire pour le/, 'la date, écrite en toutes lettres');
  });

  it('says nothing twice about the same task', async () => {
    /* Deux clics, un redémarrage, un double appel : la ligne est réclamée
       avant l'écriture, et la seconde fois ne trouve rien à réclamer. */
    const mark = uniq();
    const who = await dir.createRecord({
      kind: 'person', name: `Sanaa ${mark}`, emails: [`sanaa.${mark}@example.test`], origin: 'manual',
    });
    const [task] = await give(who.id, 'Envoyer le RIB');

    const [first, second] = await Promise.all([tellOwner(task!.id), tellOwner(task!.id)]);
    const told = [first, second].filter((r) => r.told);
    assert.equal(told.length, 1, 'une seule des deux a écrit');
    assert.equal((await letters({ email: `sanaa.${mark}@example.test` })).length, 1);
  });

  it('leaves a task given even when nobody can be written to', async () => {
    const mark = uniq();
    const who = await dir.createRecord({ kind: 'person', name: `Sans adresse ${mark}`, origin: 'manual' });
    const [task] = await give(who.id, 'Rappeler le notaire');

    assert.deepEqual(await tellOwner(task!.id), { told: false, why: 'no_email' });
    assert.deepEqual(await whoHears(who.id), {
      email: '', toName: `Sans adresse ${mark}`, accountFor: null, blocked: 'no_email',
    });
  });

  it('writes to whoever holds the page when the company has no address', async () => {
    /* « Rafid Tech doit envoyer son RIB » n'est à personne en particulier —
       mais la lettre arrive bien dans une boîte, et c'est celle de qui tient
       la page. Adressée à cette personne, pas à la société. */
    const mark = uniq();
    const org = await dir.createRecord({ kind: 'org', name: `Rafid Tech ${mark}`, origin: 'manual' });
    const founder = await dir.createRecord({
      kind: 'person', name: `Zineb Alaoui ${mark}`, emails: [`zineb.${mark}@example.test`], origin: 'manual',
    });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });

    const heard = await whoHears(org.id);
    assert.equal(heard.email, `zineb.${mark}@example.test`);
    assert.equal(heard.toName, `Zineb Alaoui ${mark}`);

    const [task] = await give(org.id, 'Envoyer le RIB');
    assert.equal((await tellOwner(task!.id)).told, true);
    assert.match((await letters({ email: `zineb.${mark}@example.test` }))[0]!.body, /Bonjour Zineb,/);
  });

  it('prefers the company’s own address when it has one', async () => {
    const mark = uniq();
    const org = await dir.createRecord({
      kind: 'org', name: `Innolia ${mark}`, emails: [`contact.${mark}@example.test`], origin: 'manual',
    });
    const founder = await dir.createRecord({
      kind: 'person', name: `Omar ${mark}`, emails: [`omar.${mark}@example.test`], origin: 'manual',
    });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });

    assert.equal((await whoHears(org.id)).email, `contact.${mark}@example.test`);
  });

  it('opens no account for a letter that never asks for one', async () => {
    /* `{{acces}}` fabrique un mot de passe en passant. Un gabarit qui ne le
       nomme pas ne doit pas ouvrir de porte au nom de personne. */
    const mark = uniq();
    const who = await dir.createRecord({
      kind: 'person', name: `Nabil ${mark}`, emails: [`nabil.${mark}@example.test`], origin: 'manual',
    });
    await setHouseLetter('task_given', { subject: 'Tâche', body: 'Bonjour {{prenom}}, {{tache}}.' });
    const [task] = await give(who.id, 'Noter les dossiers');
    await tellOwner(task!.id);

    assert.equal(await accountOfRecord(who.id), null, 'aucun compte ouvert');
    await setHouseLetter('task_given', { subject: 'Une tâche pour vous — {{tache}}', body: TASK_GIVEN_DEFAULT });
  });

  it('says nothing at all when the letter is switched off', async () => {
    const mark = uniq();
    const who = await dir.createRecord({
      kind: 'person', name: `Hind ${mark}`, emails: [`hind.${mark}@example.test`], origin: 'manual',
    });
    await setHouseLetter('task_given', { enabled: false });
    const [task] = await give(who.id, 'Préparer la séance');

    assert.deepEqual(await tellOwner(task!.id), { told: false, why: 'off' });
    assert.equal((await letters({ email: `hind.${mark}@example.test` })).length, 0);
    await setHouseLetter('task_given', { enabled: true });
  });
});

describe('the reminder for what is late', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  /** Quelqu'un avec une adresse, et rien d'autre dans son courrier. */
  const someone = async () => {
    const mark = uniq();
    const who = await dir.createRecord({
      kind: 'person', name: `Reda ${mark}`, emails: [`reda.${mark}@example.test`], origin: 'manual',
    });
    return { who, email: `reda.${mark}@example.test` };
  };

  it('puts everything of one person’s into one letter', async () => {
    const { who, email } = await someone();
    await give(who.id, 'Relire la grille', day(-3));
    await give(who.id, 'Envoyer le RIB', day(-1));
    await give(who.id, 'Rien d’urgent', day(5));

    await sendLateDigests(MORNING);
    const mine = (await letters({ email })).filter((l) => l.kind === 'task_late');
    assert.equal(mine.length, 1, 'une lettre, pas deux');
    assert.match(mine[0]!.subject, /2 tâches/);
    assert.match(mine[0]!.body, /Relire la grille/);
    assert.match(mine[0]!.body, /Envoyer le RIB/);
    assert.doesNotMatch(mine[0]!.body, /Rien d’urgent/, 'ce qui n’est pas en retard n’y est pas');
  });

  it('does not say it again the next morning', async () => {
    const { who, email } = await someone();
    await give(who.id, 'Rappeler le notaire', day(-2));

    await sendLateDigests(MORNING);
    await sendLateDigests(new Date(MORNING.getTime() + 86400000));
    assert.equal((await letters({ email })).filter((l) => l.kind === 'task_late').length, 1);
  });

  it('waits for the morning', async () => {
    /* Une tâche devient en retard au premier instant du jour. Sans la garde
       d'heure, le rappel part à une heure du matin à Casablanca. */
    const { who, email } = await someone();
    await give(who.id, 'Boucler la convention', day(-1));

    await sendLateDigests(new Date('2026-10-12T02:00:00Z'));
    assert.equal((await letters({ email })).length, 0);
    await sendLateDigests(MORNING);
    assert.equal((await letters({ email })).length, 1);
  });

  it('leaves alone what is done, and what has no date', async () => {
    const { who, email } = await someone();
    const [done] = await give(who.id, 'Déjà fait', day(-4));
    await changeTask(done!.id, { state: 'done' }, CEED);
    await give(who.id, 'Sans date', null);

    await sendLateDigests(MORNING);
    assert.equal((await letters({ email })).length, 0);
  });

  it('says nothing to somebody who has no address, and keeps it for the day they do', async () => {
    const mark = uniq();
    const who = await dir.createRecord({ kind: 'person', name: `Muet ${mark}`, origin: 'manual' });
    await give(who.id, 'Relancer le juré', day(-2));

    await sendLateDigests(MORNING);

    /* L'adresse arrive : rien n'a été consommé entre-temps, le rappel part. */
    await dir.updateRecord(who.id, { emails: [`muet.${mark}@example.test`] });
    await sendLateDigests(MORNING);
    const mine = await letters({ email: `muet.${mark}@example.test` });
    assert.equal(mine.length, 1, 'rien n’a été perdu pendant qu’elle manquait');
    assert.match(mine[0]!.body, /Relancer le juré/);
  });

  it('gives the first login only to somebody who cannot sign in yet', async () => {
    const mark = uniq();
    const open = await dir.createRecord({
      kind: 'person', name: `Jamais entré ${mark}`, emails: [`jamais.${mark}@example.test`], origin: 'manual',
    });
    const held = await dir.createRecord({
      kind: 'person', name: `Déjà entré ${mark}`, emails: [`deja.${mark}@example.test`], origin: 'manual',
    });
    await createAccount({
      email: `deja.${mark}@example.test`, password: 'chosen-by-them', recordId: held.id, mustChangePassword: false,
    });
    await give(open.id, 'Noter les dossiers', day(-2));
    await give(held.id, 'Noter les dossiers', day(-2));

    await sendLateDigests(MORNING);
    assert.match((await letters({ email: `jamais.${mark}@example.test` }))[0]!.body, /Votre première connexion/);
    assert.doesNotMatch((await letters({ email: `deja.${mark}@example.test` }))[0]!.body, /Votre première connexion/);
  });

  it('empties the lines nothing fills', async () => {
    /* Une tâche sans détail, sans date et sans attache ne doit pas laisser
       trois lignes vides au milieu du message. */
    const filled = fillTemplate(TASK_GIVEN_DEFAULT, {
      prenom: 'Karim', nom: 'Karim Benali', tache: 'Relire la grille',
      detail: '', echeance: '', apropos: '', donnepar: 'Rima Arrach', acces: '',
      lien: 'https://www.ceedflow.com/me',
    });
    assert.doesNotMatch(filled, /\n\n\n/, 'pas de trou dans le texte');
    assert.doesNotMatch(filled, /\{\{/, 'pas une variable restée écrite');
  });
});
