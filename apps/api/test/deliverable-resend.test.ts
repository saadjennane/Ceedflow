/**
 * Une pièce refusée attend sa bonne version : la startup peut la renvoyer,
 * même quand la liste est fermée — et seulement celle-là.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { authRoutes } from '../src/routes/auth.js';
import { funnelRoutes } from '../src/routes/funnel.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const ITEMS = [
  { id: 'rc', type: 'file', label: 'Registre de commerce', help: '', required: true, options: [], showInTable: false, pageId: '' },
  { id: 'nb', type: 'number', label: 'Effectif', help: '', required: true, options: [], showInTable: false, pageId: '' },
];

describe('a document sent back', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(authRoutes);
    await app.register(funnelRoutes);
    await app.ready();
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  it('can be sent again even once the list is closed — the rest of the list stays as it was', async () => {
    const program = await repo.createProgram({ name: `Builders ${mark}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 1' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const due = await repo.createBlock(track.phases[0]!.id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });
    const org = await dir.createRecord({ kind: 'org', name: `Rafid ${mark}`, origin: 'manual' });
    const founder = await dir.createRecord({ kind: 'person', name: `Karim ${mark}`, origin: 'manual' });
    await dir.linkRecords({ personId: founder.id, orgId: org.id, access: 'admin' });
    const account = await createAccount({ email: `karim.${mark}@example.test`, password: 'chosen-by-them', recordId: founder.id });
    const headers = { cookie: `${SESSION_COOKIE}=${(await createSession(account.id)).token}` };
    const cand = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: founder.id, originBlockId: null });
    const send = (itemId: string, value: unknown) =>
      app.inject({ method: 'POST', url: `/api/me/deliverables/${cand.id}`, headers, payload: { blockId: due.id, itemId, value } });

    assert.equal((await send('rc', { uploadId: 'up_wrong', filename: 'mauvais.pdf' })).statusCode, 200);
    assert.equal((await send('nb', 12)).statusCode, 200);

    /* CEED ferme la liste, puis refuse le mauvais document. */
    const config = (await repo.getBlock(due.id))!.config as object;
    await repo.updateBlock(due.id, { config: { ...config, visibility: 'closed' } });
    await repo.reviewReturn(due.id, cand.id, 'rc', 'rejected', 'Ce n’est pas le registre.');

    assert.equal((await send('nb', 14)).statusCode, 403, 'the rest of a closed list stays as it was');
    /* « Remplacer » vide d'abord le champ : ce vide ne doit rien effacer. */
    assert.equal((await send('rc', null)).statusCode, 200);
    const still = (await repo.listReturnsFor(due.id, cand.id)).find((r) => r.itemId === 'rc')!;
    assert.equal(still.state, 'rejected', 'the refused one is still there, still waiting');
    assert.equal((await send('rc', { uploadId: 'up_right', filename: 'registre.pdf' })).statusCode, 200);
    const fixed = (await repo.listReturnsFor(due.id, cand.id)).find((r) => r.itemId === 'rc')!;
    assert.equal(fixed.state, 'received', 'the right version, to read again');
    assert.equal((fixed.value as { filename: string }).filename, 'registre.pdf');
    assert.equal((await send('rc', { uploadId: 'up_again', filename: 'encore.pdf' })).statusCode, 403, 'once received, it is closed again');
  });

  it('CEED fills one in for the startup — a figure given on the phone, a document handed over — and nothing it was not asked', async () => {
    const program = await repo.createProgram({ name: `Builders bis ${mark}` });
    const edition = await repo.createEdition(program.id, { name: 'Cohorte 2' });
    await repo.updateEdition(edition.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(edition.id))!.tracks[0]!;
    const due = await repo.createBlock(track.phases[0]!.id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });
    const org = await dir.createRecord({ kind: 'org', name: `Nour ${mark}`, origin: 'manual' });
    const cand = await repo.createCandidate({ editionId: edition.id, trackId: track.id, orgId: org.id, personId: null, originBlockId: null });
    const me = await dir.createRecord({ kind: 'person', name: `Samia ${mark}`, origin: 'manual' });
    const acc = await createAccount({ email: `samia.${mark}@example.test`, password: 'chosen-by-them', recordId: me.id });
    await setStaffRole(acc.id, 'admin');
    const headers = { cookie: `${SESSION_COOKIE}=${(await createSession(acc.id)).token}` };
    const record = (itemId: string, value: unknown) =>
      app.inject({ method: 'POST', url: `/api/blocks/${due.id}/deliverables/${cand.id}`, headers, payload: { itemId, value } });

    const res = await record('nb', 9);
    assert.equal(res.statusCode, 200);
    const row = (res.json() as { rows: { candidate: { id: string }; returns: { itemId: string; value: unknown }[] }[] }).rows.find((r) => r.candidate.id === cand.id)!;
    assert.equal(row.returns.find((r) => r.itemId === 'nb')!.value, 9);
    assert.equal((await record('rc', { uploadId: 'up_handed', filename: 'registre.pdf' })).statusCode, 200);
    assert.equal((await record('nope', 'x')).statusCode, 404, 'not one of the things asked');
  });
});
