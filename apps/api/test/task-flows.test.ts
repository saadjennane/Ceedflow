/**
 * Une tâche bloquée dit pourquoi et qui peut la débloquer ; une tâche à valider
 * attend son valideur, et lui seul la termine. Tout s'inscrit dans son
 * historique, pièces jointes comprises.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { taskRoutes } from '../src/routes/tasks.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { letters } from '../src/services/mail.js';
import { sendLateDigests } from '../src/services/taskNotices.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('a task’s flow', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const people: Record<string, { token: string; recordId: string; email: string }> = {};

  const member = async (name: string, role: 'admin' | 'editor' | null) => {
    const email = `${name.toLowerCase()}.${mark}@example.test`;
    const r = await dir.createRecord({ kind: 'person', name: `${name} ${mark}`, emails: [email], origin: 'manual' });
    const a = await createAccount({ email, password: 'chosen-by-them', recordId: r.id });
    if (role) await setStaffRole(a.id, role);
    people[name] = { token: (await createSession(a.id)).token, recordId: r.id, email };
  };

  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(taskRoutes);
    await app.ready();
    await member('Saad', 'admin');
    await member('Reda', 'editor');
    await member('Ghita', 'editor');
    await member('Mentor', null);
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  const call = async (who: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie: `${SESSION_COOKIE}=${people[who]!.token}` }, payload: payload as object });
    return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
  };
  const make = async (extra: object = {}) =>
    (await call('Saad', 'POST', '/api/tasks', { title: `Budget ${mark}`, ownerIds: [people.Saad!.recordId, people.Reda!.recordId], tell: false, ...extra })).body[0];

  it('is owned by the team, entrusted to a mentor, linked to a programme and a startup together', async () => {
    assert.equal((await call('Saad', 'POST', '/api/tasks', { title: 'x', ownerIds: [people.Mentor!.recordId], tell: false })).status, 422);
    const program = await repo.createProgram({ name: `Builders ${mark}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    const org = await dir.createRecord({ kind: 'org', name: `Rafid ${mark}`, origin: 'manual' });
    const t = await make({ delegateId: people.Mentor!.recordId, editionId: edition.id, recordId: org.id });
    assert.equal(t.owners.length, 2);
    assert.equal(t.delegate.id, people.Mentor!.recordId);
    assert.equal(t.editionId, edition.id);
    assert.equal(t.recordId, org.id);
    assert.equal(t.subjectName, org.name);
  });

  it('when stuck, says why and asks a colleague to unblock it — who is told, and sees it waiting', async () => {
    const t = await make();
    assert.equal((await call('Saad', 'PATCH', `/api/tasks/${t.id}`, { state: 'stuck' })).status, 422, 'never stuck without a reason');
    assert.equal((await call('Saad', 'POST', `/api/tasks/${t.id}/stuck`, { reason: 'Chiffres manquants', unblockerId: people.Mentor!.recordId })).status, 422, 'a colleague unblocks');
    const stuck = (await call('Saad', 'POST', `/api/tasks/${t.id}/stuck`, { reason: 'Chiffres 2025 manquants', unblockerId: people.Ghita!.recordId })).body;
    assert.equal(stuck.state, 'stuck');
    assert.equal(stuck.stuckReason, 'Chiffres 2025 manquants');
    assert.equal(stuck.unblocker.id, people.Ghita!.recordId);
    const [mail] = await letters({ email: people.Ghita!.email });
    assert.equal(mail!.kind, 'task_stuck');
    assert.match(mail!.body, /Chiffres 2025 manquants/);
    assert.ok((await call('Ghita', 'GET', '/api/tasks/waiting')).body.some((x: { id: string }) => x.id === t.id), 'waiting for her');

    const going = (await call('Ghita', 'PATCH', `/api/tasks/${t.id}`, { state: 'doing' })).body;
    assert.equal(going.stuckReason, '', 'unblocked: the reason goes — the history keeps it');
  });

  it('waits for its validator, who alone closes it or sends it back with a word', async () => {
    const t = await make();
    await call('Reda', 'POST', `/api/tasks/${t.id}/submit`, { note: 'Version finale', validatorId: people.Ghita!.recordId });
    assert.equal((await call('Reda', 'GET', `/api/tasks/waiting`)).body.some((x: { id: string }) => x.id === t.id), false);
    assert.equal((await call('Reda', 'POST', `/api/tasks/${t.id}/validate`, { action: 'approve' })).status, 403, 'not the validator');
    assert.equal((await call('Reda', 'PATCH', `/api/tasks/${t.id}`, { state: 'done' })).status, 403, 'nor by ticking it done');
    assert.equal((await call('Ghita', 'POST', `/api/tasks/${t.id}/validate`, { action: 'send_back' })).status, 422, 'say what is missing');
    const back = (await call('Ghita', 'POST', `/api/tasks/${t.id}/validate`, { action: 'send_back', note: 'Ajouter les annexes' })).body;
    assert.equal(back.state, 'doing');
    await call('Reda', 'POST', `/api/tasks/${t.id}/submit`, { validatorId: people.Ghita!.recordId });
    const done = (await call('Ghita', 'POST', `/api/tasks/${t.id}/validate`, { action: 'approve', note: 'OK' })).body;
    assert.equal(done.state, 'done');
    assert.equal(done.doneByName, `Ghita ${mark}`, 'closed by its validator');

    const { events } = (await call('Saad', 'GET', `/api/tasks/${t.id}/history`)).body;
    assert.deepEqual(events.map((e: { kind: string }) => e.kind), ['created', 'submitted', 'sent_back', 'submitted', 'validated']);
    assert.equal(events[0].actorName, `Saad ${mark}`, 'who created it');
    assert.equal(events[2].note, 'Ajouter les annexes');
  });

  it('keeps who did what — owners, entrusting, moves — and its attachments', async () => {
    const t = await make();
    await call('Saad', 'PATCH', `/api/tasks/${t.id}`, { ownerIds: [people.Ghita!.recordId] });
    await call('Saad', 'PATCH', `/api/tasks/${t.id}`, { delegateId: people.Mentor!.recordId });
    await call('Ghita', 'PATCH', `/api/tasks/${t.id}`, { state: 'doing' });
    const upload = await repo.saveUpload({ filename: 'budget.xlsx', mime: 'application/vnd.ms-excel', bytes: Buffer.from('x'), fieldId: '', uploadedBy: people.Ghita!.recordId });
    const files = (await call('Ghita', 'POST', `/api/tasks/${t.id}/attachments`, { uploadId: upload.id })).body;
    assert.equal(files[0].filename, 'budget.xlsx');
    const { events, attachments } = (await call('Saad', 'GET', `/api/tasks/${t.id}/history`)).body;
    assert.deepEqual(events.map((e: { kind: string }) => e.kind), ['created', 'owners', 'delegated', 'state', 'attached']);
    assert.equal(events[3].meta.to, 'doing');
    assert.equal(events[3].actorName, `Ghita ${mark}`, 'who moved it');
    assert.equal(attachments.length, 1);
    assert.equal((await call('Saad', 'GET', '/api/tasks')).body.find((x: { id: string }) => x.id === t.id).attachments, 1);
    await call('Saad', 'DELETE', `/api/tasks/${t.id}/attachments/${attachments[0].id}`);
    assert.equal((await call('Saad', 'GET', `/api/tasks/${t.id}/history`)).body.attachments.length, 0);
  });

  it('reminds each of a shared task’s people when it is late — once each', async () => {
    const t = await make({ dueOn: '2020-01-01', delegateId: people.Mentor!.recordId });
    const morning = new Date(new Date().toISOString().slice(0, 10) + 'T09:00:00Z');
    await sendLateDigests(morning);
    for (const who of ['Saad', 'Reda', 'Mentor']) {
      const late = (await letters({ email: people[who]!.email })).filter((l) => l.kind === 'task_late' && l.body.includes(t.title));
      assert.equal(late.length, 1, `${who} is reminded`);
    }
    await sendLateDigests(morning);
    assert.equal((await letters({ email: people.Reda!.email })).filter((l) => l.kind === 'task_late' && l.body.includes(t.title)).length, 1, 'not twice');
  });
});
