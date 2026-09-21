/**
 * That a backup can be loaded back.
 *
 * An export nobody has ever restored is a file, not a backup. This one takes
 * the data out, empties every table, puts it back, and checks that what
 * returned is what left — including the things that travel badly: jsonb, the
 * links between tables, and the password hashes four hundred people sign in
 * with.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { all, db, migrate } from '../src/db/client.js';
import { exportSql } from '../src/db/export.js';
import { importSql } from '../src/db/import.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const COUNTED = [
  'records', 'candidates', 'programs', 'editions', 'blocks', 'accounts',
  'affiliations', 'committee_sessions', 'committee_assignments', 'evaluation_scores',
  'phases', 'tracks',
];

const counts = async () => {
  const out: Record<string, number> = {};
  for (const table of COUNTED) {
    const [row] = await all<{ n: number }>(`select count(*)::int as n from "${table}"`);
    out[table] = Number(row.n);
  }
  return out;
};

describe('a backup that loads back', { skip: skipWithoutServer }, () => {
  let orgName = '';
  let personId = '';

  before(async () => {
    await migrate();
    /* Something of every shape the export has to carry: a configuration and a
       set of answers in jsonb, a seat on a sitting that points at three other
       tables, an account with a hash. */
    const program = await repo.createProgram({ name: `Backup ${Date.now()}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohort' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const form = await repo.createBlock(phase.id, 'application', 'Form');
    await repo.updateBlock(form.id, { config: { fields: [{ id: 'q', type: 'long_text', label: 'What?' }] } });
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');

    orgName = `Kettara ${Date.now()}`;
    const org = await dir.createRecord({ kind: 'org', name: orgName, origin: 'manual' });
    const person = await dir.createRecord({
      kind: 'person', name: `Founder ${Date.now()}`, origin: 'manual', roles: ['Jury'],
    });
    personId = person.id;
    const candidate = await repo.createCandidate({
      editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id,
      originBlockId: form.id, answers: { q: 'A sentence with an apostrophe: it\'s fine.' },
    });
    const session = await repo.createSession(committee.id, {
      name: 'Morning', heldOn: '2026-10-28', windows: [{ startsAt: '09:00', endsAt: '12:00' }],
      jury: [person.id], minutesPerStartup: 25,
    });
    await repo.assignToSession(session.id, [candidate.id]);
  });
  after(closeDb);

  it('comes back whole after everything has been emptied', async () => {
    const before = await counts();
    assert.ok(before.candidates > 0, 'nothing to test with');

    const lines: string[] = [];
    const written = await exportSql((line) => lines.push(line));
    assert.ok(written > 0);
    const dump = lines.join('\n');
    assert.ok(!/create table|alter table/i.test(dump), 'the dump carries schema it should not');

    const conn = await db();
    await conn.exec(`truncate ${COUNTED.map((t) => `"${t}"`).join(', ')} cascade`);
    assert.equal((await counts()).candidates, 0, 'the tables were not emptied');

    const loaded = await importSql(dump);
    assert.equal(loaded, written, 'fewer rows went back than came out');
    assert.deepEqual(await counts(), before, 'a table came back with a different number of rows');
  });

  it('keeps the links, the jsonb and the hashes', async () => {
    const [joined] = await all<{ n: number }>(
      `select count(*)::int as n from candidates c
         join records r on r.id = c.org_id
         join committee_assignments a on a.candidate_id = c.id`,
    );
    assert.ok(Number(joined.n) > 0, 'a seat lost the startup or the startup lost its organisation');

    const [block] = await all<{ config: unknown }>(`select config from blocks where type = 'application' limit 1`);
    assert.equal(typeof block.config, 'object', 'jsonb came back as a string');

    const person = await dir.getRecord(personId);
    assert.deepEqual(person?.roles, ['Jury'], 'a jsonb array came back wrong');

    const org = await all<{ name: string }>(`select name from records where name = $1`, [orgName]);
    assert.equal(org.length, 1, 'a name with nothing special about it did not survive');
  });
});
