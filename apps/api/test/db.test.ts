/**
 * The two things a real Postgres does differently, and PGlite hid for months.
 *
 * Both were found the day the app first pointed at a server, both would have
 * stopped it dead, and neither could have been caught by any amount of local
 * testing. That is exactly what a test is for.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { db, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('transactions', { skip: skipWithoutServer }, () => {
  before(async () => {
    const conn = await db();
    await conn.exec('drop table if exists tx_probe');
    await conn.exec('create table tx_probe (id int primary key)');
  });
  after(async () => {
    await (await db()).exec('drop table if exists tx_probe');
  });

  it('keeps everything a block wrote when it finishes', async () => {
    const conn = await db();
    await conn.tx(async () => {
      await conn.query('insert into tx_probe (id) values (1)');
      await conn.query('insert into tx_probe (id) values (2)');
    });
    const rows = await conn.query<{ id: number }>('select id from tx_probe order by id');
    assert.equal(rows.length, 2);
  });

  it('keeps nothing when it gives up halfway', async () => {
    const conn = await db();
    await assert.rejects(
      conn.tx(async () => {
        await conn.query('insert into tx_probe (id) values (3)');
        throw new Error('changed our mind');
      }),
    );
    const rows = await conn.query<{ id: number }>('select id from tx_probe where id = 3');
    assert.equal(rows.length, 0, 'the write survived a rollback');
  });

  it('runs its queries on its own connection, not on whichever the pool offers', async () => {
    const conn = await db();
    await conn.tx(async () => {
      await conn.query('insert into tx_probe (id) values (5)');
      const inside = await conn.query('select id from tx_probe where id = 5');
      assert.equal(inside.length, 1, 'a write is invisible to its own transaction');
    });
  });

  it('gives up on a database error too', async () => {
    const conn = await db();
    await assert.rejects(
      conn.tx(async () => {
        await conn.query('insert into tx_probe (id) values (9)');
        await conn.query('insert into tx_probe (id) values (1)'); // duplicate key
      }),
    );
    const rows = await conn.query<{ id: number }>('select id from tx_probe where id = 9');
    assert.equal(rows.length, 0);
  });
});

describe('jsonb comes back as jsonb', { skip: skipWithoutServer }, () => {
  let editionId = '';
  let trackId = '';
  let phaseId = '';

  before(async () => {
    await migrate();
    const program = await repo.createProgram({ name: `Probe ${Date.now()}` });
    await repo.updateProgram(program.id, {
      statuses: [{ id: 'vi', label: 'Very interesting', tone: 'ok', minScore: 70, whenSplit: false }],
    });
    const edition = await repo.createEdition(program.id, { name: 'Cohort' });
    editionId = edition.id;
    const detail = await repo.getEditionDetail(edition.id);
    trackId = detail!.tracks[0].id;
    phaseId = detail!.tracks[0].phases[0].id;
  });
  after(closeDb);

  const isObject = (v: unknown) => v !== null && typeof v === 'object';

  it('carries a block configuration, written and rewritten', async () => {
    const block = await repo.createBlock(phaseId, 'application', 'Form');
    assert.ok(isObject(block.config), 'a fresh configuration came back as a string');
    await repo.updateBlock(block.id, { config: { fields: [{ id: 'q', type: 'short_text', label: 'Q' }] } });
    const again = await repo.getBlock(block.id);
    assert.ok(isObject(again!.config));
    assert.equal((again!.config as { fields: unknown[] }).fields.length, 1);
  });

  it("carries a candidate's answers", async () => {
    const org = await dir.createRecord({ kind: 'org', name: `Org ${Date.now()}`, origin: 'manual' });
    const candidate = await repo.createCandidate({
      editionId, trackId, orgId: org.id, answers: { what: 'a sentence' },
    });
    assert.equal((candidate.answers as { what: string }).what, 'a sentence');
    await repo.updateCandidate(candidate.id, { answers: { what: 'another' } });
    const back = (await repo.listCandidates(editionId)).find((c) => c.id === candidate.id);
    assert.equal((back!.answers as { what: string }).what, 'another');
  });

  it('carries the roles a directory search then matches on', async () => {
    const person = await dir.createRecord({
      kind: 'person', name: `Juror ${Date.now()}`, origin: 'manual', roles: ['Jury'], tags: ['fintech'],
    });
    assert.deepEqual(person.roles, ['Jury']);
    assert.deepEqual(person.tags, ['fintech']);
    // The search uses a jsonb containment operator: a string here finds nobody.
    const found = await dir.listRecords({ kind: 'person', role: 'Jury' });
    assert.ok(found.some((r) => r.id === person.id), 'a role search found nobody');
  });
});
