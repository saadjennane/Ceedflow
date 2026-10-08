/**
 * Une adresse et un numéro, vérifiés avant d'être écrits.
 *
 * Une adresse fautive est une lettre qui ne part pas, et personne ne le voit
 * avant le jour où elle comptait — c'est ce qui est arrivé cette semaine, dans
 * l'autre sens, avec une fondatrice dont l'identifiant n'était pas celui de sa
 * fiche. Un numéro avec une mention dedans est un appel qu'on ne passe pas.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { contactProblemsIn, emailProblem, entryComplete, phoneProblem, myOrgInput } from '@ceed/shared';
import { migrate } from '../src/db/client.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'contact', type: 'email', label: 'Adresse', help: '', required: true,
  options: [], showInTable: false, pageId: '', kind: 'field', repeatable: false, each: '', fields: [],
  ...over,
}) as never;

describe('an address and a number', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('takes the addresses this file is actually full of', () => {
    for (const written of [
      'African.smart.territories@gmail.com',
      'contact.be.obg@gmail.com',
      'ceo@dmm.group',
      'a.farahat@avocapp.com',
    ]) {
      assert.equal(emailProblem(written), '', written);
    }
  });

  it('refuses what cannot be written to', () => {
    for (const written of ['nom@domaine', 'nom domaine.ma', 'nom@a,ma', 'nom@@a.ma']) {
      assert.equal(emailProblem(written), 'email', written);
    }
  });

  it('takes a number as people write it, and only a number', () => {
    /* « Suite de chiffres » ne veut pas dire sans espaces : +212 6 12 34 56 78
       est un numéro juste, et le refuser serait le défaut. */
    for (const written of ['+212 6 12 34 56 78', '0612345678', '06.12.34.56.78', '(212) 612-345678']) {
      assert.equal(phoneProblem(written), '', written);
    }
    for (const written of ['06 12 34 56 78 poste 4', 'à venir', '12345']) {
      assert.equal(phoneProblem(written), 'phone', written);
    }
  });

  it('counts nothing as a problem — not answering is not answering badly', () => {
    assert.equal(emailProblem(''), '');
    assert.equal(phoneProblem('   '), '');
  });

  it('does not count a wrong address as an answer given', () => {
    /* Sans ça, un dossier affiche « 9/9 » et personne ne peut joindre la
       startup qui l'a rempli. */
    assert.equal(entryComplete(item(), 'karim@rafid.ma'), true);
    assert.equal(entryComplete(item(), 'karim@rafid'), false);
  });

  it('names the field that is wrong inside a repeated group', async () => {
    const group = item({
      kind: 'group', repeatable: true, each: 'Associé',
      fields: [
        { id: 'nom', type: 'short_text', label: 'Nom', help: '', required: true, options: [], showInTable: false, pageId: '' },
        { id: 'mail', type: 'email', label: 'Adresse', help: '', required: true, options: [], showInTable: false, pageId: '' },
      ],
    });
    const wrong = contactProblemsIn(group, [
      { nom: 'Karim', mail: 'karim@rafid.ma' },
      { nom: 'Sanaa', mail: 'sanaa@' },
    ]);
    assert.deepEqual(wrong, { mail: 'email' });
  });

  it('refuses to write a wrong address onto an organisation page', () => {
    const bad = myOrgInput.safeParse({ name: 'Rafid Tech', email: 'contact@rafid' });
    assert.equal(bad.success, false);
    const good = myOrgInput.safeParse({ name: 'Rafid Tech', email: 'contact@rafid.ma', phone: '+212 6 12 34 56 78' });
    assert.equal(good.success, true);
  });
});
