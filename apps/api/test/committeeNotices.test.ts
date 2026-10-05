/**
 * Convoquer un comité : deux populations, deux lettres.
 *
 * The jury's letter is the one CEED has been writing by hand, and it is not
 * the startups' letter with a different name on it: a juror is told who they
 * will see, a startup when it is expected. Putting both in one message is how
 * a startup learns who else is pitching that morning.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { createAccount } from '../src/services/auth.js';
import {
  COMMITTEE_KINDS,
  committeeAudiences,
  committeeRoster,
  committeeValues,
} from '../src/services/committeeNotices.js';
import { seatOnFreeSlots } from '../src/services/committee.js';
import { letters } from '../src/services/mail.js';
import { launchNotice, sendDueNotices } from '../src/services/notices.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('convening a committee', { skip: skipWithoutServer }, () => {
  const setUp = async (over: Record<string, unknown> = {}) => {
    const program = await repo.createProgram({ name: 'The Builders' });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const detail = await repo.getEditionDetail(edition.id);
    const track = detail!.tracks[0];
    const phase = track.phases[0];
    const panel = await repo.createBlock(phase.id, 'committee', 'Jury day');

    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const person = async (name: string, withAccount = true) => {
      const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${stamp}@example.test`;
      const record = await dir.createRecord({ kind: 'person', name: `${name} ${stamp}`, email, origin: 'manual' });
      if (withAccount) await createAccount({ email, password: 'given-by-ceed', recordId: record.id });
      return record;
    };
    const nawal = await person('Nawal');
    const youssef = await person('Youssef');

    const candidacy = async (orgName: string) => {
      const org = await dir.createRecord({ kind: 'org', name: `${orgName} ${stamp}`, origin: 'manual' });
      const email = `${orgName.split(' ')[0]!.toLowerCase()}.${stamp}@example.test`;
      const founder = await dir.createRecord({ kind: 'person', name: `${orgName} F ${stamp}`, email, origin: 'manual' });
      return repo.createCandidate({
        editionId: edition.id, trackId: track.id, orgId: org.id, personId: founder.id,
      });
    };
    const rafid = await candidacy('Rafid Tech');
    const nakhla = await candidacy('Nakhla Bio');

    await repo.createSession(panel.id, {
      name: 'Séance 1',
      heldOn: '2026-10-20',
      minutesPerStartup: 20,
      windows: [{ startsAt: '09:00', endsAt: '12:00' }],
      location: 'Villa des Arts',
      jury: [nawal.id, youssef.id],
      ...over,
    });
    const view = (await repo.listSessions(panel.id))[0]!;
    return { panel, sitting: view, nawal, youssef, rafid, nakhla };
  };

  const BODY_JURY = 'Bonjour {{jure}}, {{panel}} le {{date}} de {{heures}}{{lieu}}.\n{{startups}}';
  const BODY_STARTUP = 'Bonjour {{startup}}, le {{date}}{{heure}}{{lieu}}.';

  it('names the jury on one side and the startups on the other', async () => {
    const { panel, sitting, rafid, nakhla, nawal } = await setUp();
    await seatOnFreeSlots(sitting.id, [rafid.id, nakhla.id]);

    const jury = await committeeRoster(panel.id, COMMITTEE_KINDS.jury);
    const startups = await committeeRoster(panel.id, COMMITTEE_KINDS.startup);
    assert.equal(jury.length, 2);
    assert.equal(startups.length, 2);
    assert.ok(jury.some((j) => j.subjectId === nawal.id), 'the juror is named by their record');
    assert.ok(startups.every((s) => s.as === 'candidate'));
    assert.ok(jury.every((j) => j.as === 'person'));
  });

  it('tells a juror who they will see, and a startup when it is expected', async () => {
    const { panel, sitting, rafid, nawal } = await setUp();
    await seatOnFreeSlots(sitting.id, [rafid.id]);

    const forJuror = await committeeValues(panel.id, COMMITTEE_KINDS.jury, nawal.id);
    assert.match(forJuror!.startups, /Rafid Tech/, 'the juror is told who');
    assert.equal(forJuror!.heures, '09:00 à 12:00');

    const forStartup = await committeeValues(panel.id, COMMITTEE_KINDS.startup, rafid.id);
    assert.equal(forStartup!.startups, undefined, 'and the startup is not told who else is pitching');
    /* Seating and timing are two acts, so a startup seated and not yet timed
       is convened for the day without an hour — the letter says the day and
       closes its sentence rather than inventing a time. */
    assert.equal(forStartup!.heure, '');

    const seated = (await repo.listAssignments(panel.id)).find((x) => x.candidateId === rafid.id)!;
    await repo.moveAssignmentToSlot(seated.id, 0);
    const timed = await committeeValues(panel.id, COMMITTEE_KINDS.startup, rafid.id);
    assert.match(timed!.heure, /09:00/, 'once it has a slot, it is told it');
  });

  it('closes the sentence when there is no slot and no place', async () => {
    /* "le 20 octobre ." is what a template full of bare variables produces,
       and it goes out to nine jurors before anybody notices. */
    const { panel, sitting, rafid } = await setUp({ location: '' });
    await seatOnFreeSlots(sitting.id, [rafid.id]);
    const seated = (await repo.listAssignments(panel.id)).filter((x) => x.sessionId === sitting.id);
    await repo.moveAssignmentToSlot(seated[0]!.id, null);

    const values = await committeeValues(panel.id, COMMITTEE_KINDS.startup, rafid.id);
    assert.equal(values!.lieu, '');
    assert.equal(values!.heure, '');
  });

  it('writes to one audience and leaves the other untouched', async () => {
    const { panel, sitting, rafid, nawal } = await setUp();
    await seatOnFreeSlots(sitting.id, [rafid.id]);

    await launchNotice(panel.id, { kind: COMMITTEE_KINDS.jury, body: BODY_JURY });
    await sendDueNotices();

    assert.equal((await letters({ email: '' })).length, 0, 'nothing addressed nowhere');
    const { audiences } = await committeeAudiences(panel.id);
    const by = new Map(audiences.map((a) => [a.audience, a]));
    assert.equal(by.get('jury')?.told, 2);
    assert.equal(by.get('startup')?.told, 0, 'the startups hear nothing yet');
    assert.ok(nawal.id);
  });

  it('says it once to each juror, however many times the button is pressed', async () => {
    const { panel, nawal } = await setUp();
    for (let i = 0; i < 3; i++) {
      await launchNotice(panel.id, { kind: COMMITTEE_KINDS.jury, body: BODY_JURY });
      await sendDueNotices();
    }
    const record = await dir.getRecord(nawal.id);
    assert.equal((await letters({ email: record!.email! })).length, 1);
  });

  it('leaves out a juror with no account — a grid they cannot open', async () => {
    const { panel } = await setUp();
    const stray = await dir.createRecord({
      kind: 'person', name: `Sans compte ${Date.now()}`, email: `sans.${Date.now()}@example.test`, origin: 'manual',
    });
    const sitting = (await repo.listSessions(panel.id))[0]!;
    await repo.updateSession(sitting.id, { jury: [...sitting.jury, stray.id] });

    const roster = await committeeRoster(panel.id, COMMITTEE_KINDS.jury);
    assert.equal(roster.find((r) => r.subjectId === stray.id)?.blocked, 'no_account');
  });

  it('waits rather than writing a convocation with no date', async () => {
    /* Fixing the day after scheduling the letters is an ordinary order to do
       things in, and a convocation that names no day is worse than a late one. */
    const { panel } = await setUp({ heldOn: null });
    await launchNotice(panel.id, { kind: COMMITTEE_KINDS.jury, body: BODY_JURY });
    await sendDueNotices();
    assert.equal((await repo.listNotices(panel.id))[0]!.state, 'planned', 'waiting for a date, not abandoned');
  });

  it('fills a startup’s letter with its own sitting', async () => {
    const { panel, sitting, rafid } = await setUp();
    await seatOnFreeSlots(sitting.id, [rafid.id]);
    await launchNotice(panel.id, { kind: COMMITTEE_KINDS.startup, body: BODY_STARTUP });
    await sendDueNotices();

    const [letter] = await letters({ candidateId: rafid.id });
    assert.match(letter!.body, /Rafid Tech/);
    assert.match(letter!.body, /20 octobre 2026/);
    assert.match(letter!.body, /Villa des Arts/);
    assert.ok(!letter!.body.includes('{{'), 'and nothing left unfilled');
  });
});
