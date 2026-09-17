/**
 * Realistic starting data. Run with `npm run seed --workspace=@ceed/api`.
 * Wipes the programme tables first, so it is safe to re-run.
 */
import type { EvaluationCriterion, FormField, FormPage } from '@ceed/shared';
import { db, migrate } from './client.js';
import * as repo from './repo.js';

/** Grow 2026 asks its questions over three steps rather than one long page. */
const PAGES: FormPage[] = [
  { id: 'p_startup', name: 'The startup', intro: 'A few facts so we can place you.' },
  { id: 'p_team', name: 'Team and numbers', intro: 'Where you stand today. Rough figures are fine.' },
  { id: 'p_project', name: 'Your project', intro: 'The part the review panel actually reads. Take your time.' },
];

const FIELDS: FormField[] = [
  { id: 'f_stage', pageId: 'p_startup', type: 'select', label: 'Stage', help: '', required: true, options: ['Idea', 'Prototype', 'Early revenue', 'Growth'], showInTable: true },
  { id: 'f_sector', pageId: 'p_startup', type: 'select', label: 'Sector', help: '', required: true, options: ['Agritech', 'Edtech', 'Fintech', 'Healthtech', 'Logistics', 'Cleantech', 'Retail tech'], showInTable: true },
  { id: 'f_city', pageId: 'p_startup', type: 'select', label: 'City', help: '', required: true, options: ['Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Agadir', 'Fès'], showInTable: true },
  { id: 'f_founded', pageId: 'p_startup', type: 'number', label: 'Year founded', help: '', required: false, options: [], showInTable: false },
  { id: 'f_team', pageId: 'p_team', type: 'number', label: 'Team size', help: 'Founders and employees, full-time equivalent.', required: true, options: [], showInTable: true },
  { id: 'f_revenue', pageId: 'p_team', type: 'number', label: 'Revenue over the last 12 months (MAD)', help: 'Enter 0 if you have not sold yet.', required: false, options: [], showInTable: false },
  { id: 'f_problem', pageId: 'p_project', type: 'long_text', label: 'What problem are you solving?', help: 'Three or four sentences.', required: true, options: [], showInTable: false },
  { id: 'f_traction', pageId: 'p_project', type: 'long_text', label: 'What traction can you show?', help: 'Users, pilots, letters of intent, revenue.', required: true, options: [], showInTable: false },
  { id: 'f_website', pageId: 'p_project', type: 'url', label: 'Website or deck', help: '', required: false, options: [], showInTable: false },
];

const CRITERIA: EvaluationCriterion[] = [
  { id: 'c_problem', label: 'Problem and market', help: 'Is the problem real, and is the market worth addressing?', weight: 2, max: 10 },
  { id: 'c_solution', label: 'Solution and differentiation', help: '', weight: 2, max: 10 },
  { id: 'c_team', label: 'Team', help: 'Complementarity, commitment, track record.', weight: 3, max: 10 },
  { id: 'c_traction', label: 'Traction', help: '', weight: 2, max: 10 },
  { id: 'c_impact', label: 'Impact and job creation', help: '', weight: 1, max: 10 },
];

/** The jury's own grid: what a panel can judge from a pitch, not from a file. */
const JURY_CRITERIA: EvaluationCriterion[] = [
  { id: 'j_pitch', label: 'Clarity of the pitch', help: 'Is the proposition understood in two minutes?', weight: 2, max: 10 },
  { id: 'j_team', label: 'Founders on stage', help: 'Conviction, command of the numbers, honesty about risk.', weight: 3, max: 10 },
  { id: 'j_model', label: 'Business model', help: 'Does the money add up, and can it scale?', weight: 3, max: 10 },
  { id: 'j_fit', label: 'Fit with the program', help: 'Will six months here change their trajectory?', weight: 2, max: 10 },
];

const PROSPECTS = [
  'contact@technopark.ma',
  'startups@um6p.ma',
  'hello@lafabrique.ma',
  'incubateur@enactus.ma',
  'reseau@cluster-digital.ma',
  'contact@impacthub-casa.ma',
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
  /** Explicit marks from the three screening evaluators, or a quality to derive them from. */
  marks?: [number, number, number, number, number][];
  quality?: number;
}

