/**
 * Le reporting d'une édition : la cohorte mesurée à des moments du programme,
 * ses réponses figées à l'envoi, et la fiche qui suit.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { historyOf } from '../src/db/attributes.js';
import { letters } from '../src/services/mail.js';
import {
  editionSetup,
  launchMoment,
  measureFor,
  measuresDueFor,
  reportingView,
  saveEditionSetup,
  saveMeasure,
  saveProgramSetup,
} from '../src/services/reporting.js';
import { closeDb, skipWithoutServer } from './helpers.js';
import { programMetrics } from '../src/services/programMetrics.js';
import { putTeamValue } from '../src/services/reporting.js';
import { changeMeeting, planMeetings } from '../src/services/oneToOne.js';

before(migrate);
after(closeDb);

const field = (id: string, type: string, extra: object = {}) => ({
  id, type, label: id, help: '', required: false, options: [], showInTable: false, pageId: '', ...extra,
});

describe('measuring a cohort over its programme', { skip: skipWithoutServer }, () => {
  const setUp = async () => {
    const mark = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    await dir.updateRecord(org.id, { teamSize: 8 });
    const founder = await dir.createRecord({ kind: 'person', name: 'Salma Founder', emails: [`salma.${mark}@example.test`], origin: 'manual' });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });
    const kept = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: founder.id });
    await repo.updateCandidate(kept.id, { status: 'Selected' });
    const other = await dir.createRecord({ kind: 'org', name: `Badr ${mark}`, origin: 'manual' });
    const out = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: other.id, personId: founder.id });

    await saveProgramSetup(program.id, {
      indicators: [field('i_team', 'number', { fromProfile: 'teamSize', required: true }), field('i_pilots', 'number')],
    });
    const setup = await editionSetup(edition.id);
    const start = { ...setup.moments[0]!, opensOn: '2026-10-15', closesOn: '2026-11-15' };
    await saveEditionSetup(edition.id, { moments: [start, ...setup.moments.slice(1)] });
    return { program, edition, org, founder, kept, out, start, mark };
  };

  it('asks the cohort alone, prefilled from the sheet, and freezes what it sends — the sheet following', async () => {
    const { edition, org, founder, kept, out, start, mark } = await setUp();
    assert.equal(await measureFor(founder.id, start.id, kept.id), null, 'nothing before CEED sends it');

    const { sent } = await launchMoment(edition.id, start.id);
    assert.equal(sent, 1, 'the selected startup only');
    assert.equal((await letters({ email: `salma.${mark}@example.test` })).length, 1);
    assert.equal((await measuresDueFor(kept.id)).length, 1, 'in its to-do');
    assert.equal(await measureFor(founder.id, start.id, out.id), null, 'not a startup outside the cohort');

    const page = (await measureFor(founder.id, start.id, kept.id))!;
    assert.equal(page.answers.i_team, 8, 'what the sheet says');
    await assert.rejects(saveMeasure(founder.id, start.id, kept.id, { i_pilots: 2 }, true), /missing/);

    await saveMeasure(founder.id, start.id, kept.id, { i_team: 12, i_pilots: 2 }, true);
    assert.equal((await dir.getRecord(org.id))!.teamSize, 12, 'the sheet follows');
    const told = (await historyOf(org.id)).find((h) => h.field === 'teamSize');
    assert.equal(told?.sourceLabel, 'Reporting — Début du programme');
    assert.equal((await measuresDueFor(kept.id)).length, 0, 'done');

    // La fiche corrigée ensuite : la mesure du moment reste ce qui a été envoyé.
    await dir.updateRecord(org.id, { teamSize: 20 });
    const view = await reportingView(edition.id);
    assert.deepEqual(view.cohort.map((c) => c.candidateId), [kept.id]);
    assert.equal(view.responses.find((r) => r.momentId === start.id)!.answers.i_team, 12, 'frozen');
  });

  it('counts what the platform knows: applications, cohort, One to One attendance and reports', async () => {
    const { edition, kept } = await setUp();
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const brick = await repo.createBlock(track.phases[0]!.id, 'one_to_one', 'Mentoring');
    const mentor = await dir.createRecord({ kind: 'person', name: `Nadia ${Date.now()}`, origin: 'manual' });
    await repo.updateBlock(brick.id, { config: { interlocutors: [mentor.id], report: { fields: [field('n', 'long_text')] }, perStartup: 2, visibility: 'open' } });
    const [a] = await planMeetings(brick.id, { candidateIds: [kept.id], personId: mentor.id, invite: 'none', heldOn: '2030-01-07', startTime: '09:00' });
    const [b] = await planMeetings(brick.id, { candidateIds: [kept.id], personId: mentor.id, invite: 'none', heldOn: '2030-01-08', startTime: '09:00' });
    await changeMeeting(a!.id, { status: 'held' });
    await changeMeeting(b!.id, { status: 'no_show' });
    const m = await programMetrics(edition.id);
    assert.equal(m.applications.total, 2);
    assert.equal(m.cohort, 1);
    const o = m.oneToOne.find((x) => x.name === 'Mentoring')!;
    assert.equal(o.held, 1);
    assert.equal(o.attendance, 50, 'held over held and missed');
    assert.equal(o.reportRate, 0);
  });

  it('keeps what CEED measures itself, moment by moment', async () => {
    const { program, edition } = await setUp();
    await saveProgramSetup(program.id, { teamIndicators: [field('t_budget', 'number')] });
    const start = (await editionSetup(edition.id)).moments[0]!;
    const view = await putTeamValue(edition.id, start.id, 't_budget', 120000, 'Samia');
    assert.deepEqual(view.teamValues.map((v) => [v.indicatorId, v.value]), [['t_budget', 120000]]);
    await assert.rejects(putTeamValue(edition.id, start.id, 'nope', 1, 'Samia'), /No such indicator/);
  });

  it('will not send a moment without its deadline, and keeps a launched moment launched', async () => {
    const { edition } = await setUp();
    const setup = await editionSetup(edition.id);
    await assert.rejects(launchMoment(edition.id, setup.moments[1]!.id), /deadline/);
    const launched = (await editionSetup(edition.id)).moments[0]!;
    await launchMoment(edition.id, launched.id);
    await saveEditionSetup(edition.id, { moments: (await editionSetup(edition.id)).moments.map((m) => ({ ...m, launchedAt: null })) });
    assert.ok((await editionSetup(edition.id)).moments[0]!.launchedAt, 'the setup does not undo a sending');
  });
});
