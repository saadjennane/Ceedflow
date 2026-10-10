/**
 * La corbeille à trente jours.
 *
 * Two things are being proved here, and the first is the one that bites. A row
 * in the bin has to be gone from *every* reader — there are two dozen, and the
 * one that forgets is a deleted founder reappearing on a jury's panel. So each
 * entry point is asked by name rather than the filter being trusted once.
 *
 * The second is that putting it back puts back the whole act: a founder
 * returns with the page and the application that left with them, and with the
 * way in, because handing back a file rather than a colleague is the failure
 * this is for. Except the two the decision set aside — a juror's seat and the
 * marks they filed, which never come back.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { db, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { accountOfRecord, createAccount } from '../src/services/auth.js';
import { KEPT_DAYS, binned, purgeExpired, restore } from '../src/services/trash.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('the thirty days before a deletion is true', { skip: skipWithoutServer }, () => {
  before(async () => {
    await migrate();
  });
  after(closeDb);

  const stamp = () => `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;

  /** A founder, their organisation's page, their application, and a way in. */
  const aFounder = async () => {
    const mark = stamp();
    const email = `karim.${mark}@example.test`;
    const org = await dir.createRecord({ kind: 'org', name: `Rafid Tech ${mark}`, origin: 'manual' });
    const person = await dir.createRecord({ kind: 'person', name: `Karim ${mark}`, emails: [email], origin: 'manual' });
    await dir.linkRecords({ personId: person.id, orgId: org.id, role: 'Founder', access: 'admin' });
    await createAccount({ email, password: 'given-by-ceed', recordId: person.id, mustChangePassword: true });

    const program = await repo.createProgram({ name: `The Builders ${mark}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const candidate = await repo.createCandidate({
      editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id,
    });
    return { mark, email, org, person, candidate, program, edition };
  };

  const bin = async (id: string) => {
    const plan = await dir.removalPlan(id);
    return dir.removeRecord(id, plan!, 'ceed@example.test');
  };

  it('takes a deleted record out of every list that could show it', async () => {
    const { person, org, mark, email } = await aFounder();
    await bin(person.id);

    assert.equal(await dir.getRecord(person.id), null, 'read by id');
    assert.equal(
      (await dir.listRecords({ kind: 'person' })).some((r) => r.id === person.id),
      false,
      'the directory list',
    );
    assert.equal((await dir.listRecords({ q: `Karim ${mark}` })).length, 0, 'a search by name');
    assert.equal((await dir.recordsByIds([person.id])).length, 0, 'read by a list of ids');
    assert.equal((await dir.peopleByIds([person.id])).length, 0, 'read as a reference');
    assert.equal(await dir.findByEmail('person', email), null, 'found by their address');
    assert.equal(await dir.findByName('person', `Karim ${mark}`), null, 'found by their name');
    // The page went with them: nobody else held it.
    assert.equal(await dir.getRecord(org.id), null, 'the page nobody else holds');
  });

  it('takes the application with the founder, and the way in with them', async () => {
    const { person, candidate, edition } = await aFounder();
    await bin(person.id);

    assert.equal(await repo.getCandidate(candidate.id), null, 'the application is gone');
    assert.equal((await repo.listCandidates(edition.id)).length, 0, 'and out of the edition');
    assert.equal((await accountOfRecord(person.id))?.state, 'disabled', 'the account is asleep, not destroyed');
  });

  it('puts the whole act back, in one gesture', async () => {
    const { person, org, candidate, email } = await aFounder();
    const batch = await bin(person.id);

    const waiting = await binned();
    const mine = waiting.find((b) => b.batch === batch);
    assert.ok(mine, 'the deletion is in the bin');
    assert.equal(mine!.by, 'ceed@example.test', 'and says who did it');
    assert.equal(mine!.daysLeft, KEPT_DAYS, 'with its whole thirty days');
    assert.deepEqual(
      mine!.items.map((i) => i.what).sort(),
      ['candidacy', 'organisation', 'person'],
      'naming the three things that went',
    );

    await restore(batch);
    assert.ok(await dir.getRecord(person.id), 'the person is back');
    assert.ok(await dir.getRecord(org.id), 'and the page');
    assert.ok(await repo.getCandidate(candidate.id), 'and the application');
    assert.equal((await accountOfRecord(person.id))?.state !== 'disabled', true, 'and the way in');
    assert.ok(await dir.findByEmail('person', email), 'and findable again by their address');
    assert.equal((await binned()).some((b) => b.batch === batch), false, 'and the bin is empty of it');
  });

  it('leaves asleep an account somebody else had already disabled', async () => {
    /* Restaurer, c'est défaire une suppression — pas rouvrir une porte qu'un
       administrateur avait fermée la veille pour une raison de son choix. */
    const { person } = await aFounder();
    const account = (await accountOfRecord(person.id))!;
    await (await db()).query('update accounts set disabled_at = now() where id = $1', [account.id]);

    const batch = await bin(person.id);
    await restore(batch);
    assert.equal((await accountOfRecord(person.id))?.state, 'disabled', 'still disabled, as it was');
  });

  it('never gives a juror their seat back', async () => {
    /* La séance n'est pas à eux : restaurer rend la personne, pas le siège. */
    const { person, edition } = await aFounder();
    const detail = await repo.getEditionDetail(edition.id);
    const phase = detail!.tracks[0].phases[0];
    const committee = await repo.createBlock(phase.id, 'committee', 'Jury Day');
    const session = await repo.createSession(committee.id, { name: 'Séance 1', heldOn: '2026-10-20' });
    await repo.updateSession(session.id, { jury: [person.id] });

    const batch = await bin(person.id);
    await restore(batch);

    const seats = await repo.listSessions(committee.id);
    assert.equal(seats[0]!.jury.includes(person.id), false, 'the seat stayed empty');
    assert.ok(await dir.getRecord(person.id), 'but the person is back');
  });

  it('takes a programme’s editions with it, and brings them back together', async () => {
    const { program, edition } = await aFounder();
    const batch = await repo.deleteProgram(program.id, 'ceed@example.test');

    assert.equal(await repo.getEditionDetail(edition.id), null, 'the edition went too');
    assert.equal((await repo.listPrograms()).some((p) => p.id === program.id), false, 'and the programme');

    await restore(batch);
    assert.ok(await repo.getEditionDetail(edition.id), 'both come back');
    assert.equal((await repo.listPrograms()).some((p) => p.id === program.id), true);
  });

  it('empties only what has run out of days', async () => {
    const { person } = await aFounder();
    const batch = await bin(person.id);
    await purgeExpired();
    assert.equal((await binned()).some((b) => b.batch === batch), true, 'a fresh deletion stays');

    /* Tout le lot vieillit ensemble, comme il a été marqué ensemble. */
    const conn = await db();
    for (const table of ['records', 'candidates']) {
      await conn.query(
        `update ${table} set deleted_at = now() - interval '${KEPT_DAYS + 1} days' where deleted_batch = $1`,
        [batch],
      );
    }
    await purgeExpired();
    const rows = await conn.query<{ id: string }>('select id from records where id = $1', [person.id]);
    assert.equal(rows.length, 0, 'and the thirty-first day takes it for good');
  });

  it('waits for what still points at a page before dropping it', async () => {
    /* Une page effacée en mars et une candidature effacée en avril n'expirent
       pas le même jour. Lâcher la page pendant que la candidature est encore
       là, c'est une clé étrangère violée — toutes les heures, et une corbeille
       qui ne se vide plus jamais. */
    const { person, org, candidate } = await aFounder();
    const batch = await bin(person.id);
    const conn = await db();
    await conn.query(
      `update records set deleted_at = now() - interval '${KEPT_DAYS + 1} days' where deleted_batch = $1`,
      [batch],
    );

    await purgeExpired();
    const page = await conn.query<{ id: string }>('select id from records where id = $1', [org.id]);
    assert.equal(page.length, 1, 'the page waited rather than raising');

    await conn.query(
      `update candidates set deleted_at = now() - interval '${KEPT_DAYS + 1} days' where id = $1`,
      [candidate.id],
    );
    await purgeExpired();
    const after = await conn.query<{ id: string }>('select id from records where id = $1', [org.id]);
    assert.equal(after.length, 0, 'and went on the sweep after');
  });
});
