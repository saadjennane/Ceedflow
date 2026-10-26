/**
 * Les portes d'entrée, essayées comme quelqu'un qui n'y a pas droit.
 *
 * Each case is a way in the audit found before the rollout: a signup that took
 * somebody's record, a team page that handed out other people's passwords, a
 * file anybody could claim or open as a page. They go through the routes, the
 * way a browser — or someone with a terminal — would.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { redactPasswords, suggestPassword } from '@ceed/shared';
import { db, migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { authRoutes } from '../src/routes/auth.js';
import { directoryRoutes } from '../src/routes/directory.js';
import { funnelRoutes } from '../src/routes/funnel.js';
import {
  SESSION_COOKIE,
  accountOfRecord,
  createAccount,
  createSession,
  findAccount,
  setStaffRole,
} from '../src/services/auth.js';
import { letters } from '../src/services/mail.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('passwords handed out', () => {
  it('are drawn from enough to resist guessing', () => {
    const seen = new Set(Array.from({ length: 500 }, () => suggestPassword()));
    assert.equal(seen.size, 500, 'no repeats in five hundred');
    for (const p of seen) assert.match(p, /^[a-z]+-[a-z]+-[a-z]+-\d{4}$/);
  });

  it('never stay readable in a letter once written down', () => {
    const p = suggestPassword();
    const text = `Votre mot de passe :\n    ${p}\n    old: atlas-dune-4821`;
    const hidden = redactPasswords(text);
    assert.doesNotMatch(hidden, new RegExp(p));
    assert.doesNotMatch(hidden, /atlas-dune-4821/, 'the older two-word shape too');
    assert.match(hidden, /Votre mot de passe/, 'the rest of the letter stays');
  });
});

describe('the ways in', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const stamp = Date.now();
  let n = 0;
  const uniq = () => `${stamp}${++n}`;

  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
    await app.register(authRoutes);
    await app.register(funnelRoutes);
    await app.register(directoryRoutes);
    await app.ready();
  });
  after(async () => {
    await app.close();
    await closeDb();
  });

  /** Somebody with an account and a session, and optionally a CEED role. */
  const member = async (name = 'Member', role: 'admin' | 'editor' | null = null) => {
    const email = `${name.toLowerCase()}.${uniq()}@example.test`;
    const record = await dir.createRecord({ kind: 'person', name: `${name} ${uniq()}`, emails: [email], origin: 'manual' });
    const account = await createAccount({ email, password: 'their-own-password', recordId: record.id });
    if (role) await setStaffRole(account.id, role);
    const session = (await createSession(account.id)).token;
    return { record, email, session, cookies: { [SESSION_COOKIE]: session } };
  };

  const upload = (cookies: Record<string, string>, filename: string, mime: string, content: string) => {
    const boundary = `----ceed${uniq()}`;
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="fieldId"\r\n\r\nf\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n${content}\r\n` +
      `--${boundary}--\r\n`;
    return app.inject({
      method: 'POST',
      url: '/api/public/uploads',
      cookies,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
  };

  /* ---- Signing up ---- */

  it('sends the password to an address CEED already knows, instead of handing over the record', async () => {
    const email = `juror.${uniq()}@example.test`;
    const juror = await dir.createRecord({ kind: 'person', name: `Nadia ${uniq()}`, emails: [email], origin: 'manual' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { firstName: 'Some', lastName: 'One', email, password: 'whatever-they-typed' },
    });
    assert.equal(res.statusCode, 202);
    assert.equal(res.json().mailed, true);
    assert.equal(res.cookies.length, 0, 'no session: whoever typed it has proved nothing');
    const account = await findAccount(email);
    assert.equal(account?.recordId, juror.id, 'the account opens on their record…');
    assert.equal(account?.mustChangePassword, true, '…with a password only the mailbox knows');
    const [letter] = await letters({ email });
    assert.equal(letter?.kind, 'account_known');
  });

  it('never adopts a namesake: same name, other address, a record of their own', async () => {
    const name = `Ali ${uniq()}`;
    const [first, last] = name.split(' ') as [string, string];
    const namesake = await dir.createRecord({ kind: 'person', name, emails: [`ali.${uniq()}@x.test`], origin: 'manual' });
    const email = `ali.other.${uniq()}@example.test`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { firstName: first, lastName: last, email, password: 'a-good-password' },
    });
    assert.equal(res.statusCode, 201, 'the old path crashed here with a 500');
    const account = await findAccount(email);
    assert.notEqual(account?.recordId, namesake.id);
    assert.equal(await accountOfRecord(namesake.id), null);
  });

  /* ---- Organisations ---- */

  it('turns naming somebody else’s organisation into a request, and shows nothing of it', async () => {
    const owner = await member('Owner');
    const org = await dir.createRecord({ kind: 'org', name: `Rafid ${uniq()}`, origin: 'manual' });
    await dir.linkRecords({ personId: owner.record.id, orgId: org.id, access: 'admin' });
    const stranger = await member('Stranger');

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/organisations',
      cookies: stranger.cookies,
      payload: { name: org.name },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().pending, true);
    assert.deepEqual(Object.keys(res.json().organisation).sort(), ['id', 'name'], 'its name, nothing more');

    const team = await app.inject({ method: 'GET', url: `/api/me/organisations/${org.id}/team`, cookies: stranger.cookies });
    assert.equal(team.statusCode, 403, 'the team stays closed');

    const waiting = await app.inject({ method: 'GET', url: `/api/me/organisations/${org.id}/requests`, cookies: owner.cookies });
    const [request] = waiting.json() as { id: string }[];
    assert.ok(request, 'the administrator sees who asks');
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/me/organisations/${org.id}/requests/${request.id}/accept`,
      cookies: owner.cookies,
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(await dir.accessOf(stranger.record.id, org.id), 'member');
  });

  it('never hands an administrator the password of somebody else’s account', async () => {
    const admin = await member('Admin');
    const opened = await app.inject({
      method: 'POST',
      url: '/api/me/organisations',
      cookies: admin.cookies,
      payload: { name: `Own ${uniq()}` },
    });
    const orgId = opened.json().organisation.id as string;

    /* Un juré invité qui ne s'est pas encore connecté : l'ancienne route
       régénérait son mot de passe et le rendait à l'écran. */
    const jurorEmail = `juror.${uniq()}@example.test`;
    const juror = await dir.createRecord({ kind: 'person', name: `Juror ${uniq()}`, emails: [jurorEmail], origin: 'manual' });
    await createAccount({ email: jurorEmail, password: 'given-by-ceed', recordId: juror.id, mustChangePassword: true });

    const added = await app.inject({
      method: 'POST',
      url: `/api/me/organisations/${orgId}/team`,
      cookies: admin.cookies,
      payload: { name: 'Juror', emails: [jurorEmail], phones: [], role: '', access: 'member' },
    });
    const affiliationId = added.json().affiliationId as string;
    const invite = await app.inject({
      method: 'POST',
      url: `/api/me/organisations/${orgId}/team/${affiliationId}/invite`,
      cookies: admin.cookies,
    });
    assert.equal(invite.statusCode, 422);

    // A brand-new teammate is invited by mail — the password never comes back.
    const freshEmail = `cto.${uniq()}@example.test`;
    const cto = await app.inject({
      method: 'POST',
      url: `/api/me/organisations/${orgId}/team`,
      cookies: admin.cookies,
      payload: { name: 'New CTO', emails: [freshEmail], phones: [], role: 'CTO', access: 'member' },
    });
    const sent = await app.inject({
      method: 'POST',
      url: `/api/me/organisations/${orgId}/team/${cto.json().affiliationId}/invite`,
      cookies: admin.cookies,
    });
    assert.equal(sent.statusCode, 201);
    assert.deepEqual(sent.json(), { email: freshEmail });
    assert.equal((await letters({ email: freshEmail }))[0]?.kind, 'team_invite');
  });

  /* ---- Files ---- */

  it('refuses a page of HTML, and serves what it keeps as a download that runs nothing', async () => {
    const someone = await member('Uploader');
    const html = await upload(someone.cookies, 'cv.html', 'text/html', '<script>alert(1)</script>');
    assert.equal(html.statusCode, 422);

    const svg = await upload(someone.cookies, 'logo.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    assert.equal(svg.statusCode, 201);
    const served = await app.inject({ method: 'GET', url: `/api/uploads/${svg.json().id}`, cookies: someone.cookies });
    assert.equal(served.statusCode, 200, 'the one who sent it reopens it');
    assert.match(String(served.headers['content-disposition']), /^attachment/);
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    assert.match(String(served.headers['content-security-policy']), /sandbox/);
  });

  it('serves a name with Arabic letters and a narrow space instead of failing', async () => {
    const someone = await member('Names');
    const res = await upload(someone.cookies, 'Capture d’écran شركة.png', 'image/png', 'png');
    assert.equal(res.statusCode, 201);
    const served = await app.inject({ method: 'GET', url: `/api/uploads/${res.json().id}`, cookies: someone.cookies });
    assert.equal(served.statusCode, 200);
    assert.match(String(served.headers['content-disposition']), /filename\*=UTF-8''/);
  });

  it('does not let a startup claim another one’s file by quoting its id', async () => {
    const victim = await member('Victim');
    const thief = await member('Thief');
    const theirs = await upload(victim.cookies, 'deck.pdf', 'application/pdf', '%PDF');
    const id = theirs.json().id as string;

    const edition = (await repo.listPrograms())[0]?.editions[0];
    if (!edition) return; // A database without a programme has nothing to apply to.
    const detail = (await repo.getEditionDetail(edition.id))!;
    const org = await dir.createRecord({ kind: 'org', name: `Thief Co ${uniq()}`, origin: 'manual' });
    const candidate = await repo.createCandidate({ editionId: edition.id, trackId: detail.tracks[0]!.id, orgId: org.id });

    await repo.claimUploads(candidate.id, { deck: { uploadId: id } }, thief.record.id);
    assert.equal((await repo.getUpload(id))?.candidateId, null, 'still nobody’s');
    await repo.claimUploads(candidate.id, { deck: { uploadId: id } }, victim.record.id);
    assert.equal((await repo.getUpload(id))?.candidateId, candidate.id, 'its sender attaches it');
  });

  it('refuses a logo pointed at another organisation’s private document', async () => {
    const owner = await member('DocOwner');
    const rival = await member('Rival');
    const doc = await upload(owner.cookies, 'statuts.pdf', 'application/pdf', '%PDF');
    const ownOrg = await app.inject({ method: 'POST', url: '/api/me/organisations', cookies: owner.cookies, payload: { name: `Docs ${uniq()}` } });
    await (await db()).query(
      `insert into org_documents (id, org_id, kind, year, label, upload_id, created_by_name) values ($1,$2,'statutes',null,'',$3,'')`,
      [`doc_${uniq()}`, ownOrg.json().organisation.id, doc.json().id],
    );
    const rivalOrg = await app.inject({ method: 'POST', url: '/api/me/organisations', cookies: rival.cookies, payload: { name: `Rival ${uniq()}` } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/me/organisations/${rivalOrg.json().organisation.id}`,
      cookies: rival.cookies,
      payload: { logoUploadId: doc.json().id },
    });
    assert.equal(res.statusCode, 422);
    const opened = await app.inject({ method: 'GET', url: `/api/uploads/${doc.json().id}`, cookies: rival.cookies });
    assert.equal(opened.statusCode, 404);
  });

  /* ---- CEED's own accounts ---- */

  it('keeps an editor from touching a colleague’s account', async () => {
    const editor = await member('Editor', 'editor');
    const colleagueEmail = `admin.${uniq()}@example.test`;
    const colleague = await dir.createRecord({ kind: 'person', name: `Admin ${uniq()}`, emails: [colleagueEmail], origin: 'manual' });
    const account = await createAccount({ email: colleagueEmail, password: 'not-yet-claimed', recordId: colleague.id, mustChangePassword: true });
    await setStaffRole(account.id, 'admin');

    const reset = await app.inject({
      method: 'POST',
      url: `/api/records/${colleague.id}/account`,
      cookies: editor.cookies,
      payload: { password: 'editor-chose-this' },
    });
    assert.equal(reset.statusCode, 403);
    const closed = await app.inject({ method: 'DELETE', url: `/api/records/${colleague.id}/account`, cookies: editor.cookies });
    assert.equal(closed.statusCode, 403);

    // A founder's account stays theirs to open, as every day.
    const founder = await dir.createRecord({ kind: 'person', name: `Founder ${uniq()}`, emails: [`f.${uniq()}@x.test`], origin: 'manual' });
    const opened = await app.inject({
      method: 'POST',
      url: `/api/records/${founder.id}/account`,
      cookies: editor.cookies,
      payload: { password: 'provisional-one' },
    });
    assert.equal(opened.statusCode, 201);
  });

  it('opens an account for somebody with no address on file without failing', async () => {
    const admin = await member('Ops', 'admin');
    const nobody = await dir.createRecord({ kind: 'person', name: `No Mail ${uniq()}`, origin: 'manual' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${nobody.id}/account`,
      cookies: admin.cookies,
      payload: { email: `given.${uniq()}@example.test`, password: 'provisional-two' },
    });
    assert.equal(res.statusCode, 201, 'this used to be a 500');
  });

  it('no longer answers the old anonymous join route', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/public/join', payload: { name: 'X', contactName: 'Y' } });
    assert.notEqual(res.statusCode, 200);
    const check = await app.inject({ method: 'GET', url: '/api/public/join/check?name=Rafid' });
    assert.notEqual(check.statusCode, 200);
  });
});
