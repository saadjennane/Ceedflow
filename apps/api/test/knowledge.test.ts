/**
 * La Knowledge Base, par l'API : le circuit complet, chaque droit vérifié côté
 * serveur, et l'IA qui analyse sans jamais décider.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { migrate } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { knowledgeRoutes } from '../src/routes/knowledge.js';
import { meetingAssistantRoutes } from '../src/routes/meetingAssistant.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { getVersion, neighboursOf, useAnalyzerForTests, useChecklistDrafterForTests, type KbAnalyzer } from '../src/services/knowledge.js';
import { closeDb, skipWithoutServer } from './helpers.js';

describe('the Knowledge Base', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const people: Record<string, { token: string; email: string; recordId: string }> = {};
  let ai: KbAnalyzer = async () => ({ summary: 'Rien à signaler.', findings: [] });

  const member = async (name: string, role: 'admin' | 'editor' | 'observer' | null) => {
    const email = `${name.toLowerCase()}.${mark}@example.test`;
    const r = await dir.createRecord({ kind: 'person', name: `${name} ${mark}`, emails: [email], origin: 'manual' });
    const a = await createAccount({ email, password: 'chosen-by-them', recordId: r.id });
    if (role) await setStaffRole(a.id, role);
    people[name] = { token: (await createSession(a.id)).token, email, recordId: r.id };
  };

  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(knowledgeRoutes);
    await app.register(meetingAssistantRoutes);
    await app.ready();
    await member('Saad', 'admin');
    await member('Rita', 'admin');
    await member('Yasmine', 'editor');
    await member('Omar', 'editor');
    await member('Lina', 'observer');
    await member('Founder', null);
    useAnalyzerForTests((input) => ai(input));
  });
  after(async () => {
    useAnalyzerForTests(null);
    await app.close();
    await closeDb();
  });

  const call = async (who: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie: `${SESSION_COOKIE}=${people[who]!.token}` }, payload: payload as object });
    return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
  };
  /** L'analyse tourne à côté : on attend qu'elle ait fini. */
  const settle = async (versionId: string) => {
    for (let i = 0; i < 100; i++) {
      const v = await getVersion(versionId);
      if (v && v.status !== 'analysis_pending') return v;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('the analysis never finished');
  };
  const entry = async (who: string, id: string) => (await call(who, 'GET', `/api/kb/entries/${id}`)).body;

  it('designates the president: an administrator does, never for themselves, and nobody else changes it', async () => {
    assert.equal((await call('Yasmine', 'PUT', '/api/kb/settings', { presidentEmail: people.Yasmine!.email })).status, 403);
    const self = await call('Rita', 'PUT', '/api/kb/settings', { presidentEmail: people.Rita!.email });
    assert.equal(self.status, 403, 'nobody designates themselves');
    assert.equal((await call('Saad', 'PUT', '/api/kb/settings', { presidentEmail: `nobody.${mark}@example.test` })).status, 422);
    const ok = await call('Saad', 'PUT', '/api/kb/settings', { presidentEmail: people.Rita!.email, provider: '', model: '' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.president.recordId, people.Rita!.recordId);
    assert.equal(ok.body.keys.openai !== undefined, true, 'says whether a key is there, never what it is');
  });

  it('keeps every account outside the CEED team out — reading or writing, even straight at the API', async () => {
    assert.equal((await call('Founder', 'GET', '/api/kb')).status, 401);
    assert.equal((await call('Founder', 'POST', '/api/kb/entries', { categoryId: 'kbc_rh', title: 'x', body: 'y' })).status, 401);
    const cats = (await call('Lina', 'GET', '/api/kb/categories')).body as { id: string }[];
    assert.ok(cats.length >= 8, 'the starting categories');
    assert.equal((await call('Lina', 'POST', '/api/kb/entries', { categoryId: cats[0]!.id, title: 'x', body: 'y' })).status, 403, 'an observer reads only');
  });

  it('takes a knowledge from writing to publication: analysis, a review by somebody else, the president alone', async () => {
    const made = await call('Yasmine', 'POST', '/api/kb/entries', {
      categoryId: 'kbc_programmes', title: `Sélection des startups ${mark}`,
      body: `Le comité de sélection ${mark} réunit cinq jurés. Chaque startup pitche dix minutes.`,
    });
    assert.equal(made.status, 201);
    const v = await settle(made.body.versionId);
    assert.equal(v.status, 'to_review', 'analysed, then waiting for a review');

    const own = await call('Yasmine', 'POST', `/api/kb/versions/${v.id}/review`, { action: 'reviewed', contentHash: v.contentHash });
    assert.equal(own.status, 403, 'its author does not review it');
    const reviewed = await call('Omar', 'POST', `/api/kb/versions/${v.id}/review`, { action: 'reviewed', contentHash: v.contentHash, comment: 'Clair.' });
    assert.equal(reviewed.status, 200);
    assert.equal((await getVersion(v.id))!.status, 'to_validate');

    for (const who of ['Saad', 'Omar', 'Lina']) {
      const tried = await call(who, 'POST', `/api/kb/versions/${v.id}/validate`, { action: 'approve', contentHash: v.contentHash });
      assert.equal(tried.status, 403, `${who} cannot publish`);
    }
    const published = await call('Rita', 'POST', `/api/kb/versions/${v.id}/validate`, { action: 'approve', contentHash: v.contentHash });
    assert.equal(published.status, 200);
    const seen = await entry('Lina', made.body.entryId);
    assert.equal(seen.officialVersionId, v.id);
    assert.equal(seen.versions[0].status, 'published');
    assert.equal(seen.versions[0].validatedBy.id, people.Rita!.recordId);
    assert.deepEqual(
      seen.activity.map((a: { action: string }) => a.action).reverse(),
      ['created', 'analysis_done', 'reviewed', 'approved', 'published'],
      'every step in the history',
    );
  });

  it('finds the closest knowledge, flags a duplicate and a contradiction, and lets nothing publish until they are decided', async () => {
    const base = await call('Yasmine', 'POST', '/api/kb/entries', {
      categoryId: 'kbc_finance', title: `Remboursement des frais ${mark}`,
      body: `Les frais de déplacement ${mark} sont remboursés sous trente jours, sur justificatif.`,
    });
    const bv = await settle(base.body.versionId);
    await call('Omar', 'POST', `/api/kb/versions/${bv.id}/review`, { action: 'reviewed', contentHash: bv.contentHash });
    await call('Rita', 'POST', `/api/kb/versions/${bv.id}/validate`, { action: 'approve', contentHash: bv.contentHash });

    ai = async ({ neighbours }) => ({
      summary: 'Une contradiction sur le délai.',
      findings: neighbours.length
        ? [
            { kind: 'conflict', confidence: 82, otherVersionId: neighbours[0]!.versionId, excerpt: 'sous quinze jours', otherExcerpt: 'sous trente jours', explanation: 'Deux délais différents.', recommendation: 'Garder un seul délai.' },
            { kind: 'duplicate', confidence: 60, otherVersionId: neighbours[0]!.versionId, excerpt: 'frais de déplacement', otherExcerpt: 'frais de déplacement', explanation: 'Même sujet.', recommendation: 'Mettre à jour plutôt que créer.' },
            { kind: 'clarification', confidence: 50, otherVersionId: null, excerpt: 'justificatif', otherExcerpt: '', explanation: 'Quel justificatif ?', recommendation: 'Préciser.' },
          ]
        : [],
    });
    const twin = await call('Omar', 'POST', '/api/kb/entries', {
      categoryId: 'kbc_finance', title: `Frais de déplacement ${mark}`,
      body: `Les frais de déplacement ${mark} sont remboursés sous quinze jours.`,
    });
    const tv = await settle(twin.body.versionId);
    const near = await neighboursOf(tv);
    assert.equal(near[0]?.versionId, bv.id, 'the published knowledge comes up first');

    const detail = await entry('Omar', twin.body.entryId);
    const found = detail.findings[tv.id] as { id: string; kind: string; other: { versionId: string } | null }[];
    assert.deepEqual(found.map((f) => f.kind), ['conflict', 'duplicate', 'clarification']);
    assert.equal(found[0]!.other!.versionId, bv.id, 'tied to the exact version compared');

    await call('Yasmine', 'POST', `/api/kb/versions/${tv.id}/review`, { action: 'reviewed', contentHash: tv.contentHash });
    const blocked = await call('Rita', 'POST', `/api/kb/versions/${tv.id}/validate`, { action: 'approve', contentHash: tv.contentHash });
    assert.equal(blocked.status, 409, 'an open conflict blocks publication');

    const silent = await call('Yasmine', 'POST', `/api/kb/findings/${found[0]!.id}/decision`, { state: 'not_a_conflict', justification: '' });
    assert.equal(silent.status, 422, 'never ignored silently');
    await call('Yasmine', 'POST', `/api/kb/findings/${found[0]!.id}/decision`, { state: 'not_a_conflict', justification: 'Le délai de quinze jours vaut pour 2027.' });
    assert.equal((await call('Rita', 'POST', `/api/kb/versions/${tv.id}/validate`, { action: 'approve', contentHash: tv.contentHash })).status, 409, 'the duplicate still needs a decision');
    await call('Yasmine', 'POST', `/api/kb/findings/${found[1]!.id}/decision`, { state: 'acknowledged', justification: 'Gardées séparées : public différent.' });
    assert.equal((await call('Rita', 'POST', `/api/kb/versions/${tv.id}/validate`, { action: 'approve', contentHash: tv.contentHash })).status, 200, 'a clarification does not block');
    ai = async () => ({ summary: 'Rien à signaler.', findings: [] });
  });

  it('keeps the published version official until the new one is published, and voids a review the text outlived', async () => {
    const made = await call('Yasmine', 'POST', '/api/kb/entries', { categoryId: 'kbc_rh', title: `Congés ${mark}`, body: 'Vingt-deux jours par an.' });
    const v1 = await settle(made.body.versionId);
    await call('Omar', 'POST', `/api/kb/versions/${v1.id}/review`, { action: 'reviewed', contentHash: v1.contentHash });
    await call('Rita', 'POST', `/api/kb/versions/${v1.id}/validate`, { action: 'approve', contentHash: v1.contentHash });
    assert.equal((await call('Yasmine', 'PATCH', `/api/kb/versions/${v1.id}`, { title: 'x', body: 'y', revision: v1.revision })).status, 409, 'a published text is never rewritten');

    const update = await call('Omar', 'POST', `/api/kb/entries/${made.body.entryId}/versions`, { title: `Congés ${mark}`, body: 'Vingt-quatre jours par an.', changeSummary: 'Deux jours de plus.' });
    assert.equal(update.status, 201);
    assert.equal((await call('Omar', 'POST', `/api/kb/entries/${made.body.entryId}/versions`, { title: 'x', body: 'y' })).status, 409, 'one version on its way at a time');
    let v2 = await settle(update.body.versionId);
    assert.equal(v2.number, 2);
    assert.equal((await entry('Lina', made.body.entryId)).officialVersionId, v1.id, 'still version 1');

    await call('Yasmine', 'POST', `/api/kb/versions/${v2.id}/review`, { action: 'reviewed', contentHash: v2.contentHash });
    assert.equal((await getVersion(v2.id))!.status, 'to_validate');
    const stale = await call('Omar', 'PATCH', `/api/kb/versions/${v2.id}`, { title: `Congés ${mark}`, body: 'Vingt-cinq jours.', revision: v2.revision + 1 });
    assert.equal(stale.status, 409, 'an older revision does not overwrite a newer one');
    const edited = await call('Omar', 'PATCH', `/api/kb/versions/${v2.id}`, { title: `Congés ${mark}`, body: 'Vingt-cinq jours par an.', revision: v2.revision });
    assert.equal(edited.body.reanalyse, true);
    v2 = await settle(v2.id);
    assert.equal(v2.status, 'to_review', 'reviewed again from the start');
    assert.equal(v2.reviewedBy, null);
    assert.equal((await call('Rita', 'POST', `/api/kb/versions/${v2.id}/validate`, { action: 'approve', contentHash: v2.contentHash })).status, 409);

    await call('Yasmine', 'POST', `/api/kb/versions/${v2.id}/review`, { action: 'reviewed', contentHash: v2.contentHash });
    await call('Rita', 'POST', `/api/kb/versions/${v2.id}/validate`, { action: 'approve', contentHash: v2.contentHash });
    const after = await entry('Lina', made.body.entryId);
    assert.equal(after.officialVersionId, v2.id);
    assert.equal(after.versions.find((x: { id: string }) => x.id === v1.id).status, 'archived', 'version 1 stays readable, no longer the reference');
  });

  it('never takes a failed analysis for an absence of conflict', async () => {
    ai = async () => {
      throw new Error('OpenAI answered 503: overloaded');
    };
    const made = await call('Yasmine', 'POST', '/api/kb/entries', { categoryId: 'kbc_operations', title: `Clés ${mark}`, body: 'Les clés sont à l’accueil.' });
    const v = await settle(made.body.versionId);
    assert.equal(v.status, 'analysis_failed');
    const detail = await entry('Omar', made.body.entryId);
    assert.match(detail.analyses[v.id].error, /503/);
    assert.equal((await call('Omar', 'POST', `/api/kb/versions/${v.id}/review`, { action: 'reviewed', contentHash: v.contentHash })).status, 409, 'no review without an analysis');
    ai = async () => ({ summary: 'Rien à signaler.', findings: [] });
    assert.equal((await call('Yasmine', 'POST', `/api/kb/versions/${v.id}/analyse`)).status, 200);
    assert.equal((await settle(v.id)).status, 'to_review', 'retried, then reviewable');
  });

  it('sends back and rejects with a reason, and lists every step in the history', async () => {
    const made = await call('Yasmine', 'POST', '/api/kb/entries', { categoryId: 'kbc_communication', title: `Logo ${mark}`, body: 'Le logo est bleu.' });
    const v = await settle(made.body.versionId);
    assert.equal((await call('Omar', 'POST', `/api/kb/versions/${v.id}/review`, { action: 'changes', contentHash: v.contentHash })).status, 422, 'say what has to change');
    await call('Omar', 'POST', `/api/kb/versions/${v.id}/review`, { action: 'changes', contentHash: v.contentHash, comment: 'Quel bleu ?' });
    assert.equal((await getVersion(v.id))!.status, 'changes_requested');
    await call('Yasmine', 'POST', `/api/kb/versions/${v.id}/resubmit`);
    assert.equal((await settle(v.id)).status, 'to_review');
    await call('Omar', 'POST', `/api/kb/versions/${v.id}/review`, { action: 'reviewed', contentHash: v.contentHash });
    assert.equal((await call('Rita', 'POST', `/api/kb/versions/${v.id}/validate`, { action: 'reject', contentHash: v.contentHash })).status, 422);
    await call('Rita', 'POST', `/api/kb/versions/${v.id}/validate`, { action: 'reject', contentHash: v.contentHash, note: 'Déjà dans la charte.' });
    assert.equal((await getVersion(v.id))!.status, 'rejected');
    const history = (await call('Lina', 'GET', '/api/kb/history')).body as { entryId: string; action: string; actor: { id: string } | null }[];
    const mine = history.filter((h) => h.entryId === made.body.entryId).map((h) => h.action).reverse();
    assert.deepEqual(mine, ['created', 'analysis_done', 'review_changes', 'resubmitted', 'reviewed', 'rejected'], 'the text did not change: its analysis still stands');
  });
  it('keeps a checklist as task templates, and puts its points in the backlog each time it is launched — never before it is published', async () => {
    ai = async () => ({ summary: 'Rien à signaler.', findings: [] });
    const empty = await call('Yasmine', 'POST', '/api/kb/entries', { categoryId: 'kbc_programmes', title: `Vide ${mark}`, body: '', format: 'checklist', items: [] });
    assert.equal(empty.status, 422, 'a checklist needs at least one point');

    const made = await call('Yasmine', 'POST', '/api/kb/entries', {
      categoryId: 'kbc_programmes', title: `Préparer un comité ${mark}`, body: 'Trois semaines avant le jury.', format: 'checklist',
      items: [{ title: `Réserver la salle ${mark}`, note: 'Technopark, salle B' }, { title: `Inviter les jurés ${mark}` }],
    });
    assert.equal(made.status, 201);
    const v = await settle(made.body.versionId);
    assert.equal(v.format, 'checklist');
    assert.equal(v.items.length, 2);
    assert.equal(v.items[1]!.note, '');

    const early = await call('Yasmine', 'POST', `/api/meeting-assistant/backlog/checklist/${made.body.entryId}`, {});
    assert.equal(early.status, 409, 'only a published checklist is launched');

    await call('Omar', 'POST', `/api/kb/versions/${v.id}/review`, { action: 'reviewed', contentHash: v.contentHash });
    await call('Rita', 'POST', `/api/kb/versions/${v.id}/validate`, { action: 'approve', contentHash: v.contentHash });
    assert.equal((await call('Lina', 'POST', `/api/meeting-assistant/backlog/checklist/${made.body.entryId}`, {})).status, 403, 'an observer does not launch');

    for (let run = 1; run <= 2; run++) {
      const launched = await call('Yasmine', 'POST', `/api/meeting-assistant/backlog/checklist/${made.body.entryId}`, {});
      assert.equal(launched.status, 201);
      assert.equal(launched.body.added, 2);
    }
    const backlog = (await call('Yasmine', 'GET', '/api/meeting-assistant/backlog')).body;
    const mine = backlog.items.filter((s: { title: string }) => s.title.includes(mark));
    assert.equal(mine.length, 4, 'two launches, two groups of two');
    assert.equal(new Set(mine.map((s: { meetingId: string }) => s.meetingId)).size, 2);
    const salle = mine.find((s: { title: string }) => s.title.startsWith('Réserver'))!;
    assert.equal(salle.meetingKind, 'checklist');
    assert.equal(salle.meetingTitle, `Préparer un comité ${mark}`);
    assert.equal(salle.description, 'Technopark, salle B');
    assert.equal(salle.assigneeId, null, 'a template: the owner is given when the task is created');
    assert.equal(salle.link, null);
    const history = (await call('Yasmine', 'GET', '/api/meeting-assistant/meetings')).body as { title: string }[];
    assert.ok(!history.some((m) => m.title.includes(mark)), 'a checklist is not a meeting');

    const info = await call('Yasmine', 'POST', '/api/kb/entries', { categoryId: 'kbc_programmes', title: `Info ${mark}`, body: 'À lire.', items: [{ title: 'ignoré' }] });
    const iv = await settle(info.body.versionId);
    assert.equal(iv.format, 'info');
    assert.deepEqual(iv.items, [], 'an information keeps no points');
  });
  it('reads a process in a pasted text and proposes its steps — saving nothing, and saying so when there is none', async () => {
    let read = '';
    useChecklistDrafterForTests(async (text) => {
      read = text;
      return text.includes('jury')
        ? { title: 'Préparer un comité', context: 'Avant chaque jury.', items: [{ title: ' Réserver la salle ', note: 'Trois semaines avant' }, { title: '', note: 'vide' }, { title: 'Inviter les jurés', note: '' }] }
        : { title: '', context: '', items: [] };
    });
    try {
      const before = (await call('Yasmine', 'GET', '/api/kb')).body.items.length;
      const got = await call('Yasmine', 'POST', '/api/kb/checklist-draft', { text: '  Pour le jury, on réserve la salle puis on invite les jurés.  ' });
      assert.equal(got.status, 200);
      assert.equal(read, 'Pour le jury, on réserve la salle puis on invite les jurés.');
      assert.deepEqual(got.body.items, [{ title: 'Réserver la salle', note: 'Trois semaines avant' }, { title: 'Inviter les jurés', note: '' }], 'a point with no title is dropped');
      assert.equal(got.body.title, 'Préparer un comité');
      assert.equal((await call('Yasmine', 'GET', '/api/kb')).body.items.length, before, 'nothing saved');

      assert.equal((await call('Yasmine', 'POST', '/api/kb/checklist-draft', { text: 'Bonjour, merci.' })).status, 422, 'no process in it');
      assert.equal((await call('Yasmine', 'POST', '/api/kb/checklist-draft', { text: '   ' })).status, 422);
      assert.equal((await call('Lina', 'POST', '/api/kb/checklist-draft', { text: 'Le jury…' })).status, 403, 'an observer reads only');
    } finally {
      useChecklistDrafterForTests(null);
    }
  });
});
