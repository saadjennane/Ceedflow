/**
 * L'espace de test : de faux programmes et de faux comptes dans la vraie app,
 * sans qu'aucune vraie startup n'en voie ni n'en reçoive rien.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { db, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { programsFor } from '../src/routes/auth.js';
import { createAccount, findAccount, setStaffRole } from '../src/services/auth.js';
import { post } from '../src/services/mail.js';
import {
  aliasBase,
  createTestPerson,
  createTestProgram,
  generateStartups,
  isTestAddress,
  purgeSandbox,
  testOwnerOf,
} from '../src/services/sandbox.js';
import { resolveAudience } from '../src/services/sourcing.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('a test address', () => {
  it('is an alias: the part before the “+” is the colleague', () => {
    assert.equal(aliasBase('Saad+Jury@ceed-morocco.org'), 'saad@ceed-morocco.org');
    assert.equal(aliasBase('saad@ceed-morocco.org'), null, 'no “+”, no alias');
    assert.equal(aliasBase('nonsense'), null);
  });
});

describe('the test space', { skip: skipWithoutServer }, () => {
  const stamp = Date.now();
  const domain = `ceed${stamp}.test`;
  let staff = { accountId: '', email: '', recordId: '' };

  before(async () => {
    await migrate();
    const email = `saad@${domain}`;
    const me = await dir.createRecord({ kind: 'person', name: 'Saad Staff', emails: [email], origin: 'manual' });
    const account = await createAccount({ email, password: 'chosen-by-saad', recordId: me.id });
    await setStaffRole(account.id, 'admin');
    staff = { accountId: account.id, email, recordId: me.id };
  });
  after(closeDb);

  const blockOf = async (programId: string, type: string) => {
    const program = (await repo.getProgram(programId))!;
    const detail = (await repo.getEditionDetail(program.editions[0]!.id))!;
    return detail.tracks.flatMap((t) => t.phases.flatMap((p) => p.blocks)).find((b) => b.type === type)!;
  };

  const stateOf = async (id: string | null) =>
    (await (await db()).query<{ state: string; error: string }>('select state, error from outbox where id = $1', [id]))[0];

  it('knows a colleague’s alias, and only a colleague’s', async () => {
    assert.equal((await testOwnerOf(`saad+jury@${domain}`))?.accountId, staff.accountId);
    assert.equal(await testOwnerOf(`saad@${domain}`), null);
    assert.equal(await testOwnerOf(`stranger+x@${domain}`), null, 'an alias of nobody at CEED is nobody’s');
    assert.equal(await isTestAddress(`saad+founder@${domain}`), true);
    assert.equal(await isTestAddress(`founder@realstartup.ma`), false);
  });

  it('generates startups with complete pages, held by the colleague', async () => {
    const made = await generateStartups(staff, 3);
    assert.equal(made.length, 3);
    for (const org of made) {
      assert.equal(org.testOwner, staff.accountId);
      assert.ok(org.sector && org.pitch);
      assert.match(org.email, new RegExp(`^saad\\+[a-z]+@${domain.replace('.', '\\.')}$`), 'an alias, so mail lands with Saad');
    }
    const detail = await dir.getRecord(made[0]!.id);
    assert.ok((detail as { documents?: unknown[] }).documents?.length, 'with documents');
  });

  it('opens a test account only on a colleague’s alias, with the password mailed there', async () => {
    await assert.rejects(
      createTestPerson({ email: `someone@gmail.com`, firstName: 'No', lastName: 'Alias', role: 'jury' }),
      /alias/,
    );
    const [startup] = (await dir.listRecords({ kind: 'org' })).filter((r) => r.testOwner === staff.accountId);
    const founder = await createTestPerson({
      email: `saad+founder${stamp}@${domain}`,
      firstName: 'Faux',
      lastName: 'Fondateur',
      role: 'founder',
      orgId: startup!.id,
    });
    assert.equal(founder.testOwner, staff.accountId);
    assert.equal(await dir.accessOf(founder.id, startup!.id), 'admin');
    const account = await findAccount(founder.email);
    assert.equal(account?.mustChangePassword, true);
    const [letter] = await (await db()).query<{ kind: string }>('select kind from outbox where record_id = $1', [founder.id]);
    assert.equal(letter?.kind, 'test_access');
  });

  it('blocks a test programme’s letter to a real address, and lets it reach a test one', async () => {
    const program = (await createTestProgram(null, `ZZ Test ${stamp}`))!;
    assert.equal(program.isTest, true);
    const form = await blockOf(program.id, 'application');

    const real = await post({ kind: 'x', to: 'founder@realstartup.ma', subject: 's', body: 'b', blockId: form.id });
    const real2 = await stateOf(real);
    assert.equal(real2?.state, 'held');
    assert.match(real2!.error, /test programme/);

    const alias = await post({ kind: 'x', to: `saad+jury@${domain}`, subject: 's', body: 'b', blockId: form.id });
    assert.equal((await stateOf(alias))?.error, '', 'not blocked — held here only because tests never send');
  });

  it('keeps test programmes out of real members’ space, and real ones out of test accounts’', async () => {
    const program = (await createTestProgram(null, `ZZ Visible ${stamp}`))!;
    await repo.updateEdition(program.editions[0]!.id, { status: 'Live' });

    const real = await dir.createRecord({ kind: 'person', name: `Real ${stamp}`, emails: [`real${stamp}@x.ma`], origin: 'manual' });
    assert.equal((await programsFor(real.id)).some((p) => p.programId === program.id), false);

    const tester = (await dir.listRecords({ kind: 'person' })).find((r) => r.testOwner === staff.accountId)!;
    const seen = await programsFor(tester.id);
    assert.equal(seen.some((p) => p.programId === program.id), true);
    assert.equal(seen.every((p) => p.programId === program.id || seen.length > 0), true);
    for (const p of seen) {
      const full = await repo.getProgram(p.programId);
      assert.equal(full?.isTest, true, 'a test account sees only test programmes');
    }
  });

  it('lets a test sourcing reach test startups only', async () => {
    const program = (await createTestProgram(null, `ZZ Sourcing ${stamp}`))!;
    const sourcing = await blockOf(program.id, 'sourcing');
    const realStartup = await dir.createRecord({ kind: 'org', name: `Real Startup ${stamp}`, roles: ['Startup'], origin: 'manual' });
    const reached = await resolveAudience({ roles: ['Startup'], tags: [], recordIds: [] }, sourcing.id);
    assert.ok(reached.length > 0);
    assert.equal(reached.some((r) => r.id === realStartup.id), false);
    assert.equal(reached.every((r) => r.testOwner), true);
  });

  it('purges everything test, and nothing real', async () => {
    const realOrg = await dir.createRecord({ kind: 'org', name: `Keep me ${stamp}`, origin: 'manual' });
    const realProgram = await repo.createProgram({ name: `Real programme ${stamp}` });
    await purgeSandbox();
    assert.equal((await dir.listRecords()).some((r) => r.testOwner), false);
    assert.equal((await repo.listPrograms()).some((p) => p.isTest), false);
    assert.ok(await dir.getRecord(realOrg.id), 'a real organisation stays');
    assert.ok(await repo.getProgram(realProgram.id), 'a real programme stays');
    assert.ok(await dir.getRecord(staff.recordId), 'and so does the colleague');
  });
});
