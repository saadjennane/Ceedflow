/**
 * Realistic starting data. Run with `npm run seed --workspace=@ceed/api`.
 * Wipes the programme tables first, so it is safe to re-run.
 */
import type { EvaluationCriterion, FormField } from '@ceed/shared';
import { db, migrate } from './client.js';
import * as repo from './repo.js';

const FIELDS: FormField[] = [
  { id: 'f_stage', type: 'select', label: 'Stage', help: '', required: true, options: ['Idea', 'Prototype', 'Early revenue', 'Growth'], showInTable: true },
  { id: 'f_sector', type: 'select', label: 'Sector', help: '', required: true, options: ['Agritech', 'Edtech', 'Fintech', 'Healthtech', 'Logistics', 'Cleantech', 'Retail tech'], showInTable: true },
  { id: 'f_city', type: 'select', label: 'City', help: '', required: true, options: ['Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Agadir', 'Fès'], showInTable: true },
  { id: 'f_founded', type: 'number', label: 'Year founded', help: '', required: false, options: [], showInTable: false },
  { id: 'f_team', type: 'number', label: 'Team size', help: 'Founders and employees, full-time equivalent.', required: true, options: [], showInTable: true },
  { id: 'f_revenue', type: 'number', label: 'Revenue over the last 12 months (MAD)', help: 'Enter 0 if you have not sold yet.', required: false, options: [], showInTable: false },
  { id: 'f_problem', type: 'long_text', label: 'What problem are you solving?', help: 'Three or four sentences.', required: true, options: [], showInTable: false },
  { id: 'f_traction', type: 'long_text', label: 'What traction can you show?', help: 'Users, pilots, letters of intent, revenue.', required: true, options: [], showInTable: false },
  { id: 'f_website', type: 'url', label: 'Website or deck', help: '', required: false, options: [], showInTable: false },
];

const CRITERIA: EvaluationCriterion[] = [
  { id: 'c_problem', label: 'Problem and market', help: 'Is the problem real, and is the market worth addressing?', weight: 2, max: 10 },
  { id: 'c_solution', label: 'Solution and differentiation', help: '', weight: 2, max: 10 },
  { id: 'c_team', label: 'Team', help: 'Complementarity, commitment, track record.', weight: 3, max: 10 },
  { id: 'c_traction', label: 'Traction', help: '', weight: 2, max: 10 },
  { id: 'c_impact', label: 'Impact and job creation', help: '', weight: 1, max: 10 },
];

interface SeedCandidate {
  orgName: string;
  contactName: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  sector: string;
  city: string;
  team: number;
  revenue: number;
  founded: number;
  problem: string;
  traction: string;
  marks: [number, number, number, number, number][];
}

