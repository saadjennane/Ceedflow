/**
 * Les One to One : qui rencontre qui, quand, et ce qui s'en écrit.
 *
 * What these hold to: a startup meets from the pool its phase hands down;
 * nobody is in two places at once, across bricks; a moved proposal is a new
 * proposal; a report is kept as it is written and sent once, whole; and an
 * interlocutor sees their own meetings and nobody else's.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { freeSlots, seriesDates, summarise, type FormField } from '@ceed/shared';
import { all } from '../src/db/client.js';
import { letters } from '../src/services/mail.js';
import { agendaFor } from '../src/services/agenda.js';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import {
  addAvailability, bookSlot, bricksFor, cancelFollowing, changeMeeting, historyOf, invitationFor, meetingFor,
  meetingsFor, oneToOneView, planMeetings, saveReport, tellMeeting,
} from '../src/services/oneToOne.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

const REPORT: FormField[] = [
  { id: 'topic', type: 'select', label: 'Sujet', help: '', required: true, options: ['Finance', 'Produit'], showInTable: false, pageId: '' },
  { id: 'notes', type: 'long_text', label: 'Notes', help: '', required: false, options: [], showInTable: false, pageId: '' },
];

describe('what a report sums up to', () => {
  it('counts choices per option, keeping an answer no longer offered', () => {
    const s = summarise(REPORT[0]!, [{ topic: 'Finance' }, { topic: 'Finance' }, { topic: 'Juridique' }, {}]);
    assert.equal(s.kind, 'choice');
    assert.equal(s.answered, 3);
    assert.deepEqual(s.kind === 'choice' && s.counts, [
      { option: 'Finance', count: 2 }, { option: 'Produit', count: 0 }, { option: 'Juridique', count: 1 },
    ]);
  });

  it('gives a number its average and range', () => {
    const field: FormField = { ...REPORT[1]!, id: 'n', type: 'number' };
    const s = summarise(field, [{ n: 2 }, { n: 4 }, { n: '' }]);
    assert.deepEqual(s.kind === 'number' && [s.answered, s.average, s.min, s.max], [2, 3, 2, 4]);
  });
});

describe('free slots and series', () => {
  it('cuts a stretch into slots, leaves out what is taken and what is past', () => {
    const slots = freeSlots(
      [{ onDate: '2026-11-10', startTime: '09:00', endTime: '11:00', slotMinutes: 45 }, { onDate: '2026-10-01', startTime: '09:00', endTime: '10:00', slotMinutes: 30 }],
      [{ heldOn: '2026-11-10', startTime: '09:45' }],
      '2026-10-30',
    );
    assert.deepEqual(slots.map((x) => x.startTime), ['09:00'], '09:45 is taken, 10:30 would run past 11:00, October is gone');
  });

  it('dates a series at its rhythm, never past its end, never past 52', () => {
    assert.deepEqual(seriesDates('2026-11-03', 'weekly', { count: 3 }), ['2026-11-03', '2026-11-10', '2026-11-17']);
    assert.deepEqual(seriesDates('2026-11-03', 'biweekly', { until: '2026-12-01' }), ['2026-11-03', '2026-11-17', '2026-12-01']);
    assert.deepEqual(seriesDates('2026-01-31', 'monthly', { count: 3 }), ['2026-01-31', '2026-02-28', '2026-03-31'], 'a 31st falls back in a short month');
    assert.equal(seriesDates('2026-01-05', 'weekly', { until: '2030-01-01' }).length, 52);
  });
});

describe('a One to One', { skip: skipWithoutServer }, () => {
  before(migrate);
  after(closeDb);

  /** An edition that is live, a brick that is open, two startups, two interlocutors. */
  const setUp = async () => {
    const mark = uniq();
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const block = await repo.createBlock(track.phases[0]!.id, 'one_to_one', 'Mentoring');
    const mentor = await dir.createRecord({ kind: 'person', name: `Nadia ${mark}`, origin: 'manual' });
    const expert = await dir.createRecord({ kind: 'person', name: `Omar ${mark}`, origin: 'manual' });
    await repo.updateBlock(block.id, {
      config: { interlocutors: [mentor.id, expert.id], report: { fields: REPORT }, visibility: 'open' },
    });
    const orgA = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    const orgB = await dir.createRecord({ kind: 'org', name: `Badr ${mark}`, origin: 'manual' });
    const a = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: orgA.id, personId: null, originBlockId: null });
    const b = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: orgB.id, personId: null, originBlockId: null });
    return { edition, track, block, mentor, expert, a, b };
  };

  it('draws its startups from the track, withdrawals excluded', async () => {
    const { block, a, b } = await setUp();
    await repo.updateCandidate(b.id, { status: 'Withdrawn' });
    const view = await oneToOneView(block.id);
    assert.deepEqual(view!.pool.map((p) => p.candidate.id), [a.id]);
    assert.equal(view!.interlocutors.length, 2);
  });

  it('refuses a proposal with no time, a stranger to the brick, and a startup that has not reached it', async () => {
    const { block, mentor, a } = await setUp();
    await assert.rejects(planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'confirm', heldOn: null, startTime: null }));
    const stranger = await dir.createRecord({ kind: 'person', name: `X ${uniq()}`, origin: 'manual' });
    await assert.rejects(planMeetings(block.id, { candidateIds: [a.id], personId: stranger.id, invite: 'none', heldOn: '2026-11-03', startTime: '10:00' }));
    await assert.rejects(planMeetings(block.id, { candidateIds: ['cnd_nope'], personId: mentor.id, invite: 'none', heldOn: '2026-11-03', startTime: '10:00' }));
  });

  it('puts nobody in two places at once — across bricks — and frees a cancelled time', async () => {
    const { block, mentor, a, b, track } = await setUp();
    const [first] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'none', heldOn: '2026-11-03', startTime: '10:00' });
    assert.equal(first!.rsvpState, 'confirmed', 'fixed without invitation: nothing to wait for');
    await assert.rejects(planMeetings(block.id, { candidateIds: [b.id], personId: mentor.id, invite: 'none', heldOn: '2026-11-03', startTime: '10:00' }));

    const other = await repo.createBlock(track.phases[0]!.id, 'one_to_one', 'Experts');
    await repo.updateBlock(other.id, { config: { interlocutors: [mentor.id], report: { fields: REPORT }, visibility: 'open' } });
    await assert.rejects(planMeetings(other.id, { candidateIds: [b.id], personId: mentor.id, invite: 'none', heldOn: '2026-11-03', startTime: '10:00' }), 'another brick, same person, same time');

    await changeMeeting(first!.id, { status: 'cancelled' });
    const [again] = await planMeetings(block.id, { candidateIds: [b.id], personId: mentor.id, invite: 'none', heldOn: '2026-11-03', startTime: '10:00' });
    assert.ok(again);
  });

  it('asks again when a proposed time moves', async () => {
    const { block, mentor, a } = await setUp();
    const [m] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'confirm', heldOn: '2026-11-04', startTime: '11:00' });
    assert.equal(m!.rsvpState, 'pending');
    await (await import('../src/db/client.js')).all(`update one_to_one_meetings set rsvp_state = 'confirmed' where id = $1`, [m!.id]);
    const moved = await changeMeeting(m!.id, { startTime: '15:00' });
    assert.equal(moved!.rsvpState, 'pending', 'a yes to 11:00 is not a yes to 15:00');
  });

  it('keeps a report as it is written, and sends it only whole', async () => {
    const { block, mentor, a } = await setUp();
    const [m] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'none', heldOn: '2026-11-05', startTime: '09:00' });
    const by = { id: mentor.id, name: mentor.name };
    const draft = await saveReport(m!.id, { notes: 'Bon échange.', invented: 'x' }, false, by);
    assert.deepEqual(draft.report, { notes: 'Bon échange.' }, 'only the report’s own questions are kept');
    assert.equal(draft.reportSubmittedAt, null);
    await assert.rejects(saveReport(m!.id, { notes: 'Bon échange.' }, true, by), 'the topic is required to send');
    const sent = await saveReport(m!.id, { notes: 'Bon échange.', topic: 'Finance' }, true, by);
    assert.ok(sent.reportSubmittedAt);
    assert.equal(sent.status, 'held', 'a report sent is a meeting held');
    assert.equal(sent.reportByName, mentor.name);
  });

  it('shows an interlocutor their own meetings, not a colleague’s, and not a draft edition’s', async () => {
    const { block, mentor, expert, a, b, edition } = await setUp();
    await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'none', heldOn: '2026-11-06', startTime: '09:00' });
    const [hers] = await planMeetings(block.id, { candidateIds: [b.id], personId: expert.id, invite: 'none', heldOn: '2026-11-06', startTime: '09:00' });
    const mine = await meetingsFor(mentor.id);
    assert.deepEqual(mine.map((m) => m.candidateId), [a.id]);
    assert.equal(mine[0]!.state, 'open');
    assert.equal(await meetingFor(mentor.id, hers!.id), null, 'not someone else’s');
    const detail = await meetingFor(mentor.id, mine[0]!.id);
    assert.equal(detail!.questions.pages[0]!.fields.length, 2);

    await repo.updateBlock(block.id, { config: { visibility: 'closed' } });
    assert.equal((await meetingsFor(mentor.id))[0]!.state, 'closed', 'closed: read, not written');
    await repo.updateEdition(edition.id, { status: 'Draft' });
    assert.deepEqual(await meetingsFor(mentor.id), [], 'a draft edition has no outside');
  });

  it('plans a series whole or not at all, and cancels the following sessions without touching the past', async () => {
    const { block, mentor, a, b } = await setUp();
    await planMeetings(block.id, { candidateIds: [b.id], personId: mentor.id, invite: 'none', heldOn: '2030-01-15', startTime: '10:00' });
    await assert.rejects(
      planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'none', heldOn: '2030-01-01', startTime: '10:00', repeat: { frequency: 'weekly', count: 4, until: null } }),
      'the third session clashes: nothing is created',
    );
    assert.equal((await oneToOneView(block.id))!.meetings.filter((m) => m.candidateId === a.id).length, 0);

    const made = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'none', heldOn: '2030-01-02', startTime: '10:00', repeat: { frequency: 'weekly', count: 4, until: null } });
    assert.equal(made.length, 4);
    assert.ok(made.every((m) => m.seriesId === made[0]!.seriesId));
    await changeMeeting(made[0]!.id, { status: 'held' });
    assert.equal(await cancelFollowing(made[2]!.id), 2);
    const after = (await oneToOneView(block.id))!.meetings.filter((m) => m.seriesId === made[0]!.seriesId);
    assert.deepEqual(after.map((m) => m.status), ['held', 'planned', 'cancelled', 'cancelled']);
  });

  it('lets a startup book from the interlocutor’s availability, and not a slot taken meanwhile', async () => {
    const { block, mentor, a, b } = await setUp();
    await addAvailability(block.id, mentor.id, { onDate: '2030-02-04', startTime: '09:00', endTime: '10:30', slotMinutes: 45 });
    const [ma, mb] = await planMeetings(block.id, { candidateIds: [a.id, b.id], personId: mentor.id, invite: 'slots', heldOn: null, startTime: null });
    const page = await invitationFor(ma!.token);
    assert.deepEqual(page!.page.slots.map((x) => x.startTime), ['09:00', '09:45']);
    await bookSlot(ma!.token, '2030-02-04', '09:00');
    await assert.rejects(bookSlot(mb!.token, '2030-02-04', '09:00'), 'taken a moment ago');
    assert.deepEqual((await invitationFor(mb!.token))!.page.slots.map((x) => x.startTime), ['09:45']);
    const booked = (await oneToOneView(block.id))!.meetings.find((m) => m.id === ma!.id)!;
    assert.deepEqual([booked.heldOn, booked.startTime, booked.rsvpState], ['2030-02-04', '09:00', 'confirmed']);
    assert.ok((await bricksFor(mentor.id)).some((x) => x.blockId === block.id), 'the interlocutor may publish here');
  });

  it('writes to the startup with its own link, and to the interlocutor with the meeting', async () => {
    /* L'adresse publique de l'app, que la production connaît par APP_URL. */
    const before = process.env.APP_URL;
    process.env.APP_URL = 'https://app.example.test';
    after(() => {
      if (before === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = before;
    });
    const { block, mentor, a } = await setUp();
    const founder = `fondateur.${uniq()}@example.test`;
    await all(`update records set emails = $2::jsonb where id = $1`, [mentor.id, [`nadia.${uniq()}@example.test`]]);
    /* La startup s'écrit à son contact : la personne qui a candidaté pour elle. */
    const contact = await dir.createRecord({ kind: 'person', name: `Karim ${uniq()}`, emails: [founder], origin: 'manual' });
    await all(`update candidates set person_id = $2 where id = $1`, [a.id, contact.id]);
    const [m] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'confirm', heldOn: '2030-03-03', startTime: '14:00' });
    const told = await tellMeeting(m!.id, { startup: true, person: true });
    assert.equal(told.person, true);
    const seen = (await oneToOneView(block.id))!.meetings.find((x) => x.id === m!.id)!;
    assert.ok(seen.toldPersonAt);
    assert.equal(told.startup, true);
    const [letter] = await letters({ email: founder });
    assert.ok(letter!.body.includes(`https://app.example.test/meet/${m!.token}`), 'the startup’s own link');
    assert.ok(letter!.body.includes('14:00'));
    assert.ok(letter!.body.startsWith('Bonjour Karim'), 'their contact, by first name');
  });

  it('puts what is coming in the startup’s agenda, and keeps the history', async () => {
    const { block, mentor, a } = await setUp();
    const [m] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'confirm', heldOn: '2030-04-01', startTime: '11:00' });
    const agenda = await agendaFor(a.id);
    const entry = agenda.find((e) => e.kind === 'one_to_one');
    assert.equal(entry?.with, mentor.name);
    assert.equal(entry?.endsAt, '11:45');
    assert.equal(entry?.link, `/meet/${m!.token}`, 'still waiting on their answer: the link is there');
    assert.equal((await historyOf({ candidateId: a.id }))[0]?.blockName, 'Mentoring');
  });
});

