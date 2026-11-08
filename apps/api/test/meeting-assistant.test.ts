/**
 * L'assistant de réunion : l'IA propose, quelqu'un de l'équipe vérifie et crée
 * — des tâches identiques à celles données à la main, jamais deux fois.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import * as repo from '../src/db/repo.js';
import { meetingAssistantRoutes } from '../src/routes/meetingAssistant.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { letters } from '../src/services/mail.js';
import { checkDue, matchMember, similar, useMeetingAnalyzerForTests, type MeetingAnalyzer, type RawTask } from '../src/services/meetingAssistant.js';
import { changeTask, createTasks, getTask, listTasks } from '../src/services/tasks.js';
import { closeDb, skipWithoutServer } from './helpers.js';

const raw = (t: Partial<RawTask>): RawTask => ({
  title: '', description: '', assignee_id: null, assignee_name: null, due_date: null, due_note: null, edition_id: null, priority: 'medium',
  source_excerpt: '', needs_review: false, review_reason: null, confidence: 'high', ...t,
});

describe('reading a meeting', () => {
  const team = [
    { id: 'p1', name: 'Sarah Benali', firstName: 'Sarah', lastName: 'Benali' },
    { id: 'p2', name: 'Nadia Alami', firstName: 'Nadia', lastName: 'Alami' },
    { id: 'p3', name: 'Nadia Tazi', firstName: 'Nadia', lastName: 'Tazi' },
  ];
  it('matches a name only when one member carries it, and never guesses between two', () => {
    assert.deepEqual(matchMember('Sarah', null, team), { id: 'p1', note: '' });
    assert.equal(matchMember('Nadia', 'p2', team).id, null, 'two Nadia: the AI is not followed on a guess');
    assert.match(matchMember('Nadia', null, team).note, /Several members/);
    assert.equal(matchMember('Nadia T.', null, team).id, 'p3', 'an initial settles it');
    assert.deepEqual(matchMember('Youssef', null, team), { id: null, note: 'Responsible not found — Please select a member.' });
    assert.equal(matchMember('Youssef', 'p-unknown', team).id, null, 'an id that is not on the team is dropped');
  });
  it('keeps a date only when it is one, after the meeting', () => {
    assert.deepEqual(checkDue('2026-11-20', '2026-11-08'), { dueOn: '2026-11-20', note: '' });
    assert.equal(checkDue('20 novembre', '2026-11-08').dueOn, null);
    assert.equal(checkDue('1026-11-20', '2026-11-08').dueOn, null);
    assert.equal(checkDue('2026-10-01', '2026-11-08').dueOn, null);
  });
  it('sees two titles as the same task when most of their words are', () => {
    assert.ok(similar('Préparer le budget prévisionnel', 'Préparer budget prévisionnel 2027'));
    assert.ok(!similar('Préparer le budget', 'Contacter les mentors'));
  });
});

describe('the Meeting Assistant', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const people: Record<string, { token: string; email: string; recordId: string }> = {};
  let ai: MeetingAnalyzer = async () => ({ summary: '', meetingTitle: '', meetingDate: null, tasks: [] });
  let editionId = '';

  const member = async (first: string, last: string, role: 'admin' | 'editor' | 'observer' | null) => {
    const email = `${first.toLowerCase()}.${mark}@example.test`;
    const r = await dir.createRecord({ kind: 'person', name: `${first} ${last}${mark}`, emails: [email], origin: 'manual' });
    const a = await createAccount({ email, password: 'chosen-by-them', recordId: r.id });
    if (role) await setStaffRole(a.id, role);
    people[first] = { token: (await createSession(a.id)).token, email, recordId: r.id };
  };

  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(meetingAssistantRoutes);
    await app.ready();
    await member('Saad', 'Jennane', 'admin');
    await member(`Sarah${mark}`, 'Benali', 'editor');
    await member('Lina', 'Observer', 'observer');
    await member('Founder', 'Startup', null);
    const program = await repo.createProgram({ name: `Builders ${mark}` });
    editionId = (await repo.createEdition(program.id, { name: 'Cohorte 1' })).id;
    useMeetingAnalyzerForTests((input) => ai(input));
  });
  after(async () => {
    useMeetingAnalyzerForTests(null);
    await app.close();
    await closeDb();
  });

  const call = async (who: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie: `${SESSION_COOKIE}=${people[who]!.token}` }, payload: payload as object });
    return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
  };
  const settle = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const m = (await call('Saad', 'GET', `/api/meeting-assistant/meetings/${id}`)).body;
      if (m.status !== 'pending') return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('never analysed');
  };
  const notes = 'Sarah prendra contact avec les mentors. Youssef préparera le budget avant le 20 novembre. Le calendrier est déjà envoyé.';

  it('stays out of reach of anybody outside the CEED team, and read-only for an observer', async () => {
    assert.equal((await call('Founder', 'GET', '/api/meeting-assistant/meetings')).status, 401);
    assert.equal((await call('Founder', 'POST', '/api/meeting-assistant/meetings', { title: 'x', meetingOn: '2026-11-08', content: notes })).status, 401);
    assert.equal((await call('Lina', 'POST', '/api/meeting-assistant/meetings', { title: 'x', meetingOn: '2026-11-08', content: notes })).status, 403);
    assert.equal((await call('Lina', 'GET', '/api/meeting-assistant/meetings')).status, 200);
  });

  it('proposes, lets the team check, creates real tasks once — and never twice', async () => {
    const sarah = people[`Sarah${mark}`]!;
    ai = async ({ members, editions }) => {
      assert.ok(members.some((m) => m.id === sarah.recordId), 'the team is given to the model');
      assert.ok(editions.some((e) => e.id === editionId), 'and the programmes, to recognise one');
      assert.ok(!members.some((m) => m.id === people.Founder!.recordId), 'nobody outside the team');
      return {
        summary: 'Coordination.',
        meetingTitle: `Coordination ${mark}`,
        meetingDate: '2026-11-05',
        tasks: [
          raw({ title: 'Contacter les mentors', assignee_name: `Sarah${mark}`, priority: 'high', edition_id: editionId, source_excerpt: 'Sarah prendra contact avec les mentors.' }),
          raw({ title: 'Préparer le budget prévisionnel', assignee_name: 'Youssef', due_date: '2026-11-20', source_excerpt: 'Youssef préparera le budget avant le 20 novembre.' }),
          raw({ title: 'Inviter un nouveau juré', assignee_id: 'invented-id', assignee_name: 'Inès', edition_id: 'invented-edition', needs_review: true, review_reason: 'Simple suggestion ?' }),
        ],
      };
    };
    const made = await call('Saad', 'POST', '/api/meeting-assistant/meetings', { content: notes });
    assert.equal(made.status, 201, 'the notes are enough');
    const m = await settle(made.body.id);
    assert.equal(m.status, 'done');
    assert.equal(m.title, `Coordination ${mark}`, 'titled from the notes');
    assert.equal(m.meetingOn, '2026-11-05', 'dated from the notes');
    const [mentors, budget, juror] = m.suggestions;
    assert.equal(mentors.assigneeId, sarah.recordId);
    assert.equal(budget.assigneeId, null);
    assert.equal(budget.assigneeNote, 'Responsible not found — Please select a member.');
    assert.equal(budget.dueOn, '2026-11-20');
    assert.equal(juror.assigneeId, null, 'an invented id is dropped');
    assert.equal(mentors.editionId, editionId, 'its programme, read in the notes');
    assert.equal(juror.editionId, null, 'an invented programme is dropped');
    assert.equal(budget.editionId, null, 'no programme said, none linked');
    assert.equal(juror.needsReview, true);

    const blocked = await call('Saad', 'POST', `/api/meeting-assistant/meetings/${m.id}/create`, { ids: [mentors.id, budget.id], tell: true });
    assert.equal(blocked.body.created.length, 1);
    assert.deepEqual(blocked.body.failed.map((f: { id: string }) => f.id), [budget.id], 'no responsible, no task — said, not hidden');
    assert.equal((await call('Saad', 'PATCH', `/api/meeting-assistant/suggestions/${budget.id}`, { assigneeId: people.Founder!.recordId })).status, 422, 'the team only');
    await call('Saad', 'PATCH', `/api/meeting-assistant/suggestions/${budget.id}`, { assigneeId: sarah.recordId, priority: 'low' });
    const retry = await call('Saad', 'POST', `/api/meeting-assistant/meetings/${m.id}/create`, { ids: [mentors.id, budget.id], tell: true });
    assert.equal(retry.body.created.length, 1, 'only what was missing');
    assert.deepEqual(retry.body.skipped, [mentors.id], 'the created one is not made again');

    const task = (await getTask(blocked.body.created[0].taskId))!;
    assert.equal(task.ownerId, sarah.recordId);
    assert.equal(task.priority, 'high');
    assert.equal(task.editionId, editionId);
    assert.match(task.detail, /Sarah prendra contact avec les mentors/, 'the sentence it came from');
    const hers = await listTasks({ ownerIds: [sarah.recordId] });
    assert.equal(hers.length, 2, 'in her tasks, like any other');
    const byHand = (await createTasks({ title: 'À la main', detail: '', dueOn: null, ownerIds: [sarah.recordId], recordId: null, editionId: null, blockId: null, candidateId: null }, null))[0]!;
    assert.deepEqual(Object.keys(task).sort(), Object.keys(byHand).sort(), 'the same shape as a task given by hand');
    assert.equal(byHand.priority, 'medium');

    const mail = await letters({ email: sarah.email });
    assert.equal(mail.filter((l) => l.kind === 'tasks_given').length, 2, 'one letter per send, listing that send’s tasks');
    assert.match(mail.find((l) => l.kind === 'tasks_given')!.body, /Coordination/);
  });

  it('flags a task that already exists, and a new analysis keeps what was created', async () => {
    const sarah = people[`Sarah${mark}`]!;
    await createTasks({ title: 'Réserver la salle des ateliers', detail: '', dueOn: null, ownerIds: [sarah.recordId], recordId: null, editionId: null, blockId: null, candidateId: null }, null);
    ai = async () => ({ summary: '', meetingTitle: `Ateliers ${mark}`, meetingDate: null, tasks: [raw({ title: 'Réserver la salle pour les ateliers', assignee_name: `Sarah${mark}` }), raw({ title: 'Écrire aux startups' })] });
    const made = await call('Saad', 'POST', '/api/meeting-assistant/meetings', { content: notes });
    const m = await settle(made.body.id);
    assert.ok(m.suggestions[0].duplicate, 'Potential duplicate task');
    await call('Saad', 'PATCH', `/api/meeting-assistant/suggestions/${m.suggestions[1].id}`, { assigneeId: people.Saad!.recordId });
    const done = await call('Saad', 'POST', `/api/meeting-assistant/meetings/${m.id}/create`, { ids: [m.suggestions[1].id] });
    assert.equal(done.body.created.length, 1);

    await call('Saad', 'POST', `/api/meeting-assistant/meetings/${m.id}/analyse`);
    const again = await settle(m.id);
    const created = again.suggestions.filter((s: { status: string }) => s.status === 'created');
    assert.equal(created.length, 1, 'the created one stays');
    const redo = again.suggestions.find((s: { status: string; title: string }) => s.status === 'proposed' && s.title === 'Écrire aux startups');
    assert.equal(redo.duplicate.id, created[0].task.id, 'proposed again, flagged as the task it already is');
    const tasks = await listTasks({ ownerIds: [people.Saad!.recordId] });
    assert.equal(tasks.filter((t) => t.title === 'Écrire aux startups').length, 1, 'never made twice');
  });

  it('gathers what is waiting in one backlog, adds several meetings at once, and deletes a meeting without its tasks', async () => {
    const sarah = people[`Sarah${mark}`]!;
    ai = async () => ({ summary: '', meetingTitle: `Backlog A ${mark}`, meetingDate: null, tasks: [raw({ title: `Relancer le partenaire ${mark}`, assignee_name: `Sarah${mark}` })] });
    const a = await settle((await call('Saad', 'POST', '/api/meeting-assistant/meetings', { content: notes })).body.id);
    ai = async () => ({ summary: '', meetingTitle: `Backlog B ${mark}`, meetingDate: null, tasks: [raw({ title: `Imprimer les badges ${mark}`, assignee_name: `Sarah${mark}` }), raw({ title: `Écarter ceci ${mark}` })] });
    const b = await settle((await call('Saad', 'POST', '/api/meeting-assistant/meetings', { content: notes })).body.id);

    const backlog = (await call('Lina', 'GET', '/api/meeting-assistant/backlog')).body as { items: { id: string; meetingId: string; title: string }[] };
    const mine = backlog.items.filter((i) => i.meetingId === a.id || i.meetingId === b.id);
    assert.equal(mine.length, 3, 'both meetings, in one list');
    const drop = mine.find((i) => i.title.startsWith('Écarter'))!;
    await call('Saad', 'PATCH', `/api/meeting-assistant/suggestions/${drop.id}`, { status: 'dismissed' });

    const ids = mine.filter((i) => i.id !== drop.id).map((i) => i.id);
    const before = (await letters({ email: sarah.email })).filter((l) => l.kind === 'tasks_given').length;
    const out = await call('Saad', 'POST', '/api/meeting-assistant/backlog/create', { ids, tell: true });
    assert.equal(out.body.created.length, 2);
    assert.equal((await letters({ email: sarah.email })).filter((l) => l.kind === 'tasks_given').length, before + 2, 'a letter per meeting she was given tasks in');
    const after = (await call('Lina', 'GET', '/api/meeting-assistant/backlog')).body as { items: { meetingId: string }[] };
    assert.equal(after.items.filter((i) => i.meetingId === a.id || i.meetingId === b.id).length, 0, 'added or dismissed: out of the backlog');

    assert.equal((await call('Lina', 'DELETE', `/api/meeting-assistant/meetings/${a.id}`)).status, 403, 'an observer deletes nothing');
    assert.equal((await call('Saad', 'DELETE', `/api/meeting-assistant/meetings/${a.id}`)).status, 200);
    assert.equal((await call('Saad', 'GET', `/api/meeting-assistant/meetings/${a.id}`)).status, 404);
    const kept = await listTasks({ ownerIds: [sarah.recordId] });
    assert.ok(kept.some((t) => t.title === `Relancer le partenaire ${mark}`), 'its task stays in Tasks');
  });

  it('links each task to what it is about — a startup in its programme, an organisation — found by name, never guessed', async () => {
    const sarah = people[`Sarah${mark}`]!;
    const startup = await dir.createRecord({ kind: 'org', name: `Rafid ${mark}`, origin: 'manual' });
    const track = (await repo.getEditionDetail(editionId))!.tracks[0]!;
    const cand = await repo.createCandidate({ editionId, trackId: track.id, orgId: startup.id, personId: null, originBlockId: null });
    const funder = await dir.createRecord({ kind: 'org', name: `Fonds Atlas ${mark}`, origin: 'manual' });
    ai = async () => ({
      summary: '', meetingTitle: `Liens ${mark}`, meetingDate: null,
      tasks: [
        raw({ title: 'Relancer Rafid', assignee_name: `Sarah${mark}`, about_kind: 'startup', about_name: `Rafid ${mark}`, edition_id: editionId }),
        raw({ title: 'Écrire au fonds', assignee_name: `Sarah${mark}`, about_kind: 'organisation', about_name: `fonds atlas ${mark}` }),
        raw({ title: 'Appeler Inconnu', assignee_name: `Sarah${mark}`, about_kind: 'organisation', about_name: 'Société Fantôme' }),
      ],
    });
    const m = await settle((await call('Saad', 'POST', '/api/meeting-assistant/meetings', { content: notes })).body.id);
    const [rafid, fund, ghost] = m.suggestions;
    assert.deepEqual(rafid.link && { kind: rafid.link.kind, id: rafid.link.id }, { kind: 'candidate', id: cand.id }, 'the startup, in its programme');
    assert.deepEqual(fund.link && { kind: fund.link.kind, id: fund.link.id }, { kind: 'org', id: funder.id });
    assert.equal(ghost.link, null);
    assert.equal(ghost.aboutSaid, 'Société Fantôme', 'not found: said, not invented');

    assert.equal((await call('Saad', 'PATCH', `/api/meeting-assistant/suggestions/${ghost.id}`, { link: { kind: 'org', id: 'nope' } })).status, 422);
    await call('Saad', 'PATCH', `/api/meeting-assistant/suggestions/${ghost.id}`, { link: { kind: 'person', id: sarah.recordId } });
    const out = await call('Saad', 'POST', `/api/meeting-assistant/meetings/${m.id}/create`, { ids: [rafid.id, ghost.id] });
    const [t1, t2] = await Promise.all(out.body.created.map((c: { taskId: string }) => getTask(c.taskId)));
    assert.equal(t1!.candidateId, cand.id);
    assert.equal(t1!.editionId, null, 'one link at a time');
    assert.equal(t2!.recordId, sarah.recordId);

    const moved = (await changeTask(t2!.id, { link: { kind: 'edition', id: editionId } }, null))!;
    assert.equal(moved.editionId, editionId);
    assert.equal(moved.recordId, null, 'the old link goes');
    assert.equal((await changeTask(t2!.id, { link: null }, null))!.editionId, null);
    await assert.rejects(changeTask(t2!.id, { link: { kind: 'candidate', id: 'nope' } }, null));
  });

  it('keeps the notes when the analysis fails, and lets it run again', async () => {
    ai = async () => {
      throw new Error('OpenAI answered 503: overloaded');
    };
    const made = await call('Saad', 'POST', '/api/meeting-assistant/meetings', { content: notes });
    const m = await settle(made.body.id);
    assert.equal(m.status, 'failed');
    assert.match(m.error, /503/);
    assert.equal(m.content, notes);
    ai = async () => ({ summary: 'ok', meetingTitle: 'Panne', meetingDate: null, tasks: [] });
    await call('Saad', 'POST', `/api/meeting-assistant/meetings/${m.id}/analyse`);
    assert.equal((await settle(m.id)).status, 'done');
    const history = (await call('Lina', 'GET', '/api/meeting-assistant/meetings')).body as { id: string }[];
    assert.ok(history.some((h) => h.id === m.id), 'in the history');
  });
});