const CANDIDATES: SeedCandidate[] = [
  {
    orgName: 'SportIQ', contactName: 'Yassine Amrani', email: 'yassine@sportiq.ma', phone: '+212 661 23 45 67',
    source: 'LinkedIn', stage: 'Early revenue', sector: 'Healthtech', city: 'Casablanca', team: 6, revenue: 420000, founded: 2023,
    problem: 'Amateur football clubs in Morocco track player fitness on paper, so injuries that could be prevented are only noticed once a player is out for the season.',
    traction: '14 clubs on a paid monthly plan, 1 900 players monitored, 38% of revenue from Casablanca academies.',
    marks: [[9, 8, 9, 8, 7], [8, 8, 9, 9, 7], [9, 9, 8, 8, 8]],
  },
  {
    orgName: 'Terra Nova', contactName: 'Salma Berrada', email: 'salma@terranova.ma', phone: '+212 662 11 09 88',
    source: 'Partner referral', stage: 'Prototype', sector: 'Agritech', city: 'Marrakech', team: 4, revenue: 0, founded: 2024,
    problem: 'Smallholder farmers in the Haouz plain irrigate on habit rather than measurement, wasting up to 40% of the water they pay for.',
    traction: 'Soil probes installed on 6 farms, 11 farmers on the waiting list, an MoU with a regional cooperative.',
    marks: [[9, 8, 7, 5, 9], [8, 9, 7, 6, 9], [9, 8, 8, 5, 10]],
  },
  {
    orgName: 'Darija Learn', contactName: 'Omar El Fassi', email: 'omar@darijalearn.com', phone: '+212 663 55 21 40',
    source: 'Instagram', stage: 'Early revenue', sector: 'Edtech', city: 'Rabat', team: 5, revenue: 310000, founded: 2022,
    problem: 'Moroccan children abroad lose Darija within a generation, and no structured course teaches it as a living spoken language.',
    traction: '2 400 paying families across France, Belgium and Canada, 71% retention after six months.',
    marks: [[8, 9, 8, 8, 6], [7, 8, 8, 7, 6], [8, 8, 9, 8, 7]],
  },
  {
    orgName: 'Souk Direct', contactName: 'Nadia Chraibi', email: 'nadia@soukdirect.ma', phone: '+212 664 78 12 33',
    source: 'CEED alumni', stage: 'Early revenue', sector: 'Retail tech', city: 'Casablanca', team: 9, revenue: 980000, founded: 2021,
    problem: 'Neighbourhood grocers buy from three or four wholesalers a week, each with a different price list and no delivery.',
    traction: '310 active shops, 22 000 orders in the last year, gross margin up from 4% to 9%.',
    marks: [[8, 7, 8, 9, 7], [8, 7, 7, 9, 6], [7, 7, 8, 9, 7]],
  },
  {
    orgName: 'Atlas Mobility', contactName: 'Reda Bennani', email: 'reda@atlasmobility.ma', phone: '+212 665 33 66 12',
    source: 'University', stage: 'Prototype', sector: 'Logistics', city: 'Tanger', team: 3, revenue: 0, founded: 2024,
    problem: 'Last-mile delivery in the Tanger medina cannot use vans, and porters are dispatched by phone with no visibility.',
    traction: 'Pilot with 2 courier firms, 600 deliveries dispatched through the app.',
    marks: [[7, 7, 6, 5, 6], [6, 7, 6, 4, 6], [7, 6, 7, 5, 7]],
  },
  {
    orgName: 'Chifa', contactName: 'Imane Tazi', email: 'imane@chifa.health', phone: '+212 666 90 44 21',
    source: 'LinkedIn', stage: 'Early revenue', sector: 'Healthtech', city: 'Rabat', team: 7, revenue: 540000, founded: 2022,
    problem: 'Chronic patients in secondary cities travel four hours for a fifteen-minute follow-up consultation.',
    traction: '4 100 teleconsultations, partnerships with 2 mutual insurers, 18 doctors on the platform.',
    marks: [[9, 8, 9, 9, 9], [9, 9, 8, 8, 9], [8, 9, 9, 9, 9]],
  },
  {
    orgName: 'Wafr', contactName: 'Anas Lahlou', email: 'anas@wafr.ma', phone: '+212 667 21 88 05',
    source: 'Instagram', stage: 'Prototype', sector: 'Fintech', city: 'Casablanca', team: 4, revenue: 0, founded: 2024,
    problem: 'Informal savings circles move billions in cash every year with no record, and no member can build a credit history from them.',
    traction: '38 circles digitised in closed beta, 210 000 MAD tracked.',
    marks: [[8, 8, 7, 5, 8], [8, 7, 7, 5, 7], [7, 8, 8, 6, 8]],
  },
  {
    orgName: 'Solaris Rif', contactName: 'Hamza Ouazzani', email: 'hamza@solarisrif.ma', phone: '+212 668 47 30 19',
    source: 'Partner referral', stage: 'Idea', sector: 'Cleantech', city: 'Fès', team: 2, revenue: 0, founded: 2025,
    problem: 'Rural households pay for butane they carry up the mountain, while the roof above them gets 300 days of sun.',
    traction: 'Feasibility study with an NGO, 40 households surveyed.',
    marks: [[6, 5, 4, 2, 8], [6, 6, 5, 2, 8], [5, 5, 5, 3, 7]],
  },
  {
    orgName: 'Fennec Robotics', contactName: 'Kenza Idrissi', email: 'kenza@fennecrobotics.com', phone: '+212 669 15 72 60',
    source: 'University', stage: 'Prototype', sector: 'Agritech', city: 'Agadir', team: 5, revenue: 60000, founded: 2023,
    problem: 'Greenhouse growers in Souss cannot find labour for repetitive scouting work, so disease is caught days too late.',
    traction: 'Two paying pilots in Chtouka, 9 hectares covered, 31% earlier detection than manual scouting.',
    marks: [[8, 9, 8, 7, 7], [8, 9, 7, 6, 7], [9, 9, 8, 7, 8]],
  },
  {
    orgName: 'Madrassa Plus', contactName: 'Youssef Kabbaj', email: 'youssef@madrassaplus.ma', phone: '+212 660 84 22 17',
    source: 'CEED alumni', stage: 'Idea', sector: 'Edtech', city: 'Casablanca', team: 2, revenue: 0, founded: 2025,
    problem: 'Public school teachers spend Sunday evenings rebuilding the same lesson plans from scratch.',
    traction: '120 teachers in a WhatsApp community, no product yet.',
    marks: [[6, 5, 5, 2, 7], [5, 5, 5, 2, 6], [6, 6, 4, 3, 7]],
  },
  {
    orgName: 'Riad Stay', contactName: 'Leila Mansouri', email: 'leila@riadstay.com', phone: '+212 661 09 55 73',
    source: 'Instagram', stage: 'Early revenue', sector: 'Retail tech', city: 'Marrakech', team: 6, revenue: 720000, founded: 2021,
    problem: 'Independent riads lose a fifth of their revenue to platform commission and still manage bookings in a notebook.',
    traction: '64 riads, 11 000 nights booked, 8% commission against the 18% they paid before.',
    marks: [[7, 6, 7, 8, 5], [6, 6, 7, 8, 5], [7, 7, 6, 8, 6]],
  },
  {
    orgName: 'Bahri Logistics', contactName: 'Mehdi Sabri', email: 'mehdi@bahrilogistics.ma', phone: '+212 662 63 41 08',
    source: 'LinkedIn', stage: 'Growth', sector: 'Logistics', city: 'Casablanca', team: 14, revenue: 2400000, founded: 2019,
    problem: 'Freight forwarders reconcile customs paperwork by email, and a single missing document holds a container for days.',
    traction: '39 forwarders, 4 800 containers processed, average clearance down from 6 days to 3.',
    marks: [[8, 8, 9, 9, 6], [9, 8, 9, 10, 6], [8, 9, 9, 9, 7]],
  },
];

