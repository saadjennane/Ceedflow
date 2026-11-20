/**
 * La page d'accueil de l'équipe : ma journée, l'équipe, les programmes en cours.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { all, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { authRoutes } from '../src/routes/auth.js';
import { networkRoutes } from '../src/routes/network.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { DEFAULT_CENTER, inCenter } from '../src/services/centers.js';
import { changeTask, createTasks } from '../src/services/tasks.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('the team’s home page', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const who: Record<string, { record: string; cookie: string }> = {};

  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(authRoutes);
    await app.register(networkRoutes);
    await app.ready();
    for (const key of ['reda', 'omar', 'salma']) {
      const email = `${key}.${mark}@example.test`;
      const r = await dir.createRecord({ kind: 'person', name: `${key} ${mark}`, firstName: key, emails: [email], origin: 'manual', centerId: DEFAULT_CENTER });
      const a = await createAccount({ email, password: 'chosen-by-them', recordId: r.id });
      await setStaffRole(a.id, 'editor', DEFAULT_CENTER);
      who[key] = { record: r.id, cookie: `${SESSION_COOKIE}=${(await createSession(a.id)).token}` };
    }
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  it('shows my day, the team at work, and the live programmes', async () => {
    const program = await inCenter(DEFAULT_CENTER, () => repo.createProgram({ name: `Home ${mark}`, edition: { name: 'C1' } }));
    await repo.updateEdition(program.editions[0]!.id, { status: 'Live' });

    /* Une tâche en retard pour moi ; une tâche en cours pour Omar. */
    await inCenter(DEFAULT_CENTER, () =>
      createTasks(
        { title: `Late one ${mark}`, detail: '', dueOn: '2020-01-01', ownerIds: [who.reda!.record], recordId: null, editionId: null, blockId: null, candidateId: null },
        { id: who.reda!.record, name: 'Reda' },
      ),
    );
    const [busy] = await inCenter(DEFAULT_CENTER, () =>
      createTasks(
        { title: `Omar works ${mark}`, detail: '', dueOn: null, ownerIds: [who.omar!.record], recordId: null, editionId: null, blockId: null, candidateId: null },
        { id: who.omar!.record, name: 'Omar' },
      ),
    );
    await changeTask(busy!.id, { state: 'doing' }, { id: who.omar!.record, name: 'Omar' });

    /* Salma se dit absente jusqu'à demain. */
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const away = await app.inject({ method: 'PUT', url: '/api/me/away', headers: { cookie: who.salma!.cookie }, payload: { until: tomorrow, note: 'Back on Monday' } });
    assert.equal(away.statusCode, 200);

    const res = await app.inject({ method: 'GET', url: '/api/home', headers: { cookie: who.reda!.cookie } });
    assert.equal(res.statusCode, 200, res.body);
    const home = res.json() as {
      firstName: string; centerName: string;
      todo: { title: string; late: boolean }[];
      team: { name: string; state: string; now: string }[];
      programs: { name: string }[];
      figures: { organisations: number; individuals: number };
    };
    assert.equal(home.firstName, 'reda');
    assert.equal(home.centerName, 'CEED Maroc');
    assert.ok(home.todo.some((t) => t.title === `Late one ${mark}` && t.late), 'my late task, first');
    const omar = home.team.find((m) => m.name === `omar ${mark}`)!;
    assert.deepEqual([omar.state, omar.now], ['task', `Omar works ${mark}`]);
    const salma = home.team.find((m) => m.name === `salma ${mark}`)!;
    assert.deepEqual([salma.state, salma.now], ['away', 'Back on Monday']);
    assert.ok(home.programs.some((p) => p.name === `Home ${mark}`), 'the live edition has its card');
    assert.ok(home.figures.individuals > 0);

    /* La date passée, elle redevient présente. */
    await all(`update accounts set away_until = current_date - 1 where record_id = $1`, [who.salma!.record]);
    const later = (await app.inject({ method: 'GET', url: '/api/home', headers: { cookie: who.reda!.cookie } })).json() as { team: { name: string; state: string }[] };
    assert.equal(later.team.find((m) => m.name === `salma ${mark}`)!.state, 'idle');
  });
});
