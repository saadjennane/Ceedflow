/**
 * Les liens d'une lettre, vérifiés avant l'envoi — et la préparation telle
 * que la startup la verra, ouverte par CEED en lecture seule.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { authRoutes } from '../src/routes/auth.js';
import { oneToOnePublicRoutes, oneToOneRoutes } from '../src/routes/oneToOne.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { invitationPreview, inviteToBook, meetingLetterPreview, planMeetings, prepsDueFor } from '../src/services/oneToOne.js';
import { letters } from '../src/services/mail.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('the links of a letter', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const was = process.env.APP_URL;
  before(async () => {
    process.env.APP_URL = 'https://app.example.test';
    await app.register(cookie);
    await app.register(authRoutes);
    await app.register(oneToOneRoutes);
    await app.register(oneToOnePublicRoutes);
    await app.ready();
  });
  after(async () => {
    if (was === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = was;
    await app.close();
  });

  const setUp = async () => {
    const m = `${mark}.${Math.random().toString(36).slice(2, 6)}`;
    const program = await repo.createProgram({ name: `Grow ${m}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const block = await repo.createBlock(track.phases[0]!.id, 'one_to_one', 'Mentoring');
    const mentor = await dir.createRecord({ kind: 'person', name: `Nadia ${m}`, origin: 'manual' });
    const config = (await repo.getBlock(block.id))!.config as { messages: Record<string, unknown> };
    await repo.updateBlock(block.id, {
      config: {
        ...config,
        interlocutors: [mentor.id],
        visibility: 'open',
        prep: { enabled: true, fields: [{ id: 'topics', label: 'Topics', type: 'long_text', required: true, options: [], help: '' }] },
        messages: { ...config.messages, startup: 'Bonjour {{prenom}}. {{preparation}} Ou : {{lien_preparation}} Page : {{lien}} Visio : https://meet.example.test/abc.' },
      },
    });
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${m}`, origin: 'manual' });
    const email = `karim.${m}@example.test`;
    const person = await dir.createRecord({ kind: 'person', name: 'Karim', emails: [email], origin: 'manual' });
    const a = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id, originBlockId: null });
    const [meeting] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'confirm', heldOn: '2030-10-10', startTime: '10:00' });
    return { meeting: meeting!, person, org, email, block, a, track, edition };
  };

  it('checks each link as the startup will follow it — and says it cannot sign in to prepare without an account', async () => {
    const { meeting, person, org, email } = await setUp();
    const before = await meetingLetterPreview(meeting.id);
    const by = (what: string) => before.checks.find((c) => c.what === what)!;
    assert.equal(by('Booking page').ok, true);
    assert.ok(by('Booking page').url.endsWith(`/meet/${meeting.token}`));
    assert.equal(by('Preparation').ok, false, 'no account yet');
    assert.match(by('Preparation').note, /no account/);
    assert.equal(by('Outside link').ok, true);
    assert.equal(by('Outside link').url, 'https://meet.example.test/abc', 'the full stop is not part of it');

    await dir.linkRecords({ personId: person.id, orgId: org.id, access: 'admin' });
    await createAccount({ email, password: 'chosen-by-them', recordId: person.id });
    const now = await meetingLetterPreview(meeting.id);
    assert.equal(now.checks.find((c) => c.what === 'Preparation')!.ok, true, 'they can sign in now');
  });

  const staffSession = async () => {
    const m = `${mark}.${Math.random().toString(36).slice(2, 6)}`;
    const r = await dir.createRecord({ kind: 'person', name: 'Samia', emails: [`samia.${m}@example.test`], origin: 'manual' });
    const acc = await createAccount({ email: `samia.${m}@example.test`, password: 'chosen-by-them', recordId: r.id });
    await setStaffRole(acc.id, 'admin');
    return { cookie: `${SESSION_COOKIE}=${(await createSession(acc.id)).token}` };
  };

  it('gives the preparation link from the invitation on, before a time is picked — and pages to see it before inviting', async () => {
    const { block, edition, track, email: _e } = await setUp();
    const org = await dir.createRecord({ kind: 'org', name: `Badr ${mark}`, origin: 'manual' });
    const founder = `salma.${mark}.${Math.random().toString(36).slice(2, 6)}@example.test`;
    const person = await dir.createRecord({ kind: 'person', name: 'Salma', emails: [founder], origin: 'manual' });
    const b = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id, originBlockId: null });

    const ahead = await invitationPreview(block.id, b.id);
    assert.ok(ahead.body.includes('(son lien de préparation)'), 'said, not left empty');
    const prep = ahead.checks.find((c) => c.what === 'Preparation')!;
    assert.equal(prep.url, `https://app.example.test/preview/prepare/${block.id}/${b.id}`);
    assert.equal(prep.ok, false, 'no account yet: said before sending');
    assert.equal(ahead.checks.find((c) => c.what === 'Booking page')!.url, `https://app.example.test/preview/meet/${block.id}/${b.id}`);

    const headers = await staffSession();
    const page = await app.inject({ method: 'GET', url: `/api/blocks/${block.id}/one-to-one/preview-page/${b.id}`, headers });
    assert.equal(page.statusCode, 200);
    assert.equal(page.json().asStaff, true);
    assert.ok(page.json().prep, 'the form they will fill');

    const test = await app.inject({ method: 'POST', url: `/api/blocks/${block.id}/one-to-one/invite-test`, headers, payload: { candidateId: b.id } });
    assert.equal(test.statusCode, 200);
    const [mine] = await letters({ email: test.json().to });
    assert.ok(mine!.body.includes(`/preview/prepare/${block.id}/${b.id}`), 'the test opens the preview pages');

    await inviteToBook(block.id, [b.id], null, true);
    const [sent] = await letters({ email: founder });
    const due = await prepsDueFor(b.id);
    assert.equal(due.length, 1, 'to prepare before booking');
    assert.ok(sent!.body.includes(`/prepare/${due[0]!.meeting.id}`), 'their own preparation link, before a time');
  });

  it('lets CEED look at a startup’s booking page, never book or answer for it', async () => {
    const { meeting } = await setUp();
    const headers = await staffSession();
    const seen = await app.inject({ method: 'GET', url: `/api/public/meet/${meeting.token}`, headers });
    assert.equal(seen.json().asStaff, true);
    const anon = await app.inject({ method: 'GET', url: `/api/public/meet/${meeting.token}` });
    assert.equal(anon.json().asStaff, false);
    const answered = await app.inject({ method: 'POST', url: `/api/public/meet/${meeting.token}`, headers, payload: { accept: true } });
    assert.equal(answered.statusCode, 403);
  });

  it('shows CEED the preparation page as the startup will see it, and lets CEED write nothing there', async () => {
    const { meeting } = await setUp();
    const r = await dir.createRecord({ kind: 'person', name: 'Samia', emails: [`samia.${mark}@example.test`], origin: 'manual' });
    const acc = await createAccount({ email: `samia.${mark}@example.test`, password: 'chosen-by-them', recordId: r.id });
    await setStaffRole(acc.id, 'admin');
    const token = (await createSession(acc.id)).token;
    const headers = { cookie: `${SESSION_COOKIE}=${token}` };
    const seen = await app.inject({ method: 'GET', url: `/api/me/prepare/${meeting.id}`, headers });
    assert.equal(seen.statusCode, 200);
    assert.equal(seen.json().asStaff, true);
    assert.ok(seen.json().prep, 'the form they will fill');
    const wrote = await app.inject({ method: 'PUT', url: `/api/me/prepare/${meeting.id}`, headers, payload: { answers: { topics: 'x' }, submit: true } });
    assert.equal(wrote.statusCode, 404, 'nothing written in their place');
  });
});