/** Ids follow the same derivation the scoring grid uses, so seeded and live scores line up. */
const EVALUATORS = ['Sarah Benali', 'Karim Alaoui', 'Nawal Cherkaoui'].map((name) => ({
  id: `ev_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  name,
}));

const JURY = ['Sarah Benali', 'Karim Alaoui', 'Nawal Cherkaoui', 'Driss Benjelloun', 'Fatima Zahra Ouali'];

async function wipe() {
  const conn = await db();
  await conn.query('delete from programs');
}

async function main() {
  await migrate();
  await wipe();

  /* ---- The live programme, fully wired ---- */
  const grow = await repo.createProgram({
    name: 'CEED Grow',
    code: 'GROW',
    type: 'Acceleration',
    summary: 'Six months of structured support for Moroccan startups with first revenue and a team ready to scale.',
    partner: 'Attijariwafa Bank Foundation',
    colour: '#2F5BFF',
    edition: { name: 'Grow 2026', startsOn: '2026-09-01', endsOn: '2027-02-28', city: 'Casablanca', seats: 12 },
  });
  const editionId = grow.editions[0].id;
  await repo.updateEdition(editionId, { status: 'Running' });

  const detail = (await repo.getEditionDetail(editionId))!;
  const trackId = detail.tracks[0].id;
  const firstPhase = detail.tracks[0].phases[0];
  await repo.updatePhase(firstPhase.id, { name: 'Recruitment', startsOn: '2026-09-01', endsOn: '2026-10-15' });

  const sourcing = await repo.createBlock(firstPhase.id, 'sourcing', 'Call for applications');
  await repo.updateBlock(sourcing.id, {
    config: {
      opensAt: '2026-09-01',
      closesAt: '2026-10-10',
      target: 60,
      channels: ['LinkedIn', 'Instagram', 'Partner referral', 'University', 'CEED alumni'],
      eligibility: 'Registered in Morocco, at least two founders working full time, first revenue in the last 12 months.',
    },
  });

  const application = await repo.createBlock(firstPhase.id, 'application', 'Application form');
  await repo.updateBlock(application.id, {
    config: {
      opensAt: '2026-09-01',
      closesAt: '2026-10-10',
      published: true,
      intro: 'Applications for Grow 2026 are open until 10 October. Expect about twenty minutes — you can see every question before you start.',
      confirmation: 'Thank you. We have your application and will come back to you by 25 October.',
      fields: FIELDS,
    },
  });

  const screening = await repo.createPhase(trackId, 'Screening');
  await repo.updatePhase(screening.id, { startsOn: '2026-10-11', endsOn: '2026-10-31' });
  const evaluation = await repo.createBlock(screening.id, 'evaluation', 'First review');
  await repo.updateBlock(evaluation.id, {
    config: {
      opensAt: '2026-10-12',
      closesAt: '2026-10-25',
      criteria: CRITERIA,
      evaluators: EVALUATORS.map((e) => e.name),
      requireComment: true,
    },
  });
  const shortlisting = await repo.createBlock(screening.id, 'selection', 'Shortlist');
  await repo.updateBlock(shortlisting.id, {
    config: { outputKind: 'shortlist', method: 'threshold', threshold: 64, passLabel: 'Shortlisted', failLabel: 'Not selected' },
  });

  const committeePhase = await repo.createPhase(trackId, 'Selection committee');
  await repo.updatePhase(committeePhase.id, { startsOn: '2026-11-05', endsOn: '2026-11-20' });
  const committee = await repo.createBlock(committeePhase.id, 'committee', 'Jury day');
  await repo.updateBlock(committee.id, {
    config: {
      heldAt: '2026-11-12',
      location: 'CEED Morocco, Casablanca',
      durationMinutes: 300,
      juryIds: JURY,
      agenda: 'Fifteen minutes of pitch and ten of questions per startup. Deliberation at the end of the day.',
    },
  });
  const finalSelection = await repo.createBlock(committeePhase.id, 'selection', 'Final selection');
  await repo.updateBlock(finalSelection.id, {
    config: { outputKind: 'cohort', method: 'top_n', topN: 6, passLabel: 'Selected', failLabel: 'Not selected' },
  });

  /* ---- Candidates, with their applications and their scores ---- */
  // Applications trickle in across the call window rather than all landing at once.
  for (const [index, spec] of CANDIDATES.entries()) {
    const day = 2 + Math.round((index * 36) / CANDIDATES.length);
    const submittedAt = new Date(Date.UTC(2026, 8, 1 + day, 9 + (index % 8), (index * 13) % 60)).toISOString();
    const candidate = await repo.createCandidate({
      submittedAt,
      editionId,
      trackId,
      originBlockId: application.id,
      orgName: spec.orgName,
      contactName: spec.contactName,
      email: spec.email,
      phone: spec.phone,
      source: spec.source,
      answers: {
        f_stage: spec.stage,
        f_sector: spec.sector,
        f_city: spec.city,
        f_founded: spec.founded,
        f_team: spec.team,
        f_revenue: spec.revenue,
        f_problem: spec.problem,
        f_traction: spec.traction,
        f_website: `https://${spec.orgName.toLowerCase().replace(/[^a-z]/g, '')}.ma`,
      },
    });
    for (const [index, evaluator] of EVALUATORS.entries()) {
      const marks = spec.marks[index];
      await repo.upsertScore({
        blockId: evaluation.id,
        candidateId: candidate.id,
        evaluatorId: evaluator.id,
        evaluatorName: evaluator.name,
        marks: Object.fromEntries(CRITERIA.map((c, i) => [c.id, marks[i]])),
        comment: '',
        submit: true,
      });
    }
  }

  /* ---- The shortlist is already out; the final selection is not ---- */
  const { publishSelection } = await import('../services/selection.js');
  await publishSelection(shortlisting.id);

  /* ---- Two more programmes, so the list looks like a real account ---- */
  const she = await repo.createProgram({
    name: 'SheLeads',
    code: 'SHE',
    type: 'Incubation',
    summary: 'Twelve weeks for women founders at pre-revenue stage, in Rabat and Fès.',
    partner: 'US Embassy Rabat',
    colour: '#00A36A',
    edition: { name: 'SheLeads 2027', startsOn: '2027-01-12', endsOn: '2027-04-10', city: 'Rabat', seats: 15, template: 'selection_funnel' },
  });
  await repo.createEdition(she.id, { name: 'SheLeads 2025', startsOn: '2025-01-15', endsOn: '2025-04-15', city: 'Fès', seats: 15 });
  const past = (await repo.getProgram(she.id))!.editions.find((e) => e.name === 'SheLeads 2025')!;
  await repo.updateEdition(past.id, { status: 'Completed' });

  await repo.createProgram({
    name: 'Impact Booster',
    code: 'IMP',
    type: 'Bootcamp',
    summary: 'A four-day bootcamp for social ventures, run twice a year with regional partners.',
    partner: 'Fondation Drosos',
    colour: '#C77400',
  });

  const programs = await repo.listPrograms();
  console.log(
    `seeded ${programs.length} programmes, ${programs.reduce((n, p) => n + p.editions.length, 0)} editions, ${CANDIDATES.length} candidates`,
  );
  await (await db()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
