/**
 * L'espace de test : de faux programmes, de fausses startups, de faux comptes,
 * dans la vraie app.
 *
 * What makes something a test is written down twice, so neither can be lost:
 * a test record carries the account of the colleague who holds it, and a test
 * address is an alias of a colleague's own — `saad+jury@ceed-morocco.org`
 * belongs to whoever signs in as `saad@ceed-morocco.org`. Mail to it lands in
 * their inbox; a letter from a test programme to anybody else does not leave.
 */
import { suggestPassword, type DirectoryRecord } from '@ceed/shared';
import { db } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { accountOfRecord, createAccount, findAccount, markInvited, reissueProvisionalPassword } from './auth.js';
import { appLink } from './deliverables.js';
import { post } from './mail.js';
import { HttpError } from '../routes/util.js';

/* ------------------------------------------------------------------ */
/* Qui est un test                                                     */
/* ------------------------------------------------------------------ */

export { aliasBase, isTestAddress, isTestRecord, testOwnerOf } from './testIdentity.js';
import { testOwnerOf } from './testIdentity.js';

export async function markTest(recordId: string, ownerAccountId: string): Promise<void> {
  await (await db()).query('update records set test_owner = $2 where id = $1', [recordId, ownerAccountId]);
}

/* ------------------------------------------------------------------ */
/* Des startups fictives                                               */
/* ------------------------------------------------------------------ */

interface FakeStartup {
  slug: string;
  name: string;
  sector: string;
  city: string;
  pitch: string;
  offering: string;
  product: string;
  founded: number;
  team: number;
  women: number;
  revenue: number;
  raised: number;
  stage: 'idea' | 'prototype' | 'mvp' | 'customers';
}

const FAKE_STARTUPS: FakeStartup[] = [
  { slug: 'alpha', name: 'Alpha Agritech', sector: 'Agritech', city: 'Meknès', stage: 'customers', founded: 2022, team: 7, women: 3, revenue: 840000, raised: 1500000,
    pitch: 'Des capteurs et une app qui disent aux agriculteurs quand irriguer, parcelle par parcelle.',
    offering: 'Capteurs d’humidité du sol et tableau de bord d’irrigation', product: 'SoilSense' },
  { slug: 'beta', name: 'Beta Health', sector: 'Healthtech', city: 'Casablanca', stage: 'mvp', founded: 2023, team: 5, women: 2, revenue: 120000, raised: 400000,
    pitch: 'La téléconsultation pour les dispensaires ruraux, avec un dossier patient qui suit le malade.',
    offering: 'Plateforme de téléconsultation et dossier patient partagé', product: 'DocLink' },
  { slug: 'gamma', name: 'Gamma Fintech', sector: 'Fintech', city: 'Rabat', stage: 'prototype', founded: 2024, team: 3, women: 1, revenue: 0, raised: 0,
    pitch: 'Le paiement fractionné pour les commerçants de quartier, sans terminal.',
    offering: 'Paiement en plusieurs fois par QR code', product: 'Tqassit' },
  { slug: 'delta', name: 'Delta Edtech', sector: 'Edtech', city: 'Marrakech', stage: 'customers', founded: 2021, team: 12, women: 6, revenue: 2100000, raised: 3000000,
    pitch: 'Du soutien scolaire en darija, par vidéo courte, aligné sur le programme national.',
    offering: 'Application de soutien scolaire', product: 'Qraya' },
  { slug: 'epsilon', name: 'Epsilon Cleantech', sector: 'Cleantech', city: 'Tanger', stage: 'mvp', founded: 2023, team: 4, women: 1, revenue: 60000, raised: 250000,
    pitch: 'Des briques isolantes faites de déchets agricoles, pour des maisons plus fraîches l’été.',
    offering: 'Matériaux de construction biosourcés', product: 'Thermabrique' },
  { slug: 'zeta', name: 'Zeta Logistics', sector: 'Logistique', city: 'Agadir', stage: 'idea', founded: 2025, team: 2, women: 1, revenue: 0, raised: 0,
    pitch: 'Mutualiser les camions frigorifiques entre petits exportateurs de primeurs.',
    offering: 'Place de marché du transport frigorifique', product: 'ColdShare' },
];

