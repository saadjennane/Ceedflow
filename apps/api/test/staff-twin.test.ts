/**
 * La même collègue, ajoutée deux fois.
 *
 * Le 24 septembre, Ghita a été ajoutée à 11 h 12 sous ceed-morocco.com, puis à
 * 11 h 14 sous ceed-morocco.org : une faute de frappe dans le domaine. L'ajout
 * ne cherchait que par adresse, alors il a fabriqué une seconde fiche et un
 * second compte — et elle apparaît deux fois partout où l'équipe se liste.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { accountOfRecord, createAccount, findAccount, setPassword, setStaffRole } from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => Math.random().toString(36).slice(2, 8);

/** Ce que fait la route quand on ajoute quelqu'un à l'équipe. */
const addToTeam = async (name: string, email: string) => {
  const known = (await dir.findByEmail('person', email)) ?? (await dir.findByName('person', name));
  if (known) {
    const held = await accountOfRecord(known.id);
    if (held) return { record: known, account: held, reused: true };
  }
  const record = known ?? (await dir.createRecord({ kind: 'person', name, email, roles: ['CEED team'], origin: 'manual' }));
  const account = await createAccount({ email, password: 'given', recordId: record.id, mustChangePassword: true });
  await setStaffRole(account.id, 'editor');
  return { record, account, reused: false };
};

describe('adding the same colleague twice', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  it('finds her by name when the address has a typo in it', async () => {
    const mark = uniq();
    const name = `Ghita Faklani ${mark}`;
    const first = await addToTeam(name, `gfaklani.${mark}@ceed-morocco.com`);
    const second = await addToTeam(name, `gfaklani.${mark}@ceed-morocco.org`);

    assert.equal(second.record.id, first.record.id, 'la même personne, pas une jumelle');
    assert.equal(second.reused, true, 'et sa porte, pas une seconde');
    const people = await dir.listRecords({ kind: 'person', q: `faklani ${mark}` });
    assert.equal(people.length, 1, 'une seule fiche dans l’annuaire');
  });

  it('does not take the door away from somebody who uses it', async () => {
    /* Déplacer l'identifiant de quelqu'un qui s'en sert, c'est le lui fermer :
       la route refuse, et dit avec quoi elle se connecte. */
    const mark = uniq();
    const name = `Rania Moutaouakil ${mark}`;
    const hers = `rania.${mark}@ceed-morocco.org`;
    const made = await addToTeam(name, hers);
    await setPassword(made.account.id, 'chosen-by-her');

    const again = await addToTeam(name, `rania.${mark}@gmail.com`);
    assert.equal(again.reused, true);
    assert.equal((await accountOfRecord(made.record.id))?.email, hers, 'elle garde la sienne');
    assert.ok(await findAccount(hers), 'et elle ouvre toujours');
  });
});
