/**
 * Le centre de notifications : ce qui attend une personne, à elle seule.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { all, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { authRoutes } from '../src/routes/auth.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { DEFAULT_CENTER, createCenter, inCenter } from '../src/services/centers.js';
import { decide, setDistribution } from '../src/services/distribution.js';
import { post } from '../src/services/mail.js';
import { inbox } from '../src/services/notifications.js';
import { changeTask, createTasks } from '../src/services/tasks.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const ITEMS = [
  { id: 'rc', type: 'file', label: 'Registre', help: '', required: true, options: [], showInTable: false, pageId: '' },
  { id: 'nb', type: 'number', label: 'Effectif', help: '', required: true, options: [], showInTable: false, pageId: '' },
];

describe('the notification centre', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const people: Record<string, { record: string; account: string; cookie: string; email: string }> = {};

  const someone = async (key: string, center: string, staff: boolean) => {
    const email = `${key}.${mark}@example.test`;
    const r = await dir.createRecord({ kind: 'person', name: `${key} ${mark}`, emails: [email], origin: 'manual', centerId: center });
    const a = await createAccount({ email, password: 'chosen-by-them', recordId: r.id });
    if (staff) await setStaffRole(a.id, 'admin', center);
    people[key] = { record: r.id, account: a.id, email, cookie: `${SESSION_COOKIE}=${(await createSession(a.id)).token}` };
  };

  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(authRoutes);
    await app.ready();
    await someone('samia', DEFAULT_CENTER, true);
    await someone('omar', DEFAULT_CENTER, true);
    await someone('founder', DEFAULT_CENTER, false);
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  it('leaves a notification for every letter to somebody who signs in — and keeps each inbox its own', async () => {
    await post({ kind: 'selection', to: people.founder!.email, subject: `Vous êtes sélectionnés ${mark}`, body: '…' });
    const mine = (await app.inject({ method: 'GET', url: '/api/me/notifications', headers: { cookie: people.founder!.cookie } })).json() as {
      items: { id: string; title: string; href: string }[];
      unread: number;
    };
    assert.ok(mine.items.some((n) => n.title === `Vous êtes sélectionnés ${mark}`));
    assert.equal(mine.items[0]!.href, '/me');
    const theirs = (await app.inject({ method: 'GET', url: '/api/me/notifications', headers: { cookie: people.samia!.cookie } })).json() as { items: { title: string }[] };
    assert.ok(!theirs.items.some((n) => n.title === `Vous êtes sélectionnés ${mark}`), 'not in somebody else’s inbox');

    /* Lue : elle quitte « non lues ». Lire celle d'un autre ne fait rien. */
    const id = mine.items[0]!.id;
    await app.inject({ method: 'POST', url: '/api/me/notifications/read', headers: { cookie: people.samia!.cookie }, payload: { ids: [id] } });
    assert.equal((await inbox(people.founder!.record, { unread: true })).some((n) => n.id === id), true);
    const after = (await app.inject({ method: 'POST', url: '/api/me/notifications/read', headers: { cookie: people.founder!.cookie }, payload: { ids: [id] } })).json() as { unread: number };
    assert.equal(after.unread, mine.unread - 1);

    /* L'accès au compte n'en fait pas. */
    await post({ kind: 'password_reset', to: people.founder!.email, subject: `Reset ${mark}`, body: '…' });
    assert.ok(!(await inbox(people.founder!.record, {})).some((n) => n.title === `Reset ${mark}`));
  });

  it('tells the centre’s team once when a startup has sent every document', async () => {
    const program = await inCenter(DEFAULT_CENTER, () => repo.createProgram({ name: `Builders ${mark}`, edition: { name: 'C1' } }));
    await repo.updateEdition(program.editions[0]!.id, { status: 'Live' });
    const track = (await repo.getEditionDetail(program.editions[0]!.id))!.tracks[0]!;
    const due = await repo.createBlock(track.phases[0]!.id, 'deliverable', 'Due diligence');
    await repo.updateBlock(due.id, { config: { visibility: 'open', items: ITEMS } });
    const org = await dir.createRecord({ kind: 'org', name: `Rafid ${mark}`, origin: 'manual', centerId: DEFAULT_CENTER });
    await dir.linkRecords({ personId: people.founder!.record, orgId: org.id, access: 'admin' });
    const cand = await repo.createCandidate({ editionId: program.editions[0]!.id, trackId: track.id, orgId: org.id, personId: people.founder!.record, originBlockId: null });
    const send = (itemId: string, value: unknown) =>
      app.inject({ method: 'POST', url: `/api/me/deliverables/${cand.id}`, headers: { cookie: people.founder!.cookie }, payload: { blockId: due.id, itemId, value } });

    const told = async () => (await inbox(people.samia!.record, {})).filter((n) => n.kind === 'deliverables_complete' && n.title.includes(`Rafid ${mark}`));
    assert.equal((await send('rc', { uploadId: 'up_x', filename: 'rc.pdf' })).statusCode, 200);
    assert.equal((await told()).length, 0, 'not while something is missing');
    assert.equal((await send('nb', 12)).statusCode, 200);
    assert.equal((await told()).length, 1, 'once everything is in');
    assert.equal((await send('nb', 13)).statusCode, 200);
    assert.equal((await told()).length, 1, 'and only once');
  });

  it('tells the owners when the startup does what it was asked', async () => {
    const [task] = await inCenter(DEFAULT_CENTER, () =>
      createTasks(
        { title: `Envoyer le RIB ${mark}`, detail: '', dueOn: null, ownerIds: [people.samia!.record], recordId: null, editionId: null, blockId: null, candidateId: null, delegateId: people.founder!.record },
        { id: people.omar!.record, name: 'Omar' },
      ),
    );
    await changeTask(task!.id, { state: 'done' }, { id: people.founder!.record, name: `founder ${mark}` });
    const seen = (await inbox(people.samia!.record, {})).filter((n) => n.kind === 'task_done');
    assert.ok(seen.some((n) => n.title.includes(`Envoyer le RIB ${mark}`)));
  });

  it('tells a centre’s administrators of an offer, and the organisers of the answer', async () => {
    const tunisia = (await createCenter({ name: `CEED Tunisie ${mark}` })).id;
    await someone('hedi', tunisia, true);
    const program = await inCenter(DEFAULT_CENTER, () => repo.createProgram({ name: `Scale ${mark}`, edition: { name: 'E' } }));
    await setDistribution(program.id, { visibility: 'selected', centerIds: [tunisia] }, 'samia');
    const offered = (await inbox(people.hedi!.record, {})).filter((n) => n.kind === 'offer_received');
    assert.equal(offered.length, 1);
    assert.equal(offered[0]!.href, '/offers');
    await decide(program.id, tunisia, 'accepted', 'hedi');
    const answered = (await inbox(people.samia!.record, {})).filter((n) => n.kind === 'offer_answered' && n.title.includes(`Scale ${mark}`));
    assert.equal(answered.length, 1);
    const rows = await all<{ n: number }>(`select count(*)::int as n from notifications where kind = 'offer_received' and record_id = $1`, [people.samia!.record]);
    assert.equal(rows[0]!.n, 0, 'the organising centre is not offered its own programme');
  });
});