/** A one-page PDF that says what it is — enough for a document field to hold something real. */
function fakePdf(title: string): Buffer {
  const text = `${title} - document fictif, espace de test CEED`.replace(/[()\\]/g, '');
  const stream = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/**
 * Crée des startups fictives aux fiches complètes, tenues par ce collègue.
 * Their address is an alias of his, so anything written to them lands with him.
 */
export async function generateStartups(
  owner: { accountId: string; email: string; recordId: string },
  count: number,
): Promise<DirectoryRecord[]> {
  const [local, domain] = owner.email.toLowerCase().split('@');
  const taken = new Set((await testStartups()).map((r) => r.name.toLowerCase()));
  const fresh = FAKE_STARTUPS.filter((s) => !taken.has(s.name.toLowerCase())).slice(0, Math.max(1, Math.min(count, 6)));
  const out: DirectoryRecord[] = [];
  const year = new Date().getFullYear() - 1;

  for (const s of fresh) {
    const org = await dir.createRecord({
      kind: 'org',
      name: s.name,
      roles: ['Startup'],
      origin: 'manual',
      emails: [`${local}+${s.slug}@${domain}`],
      places: [{ city: s.city, country: 'Morocco' }],
      website: `https://${s.slug}.example.ma`,
      bio: s.pitch,
      pitch: s.pitch,
      sector: s.sector,
      stage: s.stage,
      foundedYear: s.founded,
      teamSize: s.team,
      sheet: {
        orgType: 'startup',
        legalStatus: s.stage === 'idea' ? 'in_creation' : 'registered',
        legalForm: 'sarl',
        foundedOn: `${s.founded}-03-01`,
        maturity: s.stage === 'customers' ? 'traction' : s.stage === 'idea' ? 'ideation' : s.stage,
        activityNature: 'product',
        mainOffering: s.offering,
        salesZone: 'morocco',
        foundersCount: Math.min(3, s.team),
        womenCount: s.women,
        mvpUsers: s.stage === 'idea' ? 'no' : 'yes',
        activeClients: s.revenue ? Math.round(s.revenue / 20000) : 0,
        hasFunding: s.raised ? 'yes' : 'no',
        pastPrograms: 'no',
        currentPrograms: 'no',
      },
    });
    await markTest(org.id, owner.accountId);
    if (s.revenue) await dir.putRevenue(org.id, year, { amount: s.revenue, unavailable: false, currency: 'MAD' });
    if (s.raised) {
      await dir.addSheetItem('fundings', org.id, {
        onDate: `${year}-06-15`, amount: s.raised, currency: 'MAD', nature: 'equity', funderName: 'Fonds fictif', funderId: null,
      });
    }
    await dir.addSheetItem('products', org.id, {
      name: s.product, description: s.offering, imageUploadId: null, status: s.stage === 'idea' ? 'in_development' : 'available', price: '',
    });
    await dir.putNeed(org.id, 'mentoring', { active: true });
    await dir.putNeed(org.id, 'fundraising', { active: true });
    for (const [kind, label] of [['pitch_deck', 'Pitch deck'], ['rc', 'Registre de commerce']] as const) {
      const file = await repo.saveUpload({
        filename: `${s.slug}-${kind}.pdf`,
        mime: 'application/pdf',
        bytes: fakePdf(`${s.name} - ${label}`),
        fieldId: 'document',
        uploadedBy: owner.recordId,
      });
      await dir.addDocument(org.id, { kind, year: null, label: '', uploadId: file.id }, 'Espace de test');
    }
    out.push((await dir.getRecord(org.id))!);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Des comptes fictifs                                                 */
/* ------------------------------------------------------------------ */

export const TEST_ROLES = ['founder', 'applicant', 'jury', 'mentor'] as const;
export type TestRole = (typeof TEST_ROLES)[number];

const ROLE_WORDS: Record<TestRole, { roles: string[]; title: string }> = {
  founder: { roles: [], title: 'Fondateur' },
  applicant: { roles: [], title: 'Candidat' },
  jury: { roles: ['Jury'], title: 'Juré' },
  mentor: { roles: ['Mentor'], title: 'Mentor' },
};

/**
 * Un compte fictif : une fiche personne de test, son compte, et le mot de
 * passe envoyé à l'alias — donc dans la boîte du collègue.
 *
 * L'adresse doit être l'alias d'un compte CEED : c'est elle qui dit à qui
 * le compte appartient, et qui garantit que rien ne part ailleurs.
 */
export async function createTestPerson(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: TestRole;
  orgId?: string | null;
}): Promise<DirectoryRecord> {
  const email = input.email.trim().toLowerCase();
  const owner = await testOwnerOf(email);
  if (!owner) {
    throw new HttpError(422, 'A test address is an alias of a CEED colleague’s own: firstname+role@ceed-morocco.org.', {
      email: 'Use a colleague’s address with a “+” — e.g. saad+jury@ceed-morocco.org.',
    });
  }
  if ((await findAccount(email)) || (await dir.findByEmail('person', email))) {
    throw new HttpError(422, 'This address is already used.', { email: 'Already used — pick another alias.' });
  }
  const words = ROLE_WORDS[input.role];
  const record = await dir.createRecord({
    kind: 'person',
    name: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    roles: words.roles,
    jobTitle: words.title,
    emails: [email],
    origin: 'manual',
  });
  await markTest(record.id, owner.accountId);

  if (input.role === 'founder' && input.orgId) {
    const org = await dir.getRecord(input.orgId);
    if (!org?.testOwner) throw new HttpError(422, 'A test founder holds a test startup.');
    await dir.linkRecords({ personId: record.id, orgId: org.id, role: 'Fondateur', access: 'admin' });
  }

  await sendAccess(record.id);
  return (await dir.getRecord(record.id))!;
}

/** Opens the account if needed, with a fresh password mailed to the alias. */
export async function sendAccess(recordId: string): Promise<void> {
  const record = await dir.getRecord(recordId);
  if (!record?.testOwner || !record.email) throw new HttpError(422, 'Only a test account is handled here.');
  const password = suggestPassword();
  const account = await accountOfRecord(recordId);
  if (account) {
    if (account.state === 'claimed') {
      throw new HttpError(422, 'This test account already chose its password — use “Forgot password” to reset it.');
    }
    await reissueProvisionalPassword(account.id, password);
  } else {
    await createAccount({ email: record.email, password, recordId, mustChangePassword: true });
  }
  const opened = await accountOfRecord(recordId);
  if (opened) await markInvited(opened.id);
  const origin = await appLink();
  const login = origin ? origin.replace(/\/me\?tab=Programs$/, '/login') : '';
  await post({
    kind: 'test_access',
    to: record.email,
    toName: record.name,
    recordId,
    subject: `[TEST] Accès CEED — ${record.name}`,
    body: [
      `${record.name},`,
      '',
      'Un compte de l’espace de test CEED vient d’être ouvert à cette adresse. Voici le mot de passe — vous en choisirez un à vous en vous connectant :',
      '',
      `    ${record.email}`,
      `    ${password}`,
      '',
      ...(login ? [`    ${login}`, ''] : []),
      'Ce compte ne voit que les programmes de test, et ce qui s’y écrit ne quitte pas l’espace de test.',
    ].join('\n'),
  });
}

/* ------------------------------------------------------------------ */
/* Ce que l'espace contient                                            */
/* ------------------------------------------------------------------ */

const testStartups = async () =>
  (await dir.listRecords({ kind: 'org' })).filter((r) => r.testOwner);

export interface SandboxPerson {
  record: DirectoryRecord;
  owner: string;
  account: Awaited<ReturnType<typeof accountOfRecord>>;
  organisations: string[];
}

export async function sandboxOverview() {
  const conn = await db();
  const owners = new Map(
    (await conn.query<{ id: string; email: string }>('select id, email from accounts where staff_role is not null')).map(
      (a) => [a.id, a.email] as const,
    ),
  );
  const people = (await dir.listRecords({ kind: 'person' })).filter((r) => r.testOwner);
  const startups = await testStartups();
  const affiliations = await conn.query<{ personId: string; orgName: string }>(
    `select a.person_id as "personId", o.name as "orgName" from affiliations a join records o on o.id = a.org_id
      where a.person_id = any($1::text[])`,
    [people.map((p) => p.id)],
  );
  const programs = (await repo.listPrograms()).filter((p) => p.isTest);
  return {
    colleagues: [...owners.values()].sort(),
    startups: startups.map((s) => ({ record: s, owner: owners.get(s.testOwner!) ?? '' })),
    people: await Promise.all(
      people.map(async (p) => ({
        record: p,
        owner: owners.get(p.testOwner!) ?? '',
        account: await accountOfRecord(p.id),
        organisations: affiliations.filter((a) => a.personId === p.id).map((a) => a.orgName),
      })),
    ),
    programs: programs.map((p) => ({ id: p.id, name: p.name, editions: p.editions.map((e) => ({ id: e.id, name: e.name })) })),
  };
}

/* ------------------------------------------------------------------ */
/* Un programme de test                                                */
/* ------------------------------------------------------------------ */

/**
 * Copie une édition existante dans un programme de test à part. La structure
 * vient avec — parcours, phases, briques et leurs réglages —, jamais un
 * candidat, une note ou une lettre.
 */
export async function createTestProgram(fromEditionId: string | null, name: string, startTomorrow = false) {
  const source = fromEditionId ? await repo.getEditionDetail(fromEditionId) : null;
  if (fromEditionId && !source) throw new HttpError(404, 'That edition does not exist.');
  const program = await repo.createProgram({
    name: name.trim() || `ZZ Test — ${source?.program.name ?? 'Programme'}`,
    colour: '#8A8F98',
    summary: 'Programme de l’espace de test : invisible des vrais membres.',
  });
  await (await db()).query('update programs set is_test = true where id = $1', [program.id]);
  /* Tout le calendrier glisse d'autant, pour que la copie s'ouvre demain et
     que le test tienne en une semaine plutôt que sur les dates d'une autre saison. */
  const shiftDays = source && startTomorrow ? await repo.daysUntilTomorrow(source.id) : 0;
  const moved = (d: string | null | undefined) => (d ? repo.shiftDate(d, shiftDays) : null);
  await repo.createEdition(program.id, {
    name: source?.name ?? 'Édition de test',
    city: source?.city ?? '',
    startsOn: moved(source?.startsOn),
    endsOn: moved(source?.endsOn),
    ...(fromEditionId
      ? { copyFromEditionId: fromEditionId, copy: { forTest: true, shiftDays } }
      : { template: 'selection_funnel' as const }),
  });
  return repo.getProgram(program.id);
}

/* ------------------------------------------------------------------ */
/* Purger                                                              */
/* ------------------------------------------------------------------ */

/**
 * Supprime tout ce qui est de test, et rien d'autre : les programmes de test,
 * les fiches de test et ce qui en dépend — comptes, candidatures, fichiers,
 * lettres. Une vraie fiche, un vrai programme n'est jamais touché.
 */
export async function purgeSandbox(): Promise<{ programs: number; records: number }> {
  const conn = await db();
  return conn.tx(async () => {
    const records = await conn.query<{ id: string }>('select id from records where test_owner is not null');
    const ids = records.map((r) => r.id);
    const programs = await conn.query<{ id: string }>('delete from programs where is_test returning id');
    if (ids.length) {
      await conn.query(
        `delete from uploads where uploaded_by = any($1::text[])
            or id in (select upload_id from org_documents where org_id = any($1::text[]))`,
        [ids],
      );
      await conn.query('delete from outbox where record_id = any($1::text[])', [ids]);
      // A test startup that applied to a real programme leaves with its candidacy.
      await conn.query('delete from candidates where org_id = any($1::text[])', [ids]);
      await conn.query('delete from records where id = any($1::text[])', [ids]);
    }
    return { programs: programs.length, records: ids.length };
  });
}
