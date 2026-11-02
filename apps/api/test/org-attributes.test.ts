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
import { writeBackToSheet } from '../src/services/formSheet.js';

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

  it('follows a KPI period by period: the latest makes the sheet’s value, an older one is history, a correction replaces', async () => {
    assert.equal((await call(staff, 'PUT', '/api/kpi-settings/teamSize', { period: 'quarter' })).status, 200);
    const put = (period: string, value: unknown) => call(founder, 'PUT', `/api/me/organisations/${orgId}/kpis/teamSize/${period}`, { value });
    await put('2029-Q4', 10);
    await put('2030-Q1', 14);
    await put('2028-Q2', 5);
    assert.equal((await put('2026-13', 3)).status, 422, 'not a quarter');
    const record = (await call(staff, 'GET', `/api/records/${orgId}`)).body.record;
    assert.equal(record.teamSize, 14, 'the latest quarter is the headcount');

    await put('2029-Q4', 11);
    const kpis = (await call(founder, 'GET', `/api/me/organisations/${orgId}/kpis`)).body as { key: string; points: { period: string; value: unknown }[] }[];
    const team = kpis.find((k) => k.key === 'teamSize')!;
    assert.deepEqual(team.points.filter((p) => p.period >= '2028').map((p) => [p.period, p.value]), [['2028-Q2', 5], ['2029-Q4', 11], ['2030-Q1', 14]]);
    const history = (await call(staff, 'GET', `/api/records/${orgId}/history`)).body as { field: string; before: unknown; after: unknown }[];
    assert.ok(history.some((h) => h.field === 'kpi:teamSize:2029-Q4' && h.before === 10 && h.after === 11), 'the correction, kept');

    // Corrigé sur la fiche elle-même : c'est la valeur du trimestre en cours.
    await call(staff, 'PATCH', `/api/records/${orgId}`, { teamSize: 20 });
    const now = (await call(staff, 'GET', `/api/records/${orgId}/kpis`)).body as typeof kpis;
    assert.ok(now.find((k) => k.key === 'teamSize')!.points.some((p) => p.value === 20));

    // Le chiffre d'affaires est suivi d'office, dans sa table annuelle ; le montant levé se lit, ne s'écrit pas.
    await call(founder, 'PUT', `/api/me/organisations/${orgId}/kpis/revenue/2023`, { value: 120000 });
    assert.ok((await call(staff, 'GET', `/api/records/${orgId}`)).body.record.revenues.some((r: { year: number; amount: number }) => r.year === 2023 && r.amount === 120000));
    await call(staff, 'PUT', '/api/kpi-settings/equityRaised', { period: 'year' });
    assert.equal((await call(staff, 'PUT', `/api/records/${orgId}/kpis/equityRaised/2025`, { value: 1 })).status, 422);
  });

  it('links a form to the sheet: opens on what it says, and the answer sent updates it — in its history, through the form', async () => {
    const ice = await call(staff, 'POST', '/api/org-attributes', { label: 'ICE', type: 'short_text' });
    const field = (id: string, type: string, fromProfile: string, extra: object = {}) =>
      ({ id, type, label: id, help: '', required: false, options: [], showInTable: false, pageId: '', fromProfile, ...extra });
    const fields = [
      field('q_team', 'number', 'teamSize'),
      field('q_sector', 'select', 'sector', { options: ['Finance & Fintech', 'Santé & Healthtech'] }),
      field('q_ice', 'short_text', `attr:${ice.body.id}`),
      field('q_rev', 'number', 'kpi:revenue', { fromPeriod: '2024' }),
    ];
    await call(staff, 'PUT', `/api/records/${orgId}/attributes/${ice.body.id}`, { value: 'ICE-1' });
    const prefill = (await call(founder, 'POST', '/api/me/prefill', { orgId, fields })).body;
    assert.equal(prefill.q_ice, 'ICE-1');
    assert.equal(typeof prefill.q_team, 'number');
    assert.equal((await call(staff, 'POST', '/api/me/prefill', { orgId, fields })).status, 200, 'not theirs: nothing');

    const person = (await call(founder, 'GET', '/api/me')).body;
    await writeBackToSheet(orgId, fields as never, { q_team: 42, q_sector: 'Finance & Fintech', q_ice: 'ICE-2', q_rev: 900000 }, {
      kind: 'member', id: person?.record?.id ?? null, name: 'Karim Founder', sourceLabel: 'Formulaire de candidature',
    });
    const record = (await call(staff, 'GET', `/api/records/${orgId}`)).body.record;
    assert.equal(record.teamSize, 42);
    assert.equal(record.sector, 'fintech', 'the word chosen, as the sheet’s own choice');
    assert.ok(record.revenues.some((r: { year: number; amount: number }) => r.year === 2024 && r.amount === 900000), 'the KPI, for the period asked');
    assert.equal((await call(staff, 'GET', `/api/records/${orgId}/attributes`)).body.values[ice.body.id], 'ICE-2');
    const history = (await call(staff, 'GET', `/api/records/${orgId}/history`)).body as { field: string; source: string; sourceLabel: string }[];
    for (const f of ['teamSize', 'sector', `attr:${ice.body.id}`, 'kpi:revenue:2024']) {
      const h = history.find((x) => x.field === f);
      assert.ok(h, f);
      assert.equal(h!.source, 'form');
      assert.equal(h!.sourceLabel, 'Formulaire de candidature');
    }
  });

  it('makes an added attribute a KPI of its own', async () => {
    const made = await call(staff, 'POST', '/api/org-attributes', { label: 'Utilisateurs actifs', type: 'number', kpiPeriod: 'month' });
    await call(staff, 'PUT', `/api/records/${orgId}/kpis/${encodeURIComponent(`attr:${made.body.id}`)}/2026-03`, { value: 300 });
    await call(staff, 'PUT', `/api/records/${orgId}/kpis/${encodeURIComponent(`attr:${made.body.id}`)}/2026-05`, { value: 450 });
    const values = (await call(staff, 'GET', `/api/records/${orgId}/attributes`)).body.values;
    assert.equal(values[made.body.id], 450, 'its value of the moment');
  });
});
