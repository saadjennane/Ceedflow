/**
 * Les réglages d'une personne pour elle-même : sur son compte, à elle seule.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { authRoutes } from '../src/routes/auth.js';
import { SESSION_COOKIE, createAccount, createSession } from '../src/services/auth.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('a grid laid out by one person', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(authRoutes);
    await app.ready();
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  const someone = async (name: string) => {
    const r = await dir.createRecord({ kind: 'person', name: `${name} ${mark}`, origin: 'manual' });
    const a = await createAccount({ email: `${name.toLowerCase()}.${mark}@example.test`, password: 'chosen-by-them', recordId: r.id });
    return { cookie: `${SESSION_COOKIE}=${(await createSession(a.id)).token}` };
  };

  it('is kept on their account, and never changes a colleague’s', async () => {
    const samia = await someone('Samia');
    const omar = await someone('Omar');
    const put = (headers: object, value: unknown) =>
      app.inject({ method: 'PUT', url: '/api/me/prefs/dir-org-grid', headers, payload: { value } });
    const get = async (headers: object) => (await app.inject({ method: 'GET', url: '/api/me/prefs/dir-org-grid', headers })).json() as { value: unknown };

    assert.equal((await get(samia)).value, null, 'nothing yet');
    assert.equal((await put(samia, [{ colId: 'city', hide: true }])).statusCode, 200);
    assert.equal((await put(omar, [{ colId: 'sector', width: 300 }])).statusCode, 200);
    assert.deepEqual((await get(samia)).value, [{ colId: 'city', hide: true }]);
    assert.deepEqual((await get(omar)).value, [{ colId: 'sector', width: 300 }]);

    assert.equal((await app.inject({ method: 'GET', url: '/api/me/prefs/dir-org-grid' })).statusCode, 401, 'signed in only');
    assert.equal((await app.inject({ method: 'GET', url: '/api/me/prefs/Bad Key!', headers: samia })).statusCode, 422);
  });
});
