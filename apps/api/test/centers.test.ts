/**
 * Le réseau CEED : des centres qui ne lisent que ce qui est à eux.
 *
 * Deux questions. Toutes les routes de l'équipe sont-elles couvertes — chaque
 * identifiant qu'elles prennent rattaché à un centre, ou dit libre ? Et une
 * équipe peut-elle atteindre les données d'un autre centre, par l'adresse ou
 * par un appel direct ? Non, et CEED Maroc continue comme avant.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { actionRoutes } from '../src/routes/actions.js';
import { builderRoutes } from '../src/routes/builder.js';
import { directoryRoutes } from '../src/routes/directory.js';
import { fundingRoutes } from '../src/routes/funding.js';
import { funnelRoutes } from '../src/routes/funnel.js';
import { knowledgeRoutes } from '../src/routes/knowledge.js';
import { meetingAssistantRoutes } from '../src/routes/meetingAssistant.js';
import { oneToOneRoutes } from '../src/routes/oneToOne.js';
import { programRoutes } from '../src/routes/programs.js';
import { reportingRoutes } from '../src/routes/reporting.js';
import { sandboxRoutes } from '../src/routes/sandbox.js';
import { staffRoutes } from '../src/routes/staff.js';
import { taskRoutes } from '../src/routes/tasks.js';
import { networkRoutes } from '../src/routes/network.js';
import { CENTER_HEADER } from '../src/routes/guard.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { DEFAULT_CENTER, FREE_PARAMS, FREE_ROUTES, createCenter, inCenter, joinCenter, kindOfParam } from '../src/services/centers.js';
import { all } from '../src/db/client.js';
import { closeDb, skipWithoutServer } from './helpers.js';

/** Every route group the workspace guard stands in front of. */
const GUARDED = [
  programRoutes, builderRoutes, funnelRoutes, actionRoutes, directoryRoutes, staffRoutes, taskRoutes,
  oneToOneRoutes, reportingRoutes, sandboxRoutes, knowledgeRoutes, meetingAssistantRoutes, fundingRoutes, networkRoutes,
];
/** Routes inside those groups that the guard deliberately leaves open. */
const OPEN = (url: string) => url.startsWith('/api/public/') || url === '/api/uploads/:id';

describe('every workspace route', () => {
  it('ties each identifier it takes to a centre, or says why it is free', async () => {
    const app = Fastify();
    const seen: { method: string; url: string }[] = [];
    app.addHook('onRoute', (r) => {
      const methods = Array.isArray(r.method) ? r.method : [r.method];
      for (const m of methods) seen.push({ method: m, url: r.url });
    });
    await app.register(cookie);
    for (const routes of GUARDED) await app.register(routes);
    await app.ready();

    const loose: string[] = [];
    for (const { method, url } of seen) {
      if (OPEN(url) || method === 'HEAD') continue;
      for (const [, param] of url.matchAll(/:([A-Za-z]+)/g)) {
        const free = param! in FREE_PARAMS || FREE_ROUTES.some((f) => url.startsWith(f.prefix) && f.param === param);
        if (!kindOfParam(url, param!) && !free) loose.push(`${method} ${url} — :${param}`);
      }
    }
    assert.deepEqual(loose, [], 'a route takes an identifier nothing ties to a centre');
    await app.close();
  });
});

