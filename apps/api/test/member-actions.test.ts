/**
 * La page d'accueil d'un membre : tout ce qu'il a à faire, tous rôles
 * confondus, lu sur les objets eux-mêmes — si bien que le faire ailleurs le
 * fait disparaître d'ici, sans copie à cocher.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { memberActions } from '../src/services/memberActions.js';
import { answerInvitation, changeMeeting, planMeetings, saveReport } from '../src/services/oneToOne.js';
import { changeTask, createTasks } from '../src/services/tasks.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => Math.random().toString(36).slice(2, 8);
const REPORT = [{ id: 'note', label: 'Note', type: 'long_text', required: false, options: [], help: '' }];

describe('a member’s Home', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  /** A live edition with an open One to One, a startup and its founder, and a mentor. */
  const setUp = async () => {
    const mark = uniq();
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const block = await repo.createBlock(track.phases[0]!.id, 'one_to_one', 'Mentoring');
    const mentor = await dir.createRecord({ kind: 'person', name: `Nadia ${mark}`, origin: 'manual' });
    await repo.updateBlock(block.id, { config: { interlocutors: [mentor.id], report: { fields: REPORT }, visibility: 'open' } });
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    const founder = await dir.createRecord({ kind: 'person', name: `Karim ${mark}`, origin: 'manual' });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });
    const candidate = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: founder.id });
    return { block, mentor, founder, org, candidate };
  };

  it('asks the startup to confirm a proposed meeting, and moves it to what is coming once confirmed', async () => {
    const { block, mentor, founder, candidate } = await setUp();
    const [m] = await planMeetings(block.id, { candidateIds: [candidate.id], personId: mentor.id, invite: 'confirm', heldOn: '2030-03-03', startTime: '10:00' });
    let home = await memberActions(founder.id);
    const ask = home.actions.find((a) => a.kind === 'answer_meeting');
    assert.ok(ask, 'an answer is asked of the startup');
    assert.equal(ask!.answer, 'confirm');
    assert.equal(ask!.href, `/meet/${m!.token}`);
    assert.ok(home.upcoming.some((u) => u.kind === 'one_to_one' && u.on === '2030-03-03'), 'and it is on the calendar');

    await answerInvitation(m!.token, true);
    home = await memberActions(founder.id);
    assert.equal(home.actions.some((a) => a.kind === 'answer_meeting'), false, 'answered elsewhere, gone from here');
  });

  it('asks the mentor for the report once the meeting is held, and forgets it once sent', async () => {
    const { block, mentor, candidate } = await setUp();
    const [m] = await planMeetings(block.id, { candidateIds: [candidate.id], personId: mentor.id, invite: 'none', heldOn: '2030-04-04', startTime: '09:00' });
    let home = await memberActions(mentor.id);
    assert.equal(home.actions.some((a) => a.kind === 'report'), false, 'nothing to write before it is held');
    assert.ok(home.upcoming.some((u) => u.kind === 'one_to_one' && u.role === 'mentor'));

    await changeMeeting(m!.id, { status: 'held' });
    home = await memberActions(mentor.id);
    const due = home.actions.find((a) => a.kind === 'report');
    assert.ok(due, 'the report is asked for');
    assert.equal(due!.role, 'mentor');
    assert.equal(due!.href, `/meeting/${m!.id}`);

    await saveReport(m!.id, { note: 'Bonne séance.' }, true, { id: mentor.id, name: 'Nadia' });
    home = await memberActions(mentor.id);
    assert.equal(home.actions.some((a) => a.kind === 'report'), false, 'sent, and gone');
  });

  it('lists a task given to the startup, and drops it once done', async () => {
    const { org, founder } = await setUp();
    const [task] = await createTasks(
      { title: 'Envoyer le RC', detail: '', dueOn: '2020-01-01', ownerIds: [org.id], recordId: null, editionId: null, blockId: null, candidateId: null },
      null,
    );
    let home = await memberActions(founder.id);
    const line = home.actions.find((a) => a.id === `task:${task!.id}`);
    assert.ok(line);
    assert.equal(line!.status, 'late', 'a date gone by is late');
    assert.equal(home.actions[0]!.status, 'late', 'and late comes first');

    await changeTask(task!.id, { state: 'done' }, null);
    home = await memberActions(founder.id);
    assert.equal(home.actions.some((a) => a.id === `task:${task!.id}`), false);
  });
});
