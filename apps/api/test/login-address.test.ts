/**
 * L'adresse qui ouvre la porte, et celle qui reçoit le courrier.
 *
 * Un compte s'ouvre sur l'adresse du jour où la candidature est déposée ; la
 * fiche, elle, bouge. Une fondatrice est passée de son adresse personnelle à
 * celle de sa société, la lettre lui a donné cette dernière comme identifiant
 * avec le mot de passe du compte, et elle a lu « mot de passe ou login erroné »
 * en tapant exactement ce qu'on lui avait écrit.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { accountOfRecord, createAccount, findAccount, followRecordEmail, setPassword } from '../src/services/auth.js';
import { accessFor } from '../src/services/invitations.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;

describe('the address somebody signs in with', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  const person = async (email: string) =>
    dir.createRecord({ kind: 'person', name: `Sanaa ${uniq()}`, email, origin: 'manual' });

  it('follows the record while nobody has used it', async () => {
    const mark = uniq();
    const who = await person(`old.${mark}@example.test`);
    await createAccount({ email: `old.${mark}@example.test`, password: 'given-by-ceed', recordId: who.id, mustChangePassword: true });

    await dir.updateRecord(who.id, { email: `new.${mark}@example.test` });
    assert.equal(await followRecordEmail(who.id, `new.${mark}@example.test`), 'moved');
    assert.equal((await accountOfRecord(who.id))?.email, `new.${mark}@example.test`);
    assert.ok(await findAccount(`new.${mark}@example.test`), 'and that is what signs in now');
  });

  it('leaves alone an account somebody already holds the letter for', async () => {
    /* Invitée hier, pas encore entrée : elle tient un papier qui nomme
       l'ancienne adresse. Déplacer la porte dont elle a la clé, c'est la lui
       fermer — et elle lira « mot de passe ou login erroné » sans comprendre. */
    const mark = uniq();
    const who = await person(`held.${mark}@example.test`);
    await createAccount({ email: `held.${mark}@example.test`, password: 'given', recordId: who.id, mustChangePassword: true });
    await accessFor(who.id); // la lettre part : le compte est marqué invité

    assert.equal(await followRecordEmail(who.id, `moved.${mark}@example.test`), 'kept');
    assert.equal((await accountOfRecord(who.id))?.email, `held.${mark}@example.test`);
  });

  it('leaves alone an account whose owner has chosen their password', async () => {
    /* Déplacer l'identifiant de quelqu'un qui s'en sert, c'est lui fermer la
       porte au nom d'une faute de frappe corrigée sur sa fiche. */
    const mark = uniq();
    const who = await person(`hers.${mark}@example.test`);
    const account = await createAccount({ email: `hers.${mark}@example.test`, password: 'given-by-ceed', recordId: who.id, mustChangePassword: true });
    await setPassword(account.id, 'chosen-by-her');

    assert.equal(await followRecordEmail(who.id, `other.${mark}@example.test`), 'kept');
    assert.equal((await accountOfRecord(who.id))?.email, `hers.${mark}@example.test`);
  });

  it('never steals an address another account already uses', async () => {
    const mark = uniq();
    const one = await person(`one.${mark}@example.test`);
    const two = await person(`two.${mark}@example.test`);
    await createAccount({ email: `one.${mark}@example.test`, password: 'x', recordId: one.id, mustChangePassword: true });
    await createAccount({ email: `two.${mark}@example.test`, password: 'x', recordId: two.id, mustChangePassword: true });

    assert.equal(await followRecordEmail(two.id, `one.${mark}@example.test`), 'taken');
    assert.equal((await accountOfRecord(two.id))?.email, `two.${mark}@example.test`);
  });

  it('writes the account’s own address into the letter, not the record’s', async () => {
    /* Le défaut tel qu'il s'est produit : la fiche avait changé d'adresse, le
       compte non, et la lettre a nommé celle de la fiche. */
    const mark = uniq();
    const who = await person(`signs.${mark}@example.test`);
    await createAccount({ email: `signs.${mark}@example.test`, password: 'given', recordId: who.id, mustChangePassword: true });
    await dir.updateRecord(who.id, { email: `writes.${mark}@example.test` });

    const block = await accessFor(who.id);
    assert.ok(block.includes(`signs.${mark}@example.test`), 'the one that opens the door');
    assert.ok(!block.includes(`writes.${mark}@example.test`), 'and not the one that only receives');
  });
});
