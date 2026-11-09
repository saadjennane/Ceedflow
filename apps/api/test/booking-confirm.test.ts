/**
 * Un créneau choisi se confirme par écrit, avec de quoi le mettre dans son
 * agenda — au One to One comme au comité.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import { calendarSentence, googleCalendarUrl, icsOf, localToUtc, outlookCalendarUrl } from '@ceed/shared';
import { all, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { actionRoutes } from '../src/routes/actions.js';
import { committeeView } from '../src/services/committee.js';
import { answerInvitation, bookSlot, createDay, planMeetings } from '../src/services/oneToOne.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const uniq = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

describe('a time, in a calendar', () => {
  it('reads the hours as Morocco’s, whatever its offset that day', () => {
    /* Ramadan, où le Maroc repasse à UTC : quelle que soit la version des fuseaux, l'heure relue à Casablanca est celle saisie. */
    for (const date of ['2026-11-10', '2027-02-20', '2027-06-15', '2028-01-30']) {
      const at = localToUtc(date, '10:00');
      const back = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
      assert.equal(back, '10:00', date);
    }
  });

  it('writes one event for Google, Outlook and the .ics file', () => {
    const event = { uid: 'mtg_1@ceedflow.com', title: 'Mentoring — Nadia', date: '2026-11-10', start: '10:00', minutes: 45, location: 'CEED, Casablanca' };
    const ics = icsOf(event, 7);
    /* L'écart du Maroc change avec les données de fuseaux : l'attendu se calcule, il ne s'écrit pas en dur. */
    const at = localToUtc('2026-11-10', '10:00');
    const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const [start, end] = [z(at), z(new Date(at.getTime() + 45 * 60_000))];
    assert.ok(ics.includes(`DTSTART:${start}\r\nDTEND:${end}`));
    assert.match(ics, /UID:mtg_1@ceedflow.com/);
    assert.match(ics, /SEQUENCE:7/);
    assert.match(ics, /LOCATION:CEED\\, Casablanca/, 'commas escaped');
    assert.ok(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75), 'lines folded');
    assert.ok(googleCalendarUrl(event).includes(`dates=${start}%2F${end}`));
    assert.ok(outlookCalendarUrl(event).includes(`startdt=${encodeURIComponent(at.toISOString())}`));
    assert.ok(calendarSentence(event).includes('invitation.ics'));
  });

  it('makes a day with no time an all-day event', () => {
    const ics = icsOf({ uid: 'x', title: 'Jury', date: '2026-12-31' });
    assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  });
});