/** Three evaluators rarely agree exactly; this spreads a quality into marks that differ. */
function marksFor(spec: SeedCandidate): [number, number, number, number, number][] {
  if (spec.marks) return spec.marks;
  const base = spec.quality ?? 6;
  const seed = [...spec.orgName].reduce((n, c) => n + c.charCodeAt(0), 0);
  return [0, 1, 2].map((evaluator) =>
    ([0, 1, 2, 3, 4] as const).map((criterion) => {
      const jitter = ((seed + evaluator * 7 + criterion * 3) % 5) - 2;
      return Math.max(1, Math.min(10, base + jitter));
    }),
  ) as [number, number, number, number, number][];
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

  /* ---- the rest of the intake, sketched more lightly ---- */
  {
    orgName: 'Nakhla Bio', contactName: 'Zineb Haddad', email: 'zineb@nakhlabio.ma', phone: '+212 663 12 90 41',
    source: 'Partner referral', stage: 'Early revenue', sector: 'Agritech', city: 'Agadir', team: 8, revenue: 640000, founded: 2021,
    problem: 'Date growers in the Draa valley sell an undifferentiated crop at the wholesale price, whatever its quality.',
    traction: 'Sorting and packing for 21 cooperatives, exports to two French distributors.', quality: 8,
  },
  {
    orgName: 'Tabib Direct', contactName: 'Othmane Rachidi', email: 'othmane@tabibdirect.ma', phone: '+212 664 55 30 12',
    source: 'LinkedIn', stage: 'Early revenue', sector: 'Healthtech', city: 'Casablanca', team: 6, revenue: 380000, founded: 2023,
    problem: 'Pharmacies guess at what to restock, so a third of their shelf is money standing still.',
    traction: '90 pharmacies, stock-outs down by half in the first quarter.', quality: 8,
  },
  {
    orgName: 'Cash Plus Labs', contactName: 'Hind Belkadi', email: 'hind@cashpluslabs.ma', phone: '+212 665 71 24 88',
    source: 'CEED alumni', stage: 'Growth', sector: 'Fintech', city: 'Casablanca', team: 12, revenue: 1900000, founded: 2020,
    problem: 'A small merchant who takes only cash cannot prove a turnover, so no bank will lend to it.',
    traction: '1 400 merchants, 62 million MAD processed, a first credit product with a partner bank.', quality: 9,
  },
  {
    orgName: 'Argan Source', contactName: 'Malak Ait Ben', email: 'malak@argansource.ma', phone: '+212 666 18 44 07',
    source: 'Partner referral', stage: 'Early revenue', sector: 'Agritech', city: 'Agadir', team: 5, revenue: 410000, founded: 2022,
    problem: 'Argan cooperatives sell to intermediaries who capture most of the margin abroad.',
    traction: '9 cooperatives, direct contracts with 4 cosmetics brands.', quality: 7,
  },
  {
    orgName: 'Mekki Trucking', contactName: 'Ilyas Mekki', email: 'ilyas@mekkitrucking.ma', phone: '+212 667 02 77 39',
    source: 'LinkedIn', stage: 'Early revenue', sector: 'Logistics', city: 'Casablanca', team: 10, revenue: 880000, founded: 2021,
    problem: 'Half the lorries on the Casablanca–Tanger road drive back empty.',
    traction: '240 hauliers on the platform, 31% of return trips now filled.', quality: 8,
  },
  {
    orgName: 'Kotoubia Code', contactName: 'Amine Sefrioui', email: 'amine@kotoubiacode.ma', phone: '+212 668 33 19 60',
    source: 'University', stage: 'Early revenue', sector: 'Edtech', city: 'Marrakech', team: 7, revenue: 290000, founded: 2022,
    problem: 'Companies cannot find junior developers, while graduates cannot find a first job.',
    traction: '3 cohorts, 78 graduates, 64% hired within three months.', quality: 7,
  },
  {
    orgName: 'Barid Green', contactName: 'Soukaina Naji', email: 'soukaina@baridgreen.ma', phone: '+212 669 40 55 23',
    source: 'Instagram', stage: 'Prototype', sector: 'Cleantech', city: 'Rabat', team: 4, revenue: 45000, founded: 2024,
    problem: 'Parcel deliveries in central Rabat are made by two-stroke scooters nobody wants to breathe behind.',
    traction: 'Twelve electric scooters leased to three courier firms.', quality: 7,
  },
  {
    orgName: 'Souiri Stay', contactName: 'Nizar Bouzid', email: 'nizar@souiristay.ma', phone: '+212 660 27 81 14',
    source: 'Instagram', stage: 'Early revenue', sector: 'Retail tech', city: 'Marrakech', team: 4, revenue: 230000, founded: 2023,
    problem: 'Guesthouses in Essaouira lose bookings every time a request arrives while nobody is at the desk.',
    traction: '38 guesthouses, bookings answered in four minutes on average.', quality: 6,
  },
  {
    orgName: 'Zitoun Analytics', contactName: 'Yassir Lamrani', email: 'yassir@zitoun.ma', phone: '+212 661 66 03 92',
    source: 'University', stage: 'Prototype', sector: 'Agritech', city: 'Fès', team: 3, revenue: 0, founded: 2024,
    problem: 'Olive mills cannot tell a good harvest from a mediocre one until the oil is already pressed.',
    traction: 'Two mills testing the sensor over one season.', quality: 6,
  },
  {
    orgName: 'Medina Maps', contactName: 'Rania Tahiri', email: 'rania@medinamaps.ma', phone: '+212 662 90 37 55',
    source: 'Instagram', stage: 'Prototype', sector: 'Retail tech', city: 'Fès', team: 3, revenue: 20000, founded: 2024,
    problem: 'Artisan workshops in the medina are invisible to anyone who is not already standing in front of them.',
    traction: '210 workshops mapped, 4 000 monthly visitors.', quality: 6,
  },
  {
    orgName: 'Sahara Solar', contactName: 'Khalid Moutawakil', email: 'khalid@saharasolar.ma', phone: '+212 663 74 12 08',
    source: 'Partner referral', stage: 'Early revenue', sector: 'Cleantech', city: 'Agadir', team: 9, revenue: 1200000, founded: 2020,
    problem: 'Agricultural pumping runs on diesel in a region that has sun eleven months a year.',
    traction: '46 farms converted, payback under three years.', quality: 9,
  },
  {
    orgName: 'Hanouty Pay', contactName: 'Mounir Skalli', email: 'mounir@hanoutypay.ma', phone: '+212 664 21 65 77',
    source: 'CEED alumni', stage: 'Prototype', sector: 'Fintech', city: 'Casablanca', team: 5, revenue: 0, founded: 2024,
    problem: 'Corner shops extend credit in a notebook and write off what they cannot chase.',
    traction: '70 shops in beta, 480 000 MAD of ledgers digitised.', quality: 6,
  },
  {
    orgName: 'Tanja Textile', contactName: 'Widad Ziani', email: 'widad@tanjatextile.ma', phone: '+212 665 39 04 26',
    source: 'LinkedIn', stage: 'Growth', sector: 'Retail tech', city: 'Tanger', team: 16, revenue: 2800000, founded: 2019,
    problem: 'Textile subcontractors take orders on WhatsApp and lose track of which batch is where.',
    traction: '19 factories, 140 000 pieces tracked a month.', quality: 7,
  },
  {
    orgName: 'Sihati', contactName: 'Aya Bennis', email: 'aya@sihati.ma', phone: '+212 666 58 71 30',
    source: 'LinkedIn', stage: 'Prototype', sector: 'Healthtech', city: 'Rabat', team: 4, revenue: 0, founded: 2025,
    problem: 'Diabetic patients leave the consultation with a diet sheet written for someone else.',
    traction: 'Pilot with one hospital, 60 patients.', quality: 5,
  },
  {
    orgName: 'Oujda Fresh', contactName: 'Bilal Haddaoui', email: 'bilal@oujdafresh.ma', phone: '+212 667 83 46 11',
    source: 'University', stage: 'Idea', sector: 'Logistics', city: 'Casablanca', team: 2, revenue: 0, founded: 2025,
    problem: 'Produce spoils between the field and the market for want of a cold chain anyone can afford.',
    traction: 'Two interviews with wholesalers. Nothing built yet.', quality: 3,
  },
  {
    orgName: 'Chaabi Learn', contactName: 'Nada Filali', email: 'nada@chaabilearn.ma', phone: '+212 668 11 29 74',
    source: 'Instagram', stage: 'Idea', sector: 'Edtech', city: 'Casablanca', team: 2, revenue: 0, founded: 2025,
    problem: 'Adults who left school early have nowhere to learn to read that does not treat them as children.',
    traction: 'A prototype lesson tested with nine adults.', quality: 4,
  },
  {
    orgName: 'Rif Hydro', contactName: 'Tarik Amrani', email: 'tarik@rifhydro.ma', phone: '+212 669 65 92 18',
    source: 'Partner referral', stage: 'Idea', sector: 'Cleantech', city: 'Tanger', team: 2, revenue: 0, founded: 2025,
    problem: 'Mountain villages rely on a spring that runs dry earlier every year.',
    traction: 'A feasibility note. No pilot.', quality: 3,
  },
  {
    orgName: 'Casa Rides', contactName: 'Sami Berrada', email: 'sami@casarides.ma', phone: '+212 660 74 38 52',
    source: 'Instagram', stage: 'Prototype', sector: 'Logistics', city: 'Casablanca', team: 3, revenue: 0, founded: 2024,
    problem: 'Company shuttle buses run half empty on routes nobody has revisited in years.',
    traction: 'One employer piloting with 80 staff.', quality: 5,
  },
  {
    orgName: 'Amal Care', contactName: 'Salima Ouhadi', email: 'salima@amalcare.ma', phone: '+212 661 45 17 93',
    source: 'CEED alumni', stage: 'Prototype', sector: 'Healthtech', city: 'Marrakech', team: 4, revenue: 60000, founded: 2023,
    problem: 'Families looking for home care for an elderly parent find only word of mouth.',
    traction: '30 carers vetted, 45 families served.', quality: 6,
  },
  {
    orgName: 'Tifinagh Type', contactName: 'Idir Ouzzine', email: 'idir@tifinaghtype.ma', phone: '+212 662 32 80 46',
    source: 'University', stage: 'Idea', sector: 'Edtech', city: 'Rabat', team: 2, revenue: 0, founded: 2025,
    problem: 'Amazigh is an official language with almost no usable typefaces or keyboards.',
    traction: 'One typeface drawn, released free.', quality: 4,
  },
  {
    orgName: 'Meknes Malt', contactName: 'Ayoub Cherkaoui', email: 'ayoub@meknesmalt.ma', phone: '+212 663 96 51 20',
    source: 'LinkedIn', stage: 'Early revenue', sector: 'Agritech', city: 'Fès', team: 6, revenue: 350000, founded: 2022,
    problem: 'Brewers import malt that could be grown and malted two hundred kilometres away.',
    traction: 'First malting line running, two brewery customers.', quality: 7,
  },
  {
    orgName: 'Darna Design', contactName: 'Loubna Ghali', email: 'loubna@darnadesign.ma', phone: '+212 664 08 63 71',
    source: 'Instagram', stage: 'Early revenue', sector: 'Retail tech', city: 'Casablanca', team: 5, revenue: 270000, founded: 2023,
    problem: 'Furniture makers sell through showrooms that take half the price and hold the customer.',
    traction: '24 workshops selling direct, 1 100 orders last year.', quality: 6,
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
  await repo.updateEdition(editionId, {
    status: 'Running',
    mentors: ['Sarah Benali', 'Karim Alaoui', 'Nawal Cherkaoui', 'Driss Benjelloun', 'Fatima Zahra Ouali'],
  });

  const detail = (await repo.getEditionDetail(editionId))!;
  const trackId = detail.tracks[0].id;
  const firstPhase = detail.tracks[0].phases[0];
  await repo.updatePhase(firstPhase.id, { name: 'Recruitment', startsOn: '2026-09-01', endsOn: '2026-10-15' });

  const sourcing = await repo.createBlock(firstPhase.id, 'sourcing', 'Call for applications');
  await repo.updateBlock(sourcing.id, {
    config: {
      opensAt: '2026-09-01',
      closesAt: '2026-10-10',
      channels: ['LinkedIn', 'Instagram', 'Partner referral', 'University', 'CEED alumni'],
      outreach: {
        subject: 'Grow 2026 is open — six months of support for Moroccan startups',
        body: [
          'Hello,',
          '',
          'CEED Grow opens its 2026 edition. We take twelve startups with first revenue and a team ready to scale, for six months of structured support in Casablanca.',
          '',
          'Applications close on 10 October. Could you pass the call on to the founders around you?',
          '',
          'The CEED Morocco team',
        ].join('\n'),
        recipients: { kind: 'list', emails: PROSPECTS },
      },
    },
  });

  const application = await repo.createBlock(firstPhase.id, 'application', 'Application form');
  await repo.updateBlock(application.id, {
    config: {
      opensAt: '2026-09-01',
      closesAt: '2026-10-10',
      published: true,
      intro: 'Applications for Grow 2026 are open until 10 October. Three short steps, about twenty minutes. Nothing is sent until you reach the end.',
      confirmation: 'Thank you. We have your application and will come back to you by 25 October.',
      layout: 'paged',
      pages: PAGES,
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
    config: { rsvpMode: 'slots', rsvpDeadline: '2026-11-05' },
  });

  // The grid stays in its own block. Sitting in the committee's phase is what
  // makes this evaluation score that committee, sitting by sitting.
  const juryScoring = await repo.createBlock(committeePhase.id, 'evaluation', 'Jury scoring');
  await repo.updateBlock(juryScoring.id, {
    config: { criteria: JURY_CRITERIA, requireComment: true, opensAt: '2026-11-12', closesAt: '2026-11-20' },
  });
  const finalSelection = await repo.createBlock(committeePhase.id, 'selection', 'Final selection');
  await repo.updateBlock(finalSelection.id, {
    config: {
      outputKind: 'cohort',
      method: 'top_n',
      topN: 11,
      sourceBlockId: juryScoring.id,
      passLabel: 'Selected',
      failLabel: 'Not selected',
    },
  });

  /* ---- The call went out to the partner network ---- */
  await repo.recordSend(
    sourcing.id,
    'Grow 2026 is open — six months of support for Moroccan startups',
    'CEED Grow opens its 2026 edition. Applications close on 10 October.',
    PROSPECTS,
  );

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
      const marks = marksFor(spec)[index];
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

  /* ---- Statuses from the screening, then the shortlist ---- */
  const { applyOutcomes } = await import('../services/scoring.js');
  const evaluationBlock = (await repo.getBlock(evaluation.id))!;
  await applyOutcomes(evaluationBlock);

  const { publishSelection } = await import('../services/selection.js');
  await publishSelection(shortlisting.id);

  /* ---- Two sittings, filled from the screening statuses ---- */
  // A sitting runs the whole day, with the lunch break cut out of it.
  const juryDay = await repo.createSession(committee.id, {
    name: 'Jury day',
    heldOn: '2026-11-12',
    windows: [
      { startsAt: '09:00', endsAt: '12:30' },
      { startsAt: '14:00', endsAt: '17:00' },
    ],
    minutesPerStartup: 25,
    location: 'CEED Morocco, Casablanca',
    jury: JURY.slice(0, 3),
  });
  const catchUp = await repo.createSession(committee.id, {
    name: 'Catch-up panel',
    heldOn: '2026-11-14',
    windows: [{ startsAt: '09:00', endsAt: '10:30' }],
    minutesPerStartup: 15,
    location: 'Online',
    jury: [JURY[0], JURY[3], JURY[4]],
  });

  const { committeeView, seatOnFreeSlots } = await import('../services/committee.js');
  // The pool is whoever the shortlist sent through.
  const waiting = (await committeeView(committee.id))!.pool.map((p) => p.candidate.id);
  // The big day takes what it can hold; the rest go to the catch-up panel.
  await seatOnFreeSlots(juryDay.id, waiting.slice(0, 15));
  await seatOnFreeSlots(catchUp.id, waiting.slice(15));

  /* ---- The startups have booked their times; the jury has scored them ---- */
  // The committee runs Calendly-style, so seating leaves everyone unplaced until
  // they choose. This plays those choices out.
  const view = (await committeeView(committee.id))!;

  // Who drifts is picked by rank, not by position: the ones who go quiet sit
  // around the middle of the screening, and the one who pulls out is last.
  const rough = (orgName: string) => {
    const spec = CANDIDATES.find((c) => c.orgName === orgName);
    const marks = spec ? marksFor(spec)[0] : [7, 7, 7, 7, 7];
    return marks.reduce((a, b) => a + b, 0) / marks.length;
  };
  const byRank = view.sessions
    .flatMap((s) => s.assignments)
    .sort((a, b) => rough(b.candidate.orgName) - rough(a.candidate.orgName));
  const middle = Math.floor(byRank.length / 2);
  const silent = new Set([byRank[middle]?.candidate.id, byRank[middle + 1]?.candidate.id]);
  const withdrew = byRank[byRank.length - 1]?.candidate.id;

  let seat = 0;
  for (const session of view.sessions) {
    const free = session.slots.map((s) => s.index);
    for (const row of session.assignments) {
      if (silent.has(row.candidate.id)) continue;
      if (row.candidate.id === withdrew) {
        await repo.respondToAssignment(row.assignment.id, 'declined', null);
        continue;
      }
      await repo.moveAssignmentToSlot(row.assignment.id, free.shift() ?? null);
      await repo.respondToAssignment(row.assignment.id, 'confirmed');
      // The jury judges a pitch, not a file. Stage presence is its own trait, so a
      // strong application can land badly in the room and a modest one can shine.
      const spec = CANDIDATES.find((c) => c.orgName === row.candidate.orgName);
      const fileMarks = spec ? marksFor(spec)[0] : [7, 7, 7, 7, 7];
      const onPaper = fileMarks.reduce((a, b) => a + b, 0) / fileMarks.length;
      const hash = [...row.candidate.orgName].reduce((n, ch, i) => n + ch.charCodeAt(0) * (i + 1), 0);
      const stage = (hash % 7) - 3; // -3 to +3, and unrelated to the file
      // Capped at 9 so a perfect card stays rare, and floored so nobody is absurd.
      const inTheRoom = Math.max(3, Math.min(9, onPaper + stage * 0.7));
      for (const [index, juror] of session.session.jury.entries()) {
        await repo.upsertScore({
          blockId: juryScoring.id,
          sessionId: session.session.id,
          candidateId: row.candidate.id,
          evaluatorId: `ev_${juror.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          evaluatorName: juror,
          marks: Object.fromEntries(
            JURY_CRITERIA.map((c, i) => [
              c.id,
              // Spread wide enough that the ranking rarely has to break a tie.
              Math.max(1, Math.min(10, Math.round(inTheRoom + ((hash * (i + 2) + index * 13) % 5) - 2))),
            ]),
          ),
          comment: stage >= 2 ? 'Better in the room than on paper.' : stage <= -2 ? 'The file promised more.' : 'Solid, no surprises.',
          submit: true,
        });
      }
      seat++;
    }
  }
  await applyOutcomes((await repo.getBlock(juryScoring.id))!);

  /* ---- The cohort is announced, with one startup fished back by hand ---- */
  const { addToSelection } = await import('../services/selection.js');
  const beforeCut = (await import('../services/selection.js')).selectionView;
  const cut = (await beforeCut(finalSelection.id))!;
  // The jury argued for one the ranking left just outside; the team put it back.
  const wildcard = cut.rows.filter((r) => r.outcome === 'fail' && r.score !== null)[0];
  if (wildcard) await addToSelection(finalSelection.id, { candidateIds: [wildcard.candidate.id], outcome: 'pass' });
  await publishSelection(finalSelection.id);

  /* ---- The cohort is under way: mentors assigned, one already off track ---- */
  const cohort = (await repo.listCandidates(editionId)).filter((c) => c.status === 'Selected');
  const bench = ['Sarah Benali', 'Karim Alaoui', 'Nawal Cherkaoui', 'Driss Benjelloun'];
  for (const [index, member] of cohort.entries()) {
    await repo.updateCandidate(member.id, {
      mentor: bench[index % bench.length],
      cohortStatus: index === 3 ? 'At risk' : index === 7 ? 'Graduated' : 'Active',
    });
  }

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
