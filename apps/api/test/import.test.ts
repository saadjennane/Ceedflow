/**
 * Importer des personnes : leur nom en deux colonnes, leur fonction, plusieurs
 * adresses, et l'organisation à laquelle elles appartiennent — dans la même ligne.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { directoryRoutes } from '../src/routes/directory.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('importing people', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  let staff = '';
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  before(async () => {
    await app.register(cookie);
    await app.register(directoryRoutes);
    await app.ready();
    const me = await dir.createRecord({ kind: 'person', name: 'Samia Staff', emails: [`staff.${mark}@example.test`], origin: 'manual' });
    const account = await createAccount({ email: `staff.${mark}@example.test`, password: 'chosen-by-them', recordId: me.id });
    await setStaffRole(account.id, 'admin');
    staff = (await createSession(account.id)).token;
  });
  after(() => app.close());

  const importRows = (rows: Record<string, string>[], dryRun = false) =>
    app.inject({
      method: 'POST',
      url: '/api/records/import',
      headers: { cookie: `${SESSION_COOKIE}=${staff}` },
      payload: { kind: 'person', rows, dryRun },
    });

  it('takes first and last name, the job title, several addresses, and the organisation they belong to', async () => {
    const email = `mona.${mark}@example.test`;
    const res = await importRows([
      {
        firstName: 'Mona', lastName: `Alami${mark}`, jobTitle: 'CEO – Co-founder', roles: 'Mentor',
        email: `${email}; mona2.${mark}@example.test`, phone: '+212661078891', country: 'Morocco',
        organisation: `SEAF ${mark}`, tags: 'Done; Mentor / Formateur',
      },
    ]);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().created, 1);
    const person = (await dir.listRecords({ kind: 'person', q: `Alami${mark}` }))[0]!;
    assert.equal(person.name, `Mona Alami${mark}`);
    assert.equal(person.firstName, 'Mona');
    assert.equal(person.jobTitle, 'CEO – Co-founder');
    assert.equal(person.emails.length, 2);
    assert.ok(person.tags.includes('Mentor / Formateur'));
    const org = (await dir.listRecords({ kind: 'org', q: `SEAF ${mark}` }))[0]!;
    assert.ok(org, 'the organisation, created');
    assert.ok(await dir.accessOf(person.id, org.id), 'and the person attached to it');

    // La même adresse, un autre nom écrit : c'est la même personne, complétée.
    const again = await importRows([{ name: `M. Alami${mark}`, email, department: 'Direction générale' }]);
    assert.equal(again.json().merged, 1);
    assert.equal((await dir.getRecord(person.id))!.department, 'Direction générale');
  });
});