describe('two centres', { skip: skipWithoutServer }, () => {
  const app: FastifyInstance = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  let tunisia = '';
  let morocco = { cookie: '' };
  let tunis = { cookie: '' };
  let global = { cookie: '' };
  let maProgram = '';
  let maBlock = '';
  let maOrg = '';
  let shared = '';

  const person = async (name: string) => {
    const r = await dir.createRecord({ kind: 'person', name: `${name} ${mark}`, origin: 'manual', centerId: DEFAULT_CENTER });
    const a = await createAccount({ email: `${name.toLowerCase()}.${mark}@example.test`, password: 'chosen-by-them', recordId: r.id });
    return { account: a, cookie: `${SESSION_COOKIE}=${(await createSession(a.id)).token}` };
  };
  const call = (who: { cookie: string }, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, center?: string) =>
    app.inject({ method, url, payload, headers: { cookie: who.cookie, ...(center ? { [CENTER_HEADER]: center } : {}) } });

  before(async () => {
    await migrate();
    await app.register(cookie);
    for (const routes of GUARDED) await app.register(routes);
    await app.ready();

    tunisia = (await createCenter({ name: `CEED Tunisie ${mark}`, country: 'Tunisia' })).id;

    const ma = await person('Samia');
    await setStaffRole(ma.account.id, 'admin', DEFAULT_CENTER);
    morocco = ma;
    const tn = await person('Hedi');
    await setStaffRole(tn.account.id, 'admin', tunisia);
    tunis = tn;
    const gl = await person('Nour');
    await all(`update accounts set global_role = 'admin' where id = $1`, [gl.account.id]);
    global = gl;

    /* Un programme de CEED Maroc, sa brique, et une startup de sa communauté. */
    const program = await inCenter(DEFAULT_CENTER, () =>
      repo.createProgram({ name: `The Builders ${mark}`, edition: { name: 'Cohorte 1' } }),
    );
    maProgram = program.id;
    const track = (await repo.getEditionDetail(program.editions[0]!.id))!.tracks[0]!;
    maBlock = (await repo.createBlock(track.phases[0]!.id, 'deliverable', 'Due diligence')).id;
    maOrg = (await dir.createRecord({ kind: 'org', name: `Rafid ${mark}`, origin: 'manual', centerId: DEFAULT_CENTER })).id;
    /* Une startup des deux communautés. */
    shared = (await dir.createRecord({ kind: 'org', name: `Atlas ${mark}`, origin: 'manual', centerId: DEFAULT_CENTER })).id;
    await joinCenter(shared, tunisia, 'manual');
    await joinCenter(shared, tunisia, 'manual');
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  it('keeps CEED Maroc working as before, without saying which centre', async () => {
    const res = await call(morocco, 'GET', '/api/programs');
    assert.equal(res.statusCode, 200);
    assert.ok((res.json() as { id: string }[]).some((p) => p.id === maProgram));
    assert.equal((await call(morocco, 'GET', `/api/blocks/${maBlock}`)).statusCode, 200);
  });

  it('shows a local programme only in its own centre (scenario 3)', async () => {
    const list = (await call(tunis, 'GET', '/api/programs')).json() as { id: string }[];
    assert.ok(!list.some((p) => p.id === maProgram));
  });

  it('refuses another centre’s data by address and by direct call (scenario 2)', async () => {
    assert.equal((await call(tunis, 'GET', `/api/programs/${maProgram}`)).statusCode, 404);
    assert.equal((await call(tunis, 'GET', `/api/blocks/${maBlock}`)).statusCode, 404);
    assert.equal((await call(tunis, 'GET', `/api/records/${maOrg}`)).statusCode, 404);
    const records = (await call(tunis, 'GET', '/api/records?kind=org')).json() as { id: string }[];
    assert.ok(!records.some((r) => r.id === maOrg), 'not in its community');
    /* Nommée dans le corps : refusée aussi. */
    const task = await call(tunis, 'POST', '/api/tasks', { title: 'Relancer', ownerIds: [maOrg] });
    assert.equal(task.statusCode, 404);
  });

  it('refuses a centre one does not work for, even when asked by name', async () => {
    assert.equal((await call(tunis, 'GET', '/api/programs', undefined, DEFAULT_CENTER)).statusCode, 403);
    assert.equal((await call(morocco, 'GET', '/api/programs', undefined, tunisia)).statusCode, 403);
  });

  it('lets CEED Global into any centre, seeing what that centre sees', async () => {
    const inMorocco = (await call(global, 'GET', '/api/programs', undefined, DEFAULT_CENTER)).json() as { id: string }[];
    assert.ok(inMorocco.some((p) => p.id === maProgram));
    const inTunisia = (await call(global, 'GET', '/api/programs', undefined, tunisia)).json() as { id: string }[];
    assert.ok(!inTunisia.some((p) => p.id === maProgram));
    assert.equal((await call(global, 'GET', `/api/programs/${maProgram}`, undefined, tunisia)).statusCode, 404);
  });

  it('shares an organisation of both communities, and keeps each team’s notes to itself', async () => {
    const seen = (await call(tunis, 'GET', '/api/records?kind=org')).json() as { id: string }[];
    assert.ok(seen.some((r) => r.id === shared), 'one record, in both communities');
    assert.equal((await call(morocco, 'POST', `/api/records/${shared}/notes`, { body: 'Note de Casablanca' })).statusCode, 201);
    const activity = (await call(tunis, 'GET', `/api/records/${shared}/activity`)).json() as { label: string; detail?: string }[];
    assert.ok(!JSON.stringify(activity).includes('Note de Casablanca'), 'Tunis does not read Casablanca’s notes');
    const rows = await all<{ n: number }>('select count(*)::int as n from center_members where record_id = $1', [shared]);
    assert.equal(rows[0]!.n, 2, 'joining twice is one link');
  });

  it('takes a shared organisation out of one community without deleting it for the other', async () => {
    assert.equal((await call(tunis, 'DELETE', `/api/records/${shared}`)).statusCode, 204);
    assert.equal((await call(tunis, 'GET', `/api/records/${shared}`)).statusCode, 404);
    assert.equal((await call(morocco, 'GET', `/api/records/${shared}`)).statusCode, 200);
  });

  it('lets only CEED Global create a centre and name its administrator, who then works there (scenario 1)', async () => {
    assert.equal((await call(tunis, 'POST', '/api/centers', { name: `CEED Égypte ${mark}` })).statusCode, 403);
    assert.equal((await call(tunis, 'GET', '/api/network/overview')).statusCode, 403);

    const made = await call(global, 'POST', '/api/centers', {
      name: `CEED Égypte ${mark}`, country: 'Egypt', admin: { name: `Amr ${mark}`, email: `amr.${mark}@example.test` },
    });
    assert.equal(made.statusCode, 201);
    const { center, invite } = made.json() as { center: { id: string }; invite: { email: string; password: string } };
    assert.ok(invite.password, 'a provisional password, shown once');
    assert.equal((await call(global, 'POST', '/api/centers', { name: `CEED Égypte ${mark}` })).statusCode, 422, 'one name, one centre');

    /* L'administrateur entre : son centre est le premier, sans rien demander. */
    const login = await app.inject({ method: 'GET', url: '/api/network/me', headers: { cookie: await cookieOf(invite.email) } });
    const me = login.json() as { current: string; centers: { id: string; role: string }[] };
    assert.equal(me.current, center.id);
    assert.deepEqual(me.centers.map((c) => [c.id, c.role]), [[center.id, 'admin']]);
    const staff = (await call(global, 'GET', `/api/centers/${center.id}/staff`)).json() as { email: string; role: string }[];
    assert.deepEqual(staff.map((s) => [s.email, s.role]), [[invite.email, 'admin']]);

    /* Désactivé : son équipe n'entre plus, CEED Global si. */
    assert.equal((await call(global, 'PATCH', `/api/centers/${center.id}`, { status: 'inactive' })).statusCode, 200);
    const shut = await app.inject({ method: 'GET', url: '/api/programs', headers: { cookie: await cookieOf(invite.email) } });
    assert.equal(shut.statusCode, 403);
    assert.equal((await call(global, 'GET', '/api/programs', undefined, center.id)).statusCode, 200);
  });

  it('counts the network without counting twice (scenario 10)', async () => {
    const before = (await call(global, 'GET', '/api/network/overview')).json() as { totals: { programs: number; startups: number } };

    /* Un programme en cours, diffusé dans trois centres : un programme. */
    const live = await inCenter(DEFAULT_CENTER, () => repo.createProgram({ name: `Scale ${mark}`, edition: { name: '2027' } }));
    await repo.updateEdition(live.editions[0]!.id, { status: 'Live' });
    for (const c of [tunisia, DEFAULT_CENTER]) {
      await all(`insert into program_distributions (program_id, center_id, status) values ($1, $2, 'accepted') on conflict do nothing`, [live.id, c]);
    }
    /* Une startup de deux communautés, candidate dans les deux centres : une startup. */
    const twice = (await dir.createRecord({ kind: 'org', name: `Kenza ${mark}`, origin: 'manual', centerId: DEFAULT_CENTER })).id;
    await joinCenter(twice, tunisia, 'application');
    const track = (await repo.getEditionDetail(live.editions[0]!.id))!.tracks[0]!;
    await repo.createCandidate({ editionId: live.editions[0]!.id, trackId: track.id, orgId: twice, personId: null, originBlockId: null });
    const tnProgram = await inCenter(tunisia, () => repo.createProgram({ name: `Tunis Lab ${mark}`, edition: { name: '2027' } }));
    const tnTrack = (await repo.getEditionDetail(tnProgram.editions[0]!.id))!.tracks[0]!;
    await repo.createCandidate({ editionId: tnProgram.editions[0]!.id, trackId: tnTrack.id, orgId: twice, personId: null, originBlockId: null });

    const after = (await call(global, 'GET', '/api/network/overview')).json() as {
      totals: { programs: number; startups: number };
      centers: { id: string; startups: number }[];
    };
    assert.equal(after.totals.programs, before.totals.programs + 1, 'one live programme, wherever it is shown');
    assert.equal(after.totals.startups, before.totals.startups + 1, 'one startup, in two centres');
    assert.ok(after.centers.find((c) => c.id === tunisia)!.startups >= 1, 'and it counts in each centre’s own line');
    const programs = (await call(global, 'GET', '/api/network/programs')).json() as { id: string; distributedTo: unknown[] }[];
    assert.equal(programs.filter((p) => p.id === live.id).length, 1);
    assert.equal(programs.find((p) => p.id === live.id)!.distributedTo.length, 2);
  });

  it('keeps each centre’s own letters and signature', async () => {
    const edited = await call(tunis, 'PATCH', '/api/house-letters/task_given', { subject: 'Une tâche pour vous, de Tunis' });
    assert.equal(edited.statusCode, 200);
    const mine = (await call(morocco, 'GET', '/api/house-letters')).json() as { key: string; subject: string }[];
    assert.notEqual(mine.find((l) => l.key === 'task_given')!.subject, 'Une tâche pour vous, de Tunis');
    assert.equal((await call(tunis, 'PATCH', '/api/center', { mailName: 'CEED Tunisie', replyTo: 'contact@ceed-tunisie.example' })).statusCode, 200);
    const center = (await call(tunis, 'GET', '/api/center')).json() as { mailName: string };
    assert.equal(center.mailName, 'CEED Tunisie');
  });
});

/** Une session pour un compte qu'on vient de créer par son adresse. */
async function cookieOf(email: string): Promise<string> {
  const { findAccount } = await import('../src/services/auth.js');
  const account = await findAccount(email);
  /* Comme s'il avait choisi son mot de passe : un provisoire n'ouvre pas l'espace. */
  await all('update accounts set must_change_password = false where id = $1', [account!.id]);
  return `${SESSION_COOKIE}=${(await createSession(account!.id)).token}`;
}
