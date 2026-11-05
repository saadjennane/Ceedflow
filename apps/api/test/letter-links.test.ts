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
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { meetingLetterPreview, planMeetings } from '../src/services/oneToOne.js';
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
        messages: { ...config.messages, startup: 'Bonjour {{prenom}}. {{preparation}} Page : {{lien}} Visio : https://meet.example.test/abc.' },
      },
    });
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${m}`, origin: 'manual' });
    const email = `karim.${m}@example.test`;
    const person = await dir.createRecord({ kind: 'person', name: 'Karim', emails: [email], origin: 'manual' });
    const a = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: person.id, originBlockId: null });
    const [meeting] = await planMeetings(block.id, { candidateIds: [a.id], personId: mentor.id, invite: 'confirm', heldOn: '2030-10-10', startTime: '10:00' });
    return { meeting: meeting!, person, org, email };
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
