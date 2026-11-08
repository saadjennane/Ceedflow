/**
 * Funding Intelligence : un appel d'offres devient une analyse — sans rien
 * inventer, en séparant le document, le web et les déductions, et sans rien
 * créer dans l'annuaire, les opportunités ou Tasks sans un clic.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { migrate, all } from '../src/db/client.js';
import * as dir from '../src/db/directory.js';
import { fundingRoutes } from '../src/routes/funding.js';
import { SESSION_COOKIE, createAccount, createSession, setStaffRole } from '../src/services/auth.js';
import { extractFundingDocument, normaliseResult, useFundingAnalyzerForTests, useFundingSearcherForTests } from '../src/services/funding.js';
import { getTask } from '../src/services/tasks.js';
import { listCategories } from '../src/services/knowledge.js';
import { closeDb, skipWithoutServer } from './helpers.js';

/** Un PDF minimal, une ligne de texte par page. */
export function makePdf(pages: string[]): Buffer {
  const objs: string[] = [];
  const add = (x: string) => objs.push(x);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (const text of pages) {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const content = objs.length;
    add(`PAGE ${content}`);
    pageIds.push(objs.length);
  }
  add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const pagesObj = objs.length;
  for (const i of pageIds) {
    const content = objs[i - 1]!.split(' ')[1];
    objs[i - 1] = `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 1 0 R >> >> >>`;
  }
  add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const long = (s: string) => `${s} `.repeat(12);

/** Ce qu'un modèle rend pour un appel du genre ACAPS — y compris ce qu'il ne doit pas. */
const acapsLike = (mark: string) => ({
  overview: {
    title: { value: `Étude de faisabilité Émergence ${mark}`, page: 1, excerpt: 'Étude de faisabilité' },
    reference: { value: 'C106/2026', page: 1, excerpt: 'C106/2026' },
    contractingAuthority: { value: `ACAPS${mark}`, page: 1, excerpt: 'ACAPS' },
    funder: { value: 'BAD via ADFI', page: 2, excerpt: 'financé par la BAD' },
    serviceType: { value: 'Étude', page: 1, excerpt: '' },
    country: { value: 'Maroc', page: 1, excerpt: '' },
    publishedOn: { value: null, page: null, excerpt: '' },
    deadline: { value: null, page: null, excerpt: '' },
    duration: { value: null, page: null, excerpt: '' },
    budget: { value: null, page: 99, excerpt: '' },
    status: { value: null, page: null, excerpt: '' },
  },
  summary: 'Une étude de faisabilité.',
  organizations: [
    { name: 'Banque africaine de développement', acronym: 'BAD', roles: ['funder', 'made_up_role'], kind: 'Banque multilatérale', description: '', themes: ['inclusion financière'], relations: 'Finance via ADFI', page: 2, excerpt: 'BAD' },
    { name: 'Autorité de contrôle des assurances', acronym: `ACAPS${mark}`, roles: ['contracting_authority', 'funder'], kind: '', description: '', themes: [], relations: '', page: 1, excerpt: 'ACAPS' },
  ],
  opportunities: [
    { type: 'identified_tender', title: 'Étude de faisabilité Émergence', organization: `ACAPS${mark}`, summary: '', amount: null, deadline: null, period: null, eligibility: null, targetAudience: null, activities: [], interestForCeed: '', vigilance: ['Montant non communiqué'], nextAction: '', rationale: 'Page 1', verification: [{ claim: 'La consultation existe', status: 'document_confirmed' }, { claim: 'Encore ouverte', status: 'externally_verified' }], relevance: 'high', relevanceReason: '', eligibilityToVerify: true, sources: [{ page: 1, excerpt: 'consultation' }] },
    { type: 'project_concept', title: 'Women Financial Resilience', organization: 'BAD', summary: '', amount: null, deadline: null, period: null, eligibility: null, targetAudience: 'Femmes entrepreneures', activities: [], interestForCeed: '', vigilance: [], nextAction: '', rationale: 'Priorités inclusion', verification: [], relevance: 'medium', relevanceReason: '', eligibilityToVerify: true, sources: [] },
  ],
  warnings: ['Date limite non indiquée'],
  actions: [
    { title: 'Vérifier les conditions de participation', description: '', priority: 'high', opportunity: 0, rationale: 'Consultation restreinte' },
    { title: 'Préparer une note conceptuelle', description: '', priority: 'medium', opportunity: 1, rationale: '' },
  ],
});

describe('reading a call for tenders', () => {
  it('reads a PDF page by page, and refuses one with no text', async () => {
    const { text, pages } = await extractFundingDocument(makePdf([long('Consultation ACAPS etude'), long('Financement BAD ADFI')]));
    assert.equal(pages, 2);
    assert.match(text, /\[Page 1\][\s\S]*Consultation ACAPS[\s\S]*\[Page 2\][\s\S]*Financement BAD/);
    await assert.rejects(extractFundingDocument(makePdf([' ', ' '])), /no readable text/);
    await assert.rejects(extractFundingDocument(Buffer.from('not a pdf')), /could not be read/);
  });

  it('invents nothing the model could not have read: no value, no page out of range, no external check, no unknown role', () => {
    const { result, actions } = normaliseResult(acapsLike('x'), 3);
    assert.equal(result.overview.budget.value, null);
    assert.equal(result.overview.budget.page, null, 'a page beyond the document is dropped');
    assert.deepEqual(result.organizations[0]!.roles, ['funder']);
    assert.equal(result.opportunities[0]!.verification[1]!.status, 'unverified', 'no web search happened: nothing is externally verified');
    assert.deepEqual(result.opportunities[1]!.verification, [{ claim: 'This opportunity', status: 'inferred' }], 'a concept is never confirmed in bulk');
    assert.equal(actions[1]!.opportunityKey, 'o2');
  });
});

describe('Funding Intelligence', { skip: skipWithoutServer }, () => {
  const app = Fastify();
  const mark = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const people: Record<string, { token: string; recordId: string }> = {};
  let seen: { text: string; ceed: { title: string }[] } | null = null;

  const member = async (name: string, role: 'admin' | 'editor' | 'observer' | null) => {
    const email = `${name.toLowerCase()}.${mark}@example.test`;
    const r = await dir.createRecord({ kind: 'person', name: `${name} ${mark}`, emails: [email], origin: 'manual' });
    const a = await createAccount({ email, password: 'chosen-by-them', recordId: r.id });
    if (role) await setStaffRole(a.id, role);
    people[name] = { token: (await createSession(a.id)).token, recordId: r.id };
  };

  before(async () => {
    await migrate();
    await app.register(cookie);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
    await app.register(fundingRoutes);
    await app.ready();
    await member('Saad', 'admin');
    await member('Ghita', 'editor');
    await member('Lina', 'observer');
    await member('Founder', null);
    useFundingAnalyzerForTests(async (input) => {
      seen = input;
      return acapsLike(mark);
    });
  });
  after(async () => {
    useFundingAnalyzerForTests(null);
    useFundingSearcherForTests(null);
    await app.close();
    await closeDb();
  });

  const call = async (who: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie: `${SESSION_COOKIE}=${people[who]!.token}` }, payload: payload as object });
    return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
  };
  const settle = async (id: string, field: 'status' | 'web' = 'status') => {
    for (let i = 0; i < 150; i++) {
      const a = (await call('Saad', 'GET', `/api/funding/analyses/${id}`)).body;
      if (field === 'status' ? a.status !== 'pending' : a.web.status !== 'pending') return a;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('never settled');
  };
  const doc = long(`Consultation C106 ${mark} ACAPS étude de faisabilité programme Émergence financé par la BAD.`);

  it('keeps everybody outside the CEED team out, and an observer reading only', async () => {
    assert.equal((await call('Founder', 'GET', '/api/funding/analyses')).status, 401);
    assert.equal((await call('Founder', 'POST', '/api/funding/analyses', { text: doc })).status, 401);
    assert.equal((await call('Lina', 'POST', '/api/funding/analyses', { text: doc })).status, 403);
    assert.equal((await call('Lina', 'GET', '/api/funding/analyses')).status, 200);
  });

  it('analyses a call, reads only published knowledge about CEED, and matches funders already in the directory', async () => {
    /* Une connaissance publiée, et une encore en relecture qui ne doit pas servir. */
    await listCategories();
    await all(`insert into kb_entries (id, category_id) values ($1, 'kbc_autres'), ($2, 'kbc_autres')`, [`kbe_p${mark}`, `kbe_d${mark}`]);
    await all(
      `insert into kb_versions (id, entry_id, number, title, body, content_hash, status) values
         ($1, $2, 1, $3, 'CEED accompagne des startups InsurTech et étude de faisabilité', 'h1', 'published'),
         ($4, $5, 1, $6, 'Étude de faisabilité brouillon', 'h2', 'to_review')`,
      [`kbv_p${mark}`, `kbe_p${mark}`, `Activités CEED ${mark}`, `kbv_d${mark}`, `kbe_d${mark}`, `Brouillon ${mark}`],
    );
    await all(`update kb_entries set official_version_id = $1 where id = $2`, [`kbv_p${mark}`, `kbe_p${mark}`]);
    const acaps = await dir.createRecord({ kind: 'org', name: `ACAPS${mark}`, origin: 'manual' });

    const made = await call('Ghita', 'POST', '/api/funding/analyses', { text: doc });
    assert.equal(made.status, 201);
    const a = await settle(made.body.id);
    assert.equal(a.status, 'done');
    assert.equal(a.title, `Étude de faisabilité Émergence ${mark}`, 'titled from the document');
    assert.ok(seen!.ceed.some((k) => k.title === `Activités CEED ${mark}`), 'published knowledge informs it');
    assert.ok(!seen!.ceed.some((k) => k.title === `Brouillon ${mark}`), 'a version under review never does');
    assert.equal(a.result.overview.budget.value, null);
    const [bad, acapsOrg] = a.result.organizations;
    assert.equal(acapsOrg.recordId, acaps.id, 'matched by its acronym');
    assert.equal(bad.recordId, null, 'not in the directory, and not added');
    assert.equal(a.actions.length, 2);
  });

  it('adds an organisation only on a click, saves opportunities once, and flags one already saved elsewhere', async () => {
    const made = await call('Saad', 'POST', '/api/funding/analyses', { title: 'Mon titre', text: doc });
    const a = await settle(made.body.id);
    assert.equal(a.title, 'Mon titre', 'a title given is kept');
    const added = await call('Saad', 'POST', `/api/funding/analyses/${a.id}/organizations/0`);
    const again = await call('Saad', 'POST', `/api/funding/analyses/${a.id}/organizations/0`);
    assert.equal(added.body.recordId, again.body.recordId, 'never twice in the directory');

    const items = [{ key: 'o1', title: 'Étude Émergence (corrigée)', summary: 'Note' }];
    assert.equal((await call('Saad', 'POST', `/api/funding/analyses/${a.id}/opportunities`, { opportunities: items })).body.saved, 1);
    assert.equal((await call('Saad', 'POST', `/api/funding/analyses/${a.id}/opportunities`, { opportunities: items })).body.saved, 0, 'once per analysis');
    const list = (await call('Lina', 'GET', '/api/funding/opportunities')).body as { title: string; recordId: string | null }[];
    assert.ok(list.some((o) => o.title === 'Étude Émergence (corrigée)'), 'saved as corrected');

    const other = await settle((await call('Saad', 'POST', '/api/funding/analyses', { text: doc })).body.id);
    assert.ok(other.duplicates.o1, 'the same opportunity, already saved from another analysis');
  });

  it('turns chosen actions into tasks once, linked to the organisation when it is in the directory', async () => {
    const a = await settle((await call('Saad', 'POST', '/api/funding/analyses', { text: doc })).body.id);
    const [check, note] = a.actions;
    const first = await call('Saad', 'POST', `/api/funding/analyses/${a.id}/tasks`, { ids: [check.id] });
    assert.equal(first.body.failed.length, 1, 'nobody assigned: not created, said');
    assert.equal((await call('Saad', 'PATCH', `/api/funding/actions/${check.id}`, { assigneeId: people.Founder!.recordId })).status, 422, 'the team only');
    await call('Saad', 'PATCH', `/api/funding/actions/${check.id}`, { assigneeId: people.Ghita!.recordId, title: 'Vérifier l’éligibilité CEED' });
    const done = await call('Saad', 'POST', `/api/funding/analyses/${a.id}/tasks`, { ids: [check.id, note.id] });
    assert.equal(done.body.created.length, 1);
    const twice = await call('Saad', 'POST', `/api/funding/analyses/${a.id}/tasks`, { ids: [check.id] });
    assert.deepEqual(twice.body.skipped, [check.id], 'never twice');
    const task = (await getTask(done.body.created[0].taskId))!;
    assert.equal(task.title, 'Vérifier l’éligibilité CEED');
    assert.equal(task.priority, 'high');
    assert.ok(task.recordId, 'linked to the contracting authority, which is in the directory');
  });

  it('enriches with the web only from pages really consulted, and says so when it cannot', async () => {
    const a = await settle((await call('Saad', 'POST', '/api/funding/analyses', { text: doc })).body.id);
    let sent = '';
    useFundingSearcherForTests(async (_i, query) => {
      sent = query;
      return {
        text: JSON.stringify({
          findings: [
            { organization: 'BAD', topic: 'priorities', text: 'Inclusion financière numérique.', urls: ['https://www.afdb.org/fr/adfi'] },
            { organization: 'BAD', topic: 'budgets', text: 'Un budget inventé.', urls: ['https://made-up.example/page'] },
          ],
        }),
        citations: [{ url: 'https://www.afdb.org/fr/adfi', title: 'ADFI — BAD', publishedAt: null }],
      };
    });
    assert.equal((await call('Saad', 'POST', `/api/funding/analyses/${a.id}/enrich`)).status, 200);
    const done = await settle(a.id, 'web');
    assert.equal(done.web.status, 'done');
    assert.equal(done.web.findings.length, 1, 'a finding with no page really consulted is dropped');
    assert.equal(done.web.sources[0].url, 'https://www.afdb.org/fr/adfi');
    assert.ok(done.web.sources[0].consultedAt);
    assert.ok(!sent.includes('C106'), 'only names and themes go out — never the document');

    useFundingSearcherForTests(async () => ({ text: '{"findings": []}', citations: [] }));
    await call('Saad', 'POST', `/api/funding/analyses/${a.id}/enrich`);
    const failed = await settle(a.id, 'web');
    assert.equal(failed.web.status, 'failed');
    assert.match(failed.web.error, /no source/);
  });

  it('takes a PDF, keeps it private to the team, and lets the analysis be deleted', async () => {
    const pdf = makePdf([long(`Appel ${mark} page un`), long('Bailleur page deux')]);
    const boundary = `----ceed${mark}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nAppel PDF\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="appel.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/funding/analyses/pdf',
      headers: { cookie: `${SESSION_COOKIE}=${people.Saad!.token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    assert.equal(res.statusCode, 201);
    const a = await settle(res.json().id);
    assert.equal(a.sourceKind, 'pdf');
    assert.equal(a.pages, 2);
    assert.match(seen!.text, /\[Page 2\]/, 'pages marked for the model');
    assert.ok(a.uploadId);
    assert.equal((await call('Lina', 'DELETE', `/api/funding/analyses/${a.id}`)).status, 403);
    assert.equal((await call('Saad', 'DELETE', `/api/funding/analyses/${a.id}`)).status, 200);
    assert.equal((await call('Saad', 'GET', `/api/funding/analyses/${a.id}`)).status, 404);
  });
});
