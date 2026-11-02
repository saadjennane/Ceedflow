/**
 * La fiche startup, administrable : des attributs ajoutés par CEED, qu'une
 * startup voit ou non, et le journal de tout ce qui change sur une fiche.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { directoryRoutes } from '../src/routes/directory.js';
import { authRoutes } from '../src/routes/auth.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

before(migrate);
after(closeDb);

describe('a startup sheet CEED can add to', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  let staff = '';
  let founder = '';
  let orgId = '';

  before(async () => {
    await app.register(cookie);
    await app.register(directoryRoutes);
    await app.register(authRoutes);
    await app.ready();
    const mark = `${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

    const me = await dir.createRecord({ kind: 'person', name: 'Samia Staff', emails: [`staff.${mark}@example.test`], origin: 'manual' });
    const account = await createAccount({ email: `staff.${mark}@example.test`, password: 'chosen-by-them', recordId: me.id });
    await setStaffRole(account.id, 'admin');
    staff = (await createSession(account.id)).token;

    const org = await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual' });
    orgId = org.id;
    const person = await dir.createRecord({ kind: 'person', name: 'Karim Founder', emails: [`karim.${mark}@example.test`], origin: 'manual' });
    await dir.linkRecords({ personId: person.id, orgId: org.id, access: 'admin' });
    const theirs = await createAccount({ email: `karim.${mark}@example.test`, password: 'chosen-by-them', recordId: person.id });
    founder = (await createSession(theirs.id)).token;
  });
  after(() => app.close());

  const as = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });
  const call = async (token: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: as(token), payload: payload as object });
    return { status: res.statusCode, body: res.json() as any };
  };

  it('adds an attribute, checks its values against its type, and keeps one only CEED sees out of the startup’s reach', async () => {
    const shown = await call(staff, 'POST', '/api/org-attributes', { label: 'Numéro ICE', type: 'short_text' });
    assert.equal(shown.status, 201);
    const hidden = await call(staff, 'POST', '/api/org-attributes', { label: 'Note interne', type: 'long_text', visible: false });
    const stage = await call(staff, 'POST', '/api/org-attributes', { label: 'Programme visé', type: 'select', options: ['Seed', 'Scale'] });
    assert.equal((await call(staff, 'POST', '/api/org-attributes', { label: 'Vide', type: 'select' })).status, 422, 'a choice needs choices');

    assert.equal((await call(staff, 'PUT', `/api/records/${orgId}/attributes/${stage.body.id}`, { value: 'Growth' })).status, 422);
    const kept = await call(staff, 'PUT', `/api/records/${orgId}/attributes/${hidden.body.id}`, { value: '  Très prometteuse ' });
    assert.equal(kept.body.values[hidden.body.id], 'Très prometteuse');

    const seen = await call(founder, 'GET', `/api/me/organisations/${orgId}/attributes`);
    assert.ok(seen.body.attributes.some((a: { id: string }) => a.id === shown.body.id));
    assert.ok(!seen.body.attributes.some((a: { id: string }) => a.id === hidden.body.id), 'not the hidden one');
    assert.equal(seen.body.values[hidden.body.id], undefined, 'nor its value');
    assert.equal((await call(founder, 'PUT', `/api/me/organisations/${orgId}/attributes/${hidden.body.id}`, { value: 'x' })).status, 404);
    assert.equal((await call(founder, 'PUT', `/api/me/organisations/${orgId}/attributes/${shown.body.id}`, { value: '001234' })).status, 200);

    // Archivé : plus sur la fiche, mais sa valeur et son histoire restent.
    await call(staff, 'PATCH', `/api/org-attributes/${shown.body.id}`, { archived: true });
    const after = await call(staff, 'GET', `/api/records/${orgId}/attributes`);
    assert.ok(!after.body.attributes.some((a: { id: string }) => a.id === shown.body.id));
  });

  it('keeps the history of the sheet: what it was, what it became, who changed it', async () => {
    await call(staff, 'PATCH', `/api/records/${orgId}`, { teamSize: 8 });
    await call(founder, 'PATCH', `/api/me/organisations/${orgId}`, { teamSize: 12 });
    await call(founder, 'PUT', `/api/me/organisations/${orgId}/revenues/2025`, { amount: 500000, unavailable: false, currency: 'MAD' });
    const history = (await call(staff, 'GET', `/api/records/${orgId}/history`)).body as {
      field: string; before: unknown; after: unknown; byName: string; byKind: string;
    }[];
    const team = history.filter((h) => h.field === 'teamSize');
    assert.deepEqual(team.map((h) => [h.before, h.after, h.byKind]), [[8, 12, 'member'], [null, 8, 'staff']]);
    assert.equal(team[0]!.byName, 'Karim Founder');
    assert.ok(history.some((h) => h.field === 'revenue:2025' && h.after === '500000 MAD'));
    assert.ok(history.some((h) => h.field.startsWith('attr:') && h.byKind === 'member'), 'an added attribute too');
    assert.equal((await call(founder, 'GET', `/api/records/${orgId}/history`)).status, 401, 'CEED’s alone');
  });
});