describe('a booking, confirmed', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  before(async () => {
    await migrate();
    await app.register(actionRoutes);
    await app.ready();
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  const lettersTo = (email: string) =>
    all<{ kind: string; subject: string; body: string; attachments: { filename: string; content: string }[] }>(
      'select kind, subject, body, attachments from outbox where to_email = $1 order by created_at',
      [email],
    );

  /** An edition that is live, and a startup with somebody to write to. */
  const setUp = async (type: 'one_to_one' | 'committee') => {
    const mark = uniq();
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const block = await repo.createBlock(track.phases[0]!.id, type, type === 'committee' ? 'Jury Day' : 'Mentoring');
    const founder = `fondateur.${mark}@example.test`;
    const contact = await dir.createRecord({ kind: 'person', name: `Karim ${mark}`, emails: [founder], origin: 'manual' });
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    const cand = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: contact.id, originBlockId: null });
    return { mark, block, founder, cand };
  };

  it('One to One: a booked slot confirms to the startup and its interlocutor, each with the invitation', async () => {
    const { mark, block, founder, cand } = await setUp('one_to_one');
    const mentorEmail = `nadia.${mark}@example.test`;
    const mentor = await dir.createRecord({ kind: 'person', name: `Nadia ${mark}`, emails: [mentorEmail], origin: 'manual' });
    await repo.updateBlock(block.id, { config: { interlocutors: [mentor.id], visibility: 'open' } });
    const day = await createDay(block.id, {
      name: 'Day 1', heldOn: '2030-02-04', windows: [{ startsAt: '09:00', endsAt: '10:30' }], minutesPerMeeting: 45,
      location: 'CEED', interlocutors: [mentor.id],
    });
    const [m] = await planMeetings(block.id, { candidateIds: [cand.id], personId: null, invite: 'slots', heldOn: null, startTime: null });
    assert.equal((await lettersTo(founder)).length, 0, 'nothing yet');

    await bookSlot(m!.token, { dayId: day.id, startTime: '09:45', personId: mentor.id });
    const [toStartup] = await lettersTo(founder);
    assert.equal(toStartup!.kind, 'one_to_one_confirm');
    assert.ok(toStartup!.body.includes('09:45'));
    assert.ok(toStartup!.body.includes('calendar.google.com'));
    assert.ok(!toStartup!.body.includes('{{'), 'every variable filled');
    assert.equal(toStartup!.attachments[0]!.filename, 'invitation.ics');
    assert.match(toStartup!.attachments[0]!.content, new RegExp(`UID:${m!.id}@ceedflow.com`));
    const [toMentor] = await lettersTo(mentorEmail);
    assert.equal(toMentor!.kind, 'one_to_one_confirm_person');
    assert.ok(toMentor!.subject.includes(`Atlas ${mark}`));

    /* Une autre heure : une nouvelle confirmation, la même invitation mise à jour. */
    await bookSlot(m!.token, { dayId: day.id, startTime: '09:00', personId: mentor.id });
    const again = await lettersTo(founder);
    assert.equal(again.length, 2);
    assert.match(again[1]!.attachments[0]!.content, new RegExp(`UID:${m!.id}@ceedflow.com`));
  });

  it('One to One: a proposed time confirmed once is confirmed once — and not at all when switched off', async () => {
    const { mark, block, founder, cand } = await setUp('one_to_one');
    const mentor = await dir.createRecord({ kind: 'person', name: `Omar ${mark}`, origin: 'manual' });
    await repo.updateBlock(block.id, { config: { interlocutors: [mentor.id], visibility: 'open', perStartup: 2 } });
    const [m] = await planMeetings(block.id, { candidateIds: [cand.id], personId: mentor.id, invite: 'confirm', heldOn: '2030-03-03', startTime: '14:00' });
    await answerInvitation(m!.token, true);
    await answerInvitation(m!.token, true);
    assert.deepEqual((await lettersTo(founder)).map((l) => l.kind), ['one_to_one_confirm']);

    const config = (await repo.getBlock(block.id))!.config as { messages: object };
    await repo.updateBlock(block.id, { config: { messages: { ...config.messages, confirmOn: false } } });
    const [n] = await planMeetings(block.id, { candidateIds: [cand.id], personId: mentor.id, invite: 'confirm', heldOn: '2030-03-04', startTime: '14:00' });
    await answerInvitation(n!.token, true);
    assert.equal((await lettersTo(founder)).length, 1, 'switched off: nothing more');
  });

  it('Committee: a picked time confirms to the startup, with the invitation', async () => {
    const { block, founder, cand } = await setUp('committee');
    await repo.updateBlock(block.id, { config: { rsvpMode: 'slots', rsvp: { visibility: 'open' } } });
    const sitting = await repo.createSession(block.id, {
      name: 'Séance 1', heldOn: '2030-04-10', location: 'Technopark',
      windows: [{ startsAt: '09:00', endsAt: '10:00' }], minutesPerStartup: 20, jury: [],
    });
    await repo.assignToSession(sitting.id, [cand.id]);
    const token = (await committeeView(block.id))!.sessions[0]!.assignments[0]!.assignment.token;

    const res = await app.inject({ method: 'POST', url: `/api/public/book/${token}`, payload: { rsvpState: 'confirmed', slotIndex: 1 } });
    assert.equal(res.statusCode, 200, res.body);
    const [letter] = await lettersTo(founder);
    assert.equal(letter!.kind, 'committee_confirm');
    assert.ok(letter!.body.includes('09:20'));
    assert.ok(!letter!.body.includes('{{'));
    const nine20 = localToUtc('2030-04-10', '09:20').toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    assert.ok(letter!.attachments[0]!.content.includes(`DTSTART:${nine20}`));

    /* La même réponse renvoyée ne réécrit pas. */
    await app.inject({ method: 'POST', url: `/api/public/book/${token}`, payload: { rsvpState: 'confirmed', slotIndex: 1 } });
    assert.equal((await lettersTo(founder)).length, 1);
  });
});
