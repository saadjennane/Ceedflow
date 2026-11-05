/**
 * L'activité d'une organisation et les notes de l'équipe : un fil unique, des
 * notes que seul CEED lit et que seul leur auteur corrige, et tous ses
 * fichiers au même endroit.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { directoryRoutes } from '../src/routes/directory.js';
import { authRoutes } from '../src/routes/auth.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('an organisation’s activity, and the team’s notes', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  let samia = '';
  let omar = '';
  let founder = '';
  let orgId = '';

  const staff = async (name: string) => {
    const r = await dir.createRecord({ kind: 'person', name, emails: [`${name.toLowerCase()}.${mark}@example.test`], origin: 'manual' });
    const a = await createAccount({ email: `${name.toLowerCase()}.${mark}@example.test`, password: 'chosen-by-them', recordId: r.id });
    await setStaffRole(a.id, 'admin');
    return (await createSession(a.id)).token;
  };

  before(async () => {
    await app.register(cookie);
    await app.register(directoryRoutes);
    await app.register(authRoutes);
    await app.ready();
    samia = await staff('Samia');
    omar = await staff('Omar');
    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    orgId = org.id;
    const person = await dir.createRecord({ kind: 'person', name: 'Karim', emails: [`karim.${mark}@example.test`], origin: 'manual' });
    await dir.linkRecords({ personId: person.id, orgId, access: 'admin' });
    const acc = await createAccount({ email: `karim.${mark}@example.test`, password: 'chosen-by-them', recordId: person.id });
    founder = (await createSession(acc.id)).token;
  });
  after(() => app.close());

  const call = async (token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie: `${SESSION_COOKIE}=${token}` }, payload: payload as object });
    return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
  };

  it('marks as registered an organisation somebody holding it has signed in for, and that person', async () => {
    const lone = await dir.createRecord({ kind: 'org', name: `Badr ${mark}`, origin: 'manual' });
    const orgsList = (await call(samia, 'GET', '/api/records?kind=org')).body as { id: string; registered: boolean }[];
    assert.equal(orgsList.find((r) => r.id === orgId)!.registered, true, 'Karim chose their own password');
    assert.equal(orgsList.find((r) => r.id === lone.id)!.registered, false, 'nobody holds it');
    const people = (await call(samia, 'GET', '/api/records?kind=person')).body as { email: string; registered: boolean }[];
    assert.equal(people.find((r) => r.email === `karim.${mark}@example.test`)?.registered, true);
  });

  it('keeps the team’s notes for the team, changed only by who wrote them, in one thread with the rest', async () => {
    const note = await call(samia, 'POST', `/api/records/${orgId}/notes`, { body: 'Appel du 3/11 : cherche un CFO.' });
    assert.equal(note.status, 201);
    await call(samia, 'PATCH', `/api/records/${orgId}`, { teamSize: 9 });

    const feed = (await call(omar, 'GET', `/api/records/${orgId}/activity`)).body as { kind: string; label: string; at: string }[];
    assert.ok(feed.some((i) => i.kind === 'note' && i.label.includes('CFO')));
    assert.ok(feed.some((i) => i.kind === 'sheet'), 'with the sheet’s history');
    assert.deepEqual(feed.map((i) => i.at), [...feed.map((i) => i.at)].sort().reverse(), 'most recent first');

    assert.equal((await call(omar, 'PATCH', `/api/notes/${note.body.id}`, { body: 'x' })).status, 403, 'not his note');
    assert.equal((await call(samia, 'PATCH', `/api/notes/${note.body.id}`, { body: 'Appel : cherche un CFO et un CTO.' })).status, 200);
    assert.equal((await call(founder, 'GET', `/api/records/${orgId}/activity`)).status, 401, 'never the startup’s');
    assert.equal((await call(samia, 'DELETE', `/api/notes/${note.body.id}`)).status, 200);
  });

  it('gathers every file it gave, with where it came from', async () => {
    const program = await repo.createProgram({ name: `Grow ${mark}` });
    const edition = await repo.createEdition(program.id, { name: '2026' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const due = await repo.createBlock(track.phases[0]!.id, 'deliverable', 'Pièces');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: [{ id: 'rc', type: 'file', label: 'Registre', help: '', required: true, options: [], showInTable: false, pageId: '' }] } });
    const c = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId });
    const upload = await repo.saveUpload({ filename: 'rc.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4'), fieldId: 'rc', uploadedBy: '' });
    await repo.saveReturn(due.id, c.id, 'rc', { uploadId: upload.id, filename: 'rc.pdf' });
    const files = (await call(samia, 'GET', `/api/records/${orgId}/files`)).body as { label: string; origin: string; filename: string }[];
    assert.ok(files.some((f) => f.label === 'Registre' && f.origin.startsWith('Pièces') && f.filename === 'rc.pdf'));
  });
});
