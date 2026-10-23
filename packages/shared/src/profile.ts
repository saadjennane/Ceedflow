/**
 * La fiche d'une organisation : ce qui reste vrai d'un programme à l'autre.
 *
 * An application form is a snapshot of one call: what that year asked, in the
 * words it asked it. The company itself outlives the form — what it is, where
 * it stands legally, how mature it is, what it sells — and a jury reading a
 * candidacy wants exactly those. They live on the organisation's record, are
 * filled once, and every programme reads them.
 *
 * The fiche is in sections, and it is conditional: a company still being
 * registered has no legal form to give, an idea has no turnover, a patent
 * nobody filed has no number. A question that does not apply is not asked —
 * and, the part that matters for the bar, it is not counted either. A founder
 * who answered everything that applies to them is at a hundred.
 *
 * One module for the rules, read by the server and by both screens, so that
 * what is shown, what is counted and what the jury sees cannot disagree.
 */

/* ------------------------------------------------------------------ */
/* The closed lists                                                    */
/* ------------------------------------------------------------------ */

/** One choice, in the two languages the platform speaks. */
export interface Choice<K extends string = string> {
  key: K;
  fr: string;
  en: string;
}

const choices = <K extends string>(list: readonly Choice<K>[]) => list;

export const ORG_TYPES = choices([
  { key: 'startup', fr: 'Startup', en: 'Startup' },
  { key: 'tpe', fr: 'TPE', en: 'Micro-business' },
  { key: 'pme', fr: 'PME', en: 'SME' },
  { key: 'large', fr: 'Grande entreprise', en: 'Large company' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);
export type OrgType = (typeof ORG_TYPES)[number]['key'];

export const LEGAL_STATUSES = choices([
  { key: 'in_creation', fr: 'En cours de création', en: 'Being registered' },
  { key: 'registered', fr: 'Immatriculée', en: 'Registered' },
] as const);
export type LegalStatus = (typeof LEGAL_STATUSES)[number]['key'];

export const LEGAL_FORMS = choices([
  { key: 'sarl', fr: 'SARL', en: 'SARL' },
  { key: 'sarl_au', fr: 'SARL AU', en: 'SARL AU' },
  { key: 'sa', fr: 'SA', en: 'SA' },
  { key: 'sas', fr: 'SAS', en: 'SAS' },
  { key: 'auto', fr: 'Auto-entrepreneur', en: 'Sole trader (auto-entrepreneur)' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const CURRENCIES = ['MAD', 'EUR', 'USD'] as const;

/**
 * Où en est une société, en sept niveaux.
 *
 * A closed list rather than free text, because the question it answers is
 * "show me everything at MVP" — and free text answers that with six spellings
 * of the same word. Ordered: the rules below compare positions.
 */
export const MATURITY_LEVELS = choices([
  { key: 'ideation', fr: 'Idéation', en: 'Ideation' },
  { key: 'prototype', fr: 'Prototype', en: 'Prototype' },
  { key: 'mvp', fr: 'MVP', en: 'MVP' },
  { key: 'commercialisation', fr: 'Commercialisation', en: 'Commercialisation' },
  { key: 'traction', fr: 'Traction', en: 'Traction' },
  { key: 'growth', fr: 'Croissance', en: 'Growth' },
  { key: 'scaleup', fr: 'Scale-up', en: 'Scale-up' },
] as const);
export type Maturity = (typeof MATURITY_LEVELS)[number]['key'];

/** The five stages the record had before, kept so an old value still reads. */
export const ORG_STAGES = ['idea', 'prototype', 'mvp', 'customers', 'growing'] as const;
export type OrgStage = (typeof ORG_STAGES)[number];
export const STAGE_TO_MATURITY: Record<OrgStage, Maturity> = {
  idea: 'ideation',
  prototype: 'prototype',
  mvp: 'mvp',
  customers: 'commercialisation',
  growing: 'growth',
};

/**
 * Les secteurs, en liste fermée.
 *
 * A sector typed by hand cannot be searched: "Agritech", "agri-tech" and
 * "Agriculture" are three answers to one question. A value from before the
 * list still reads — it is shown as it was typed — and is replaced the next
 * time somebody picks from the list.
 */
export const SECTORS = choices([
  { key: 'agritech', fr: 'Agriculture & Agritech', en: 'Agriculture & Agritech' },
  { key: 'agrifood', fr: 'Agroalimentaire', en: 'Food & beverage' },
  { key: 'fintech', fr: 'Finance & Fintech', en: 'Finance & Fintech' },
  { key: 'health', fr: 'Santé & Healthtech', en: 'Health & Healthtech' },
  { key: 'education', fr: 'Éducation & Edtech', en: 'Education & Edtech' },
  { key: 'commerce', fr: 'Commerce & E-commerce', en: 'Retail & E-commerce' },
  { key: 'industry', fr: 'Industrie', en: 'Manufacturing' },
  { key: 'energy', fr: 'Énergie & Cleantech', en: 'Energy & Cleantech' },
  { key: 'water', fr: 'Eau & Environnement', en: 'Water & Environment' },
  { key: 'mobility', fr: 'Mobilité & Logistique', en: 'Mobility & Logistics' },
  { key: 'construction', fr: 'BTP & Immobilier', en: 'Construction & Real estate' },
  { key: 'tourism', fr: 'Tourisme & Hôtellerie', en: 'Tourism & Hospitality' },
  { key: 'media', fr: 'Médias, Culture & Industries créatives', en: 'Media, Culture & Creative industries' },
  { key: 'software', fr: 'Logiciel & SaaS', en: 'Software & SaaS' },
  { key: 'ai', fr: 'Intelligence artificielle & Data', en: 'Artificial intelligence & Data' },
  { key: 'services', fr: 'Services aux entreprises', en: 'Business services' },
  { key: 'social', fr: 'Économie sociale & solidaire', en: 'Social & solidarity economy' },
  { key: 'textile', fr: 'Textile & Mode', en: 'Textile & Fashion' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const PATENT_ANSWERS = choices([
  { key: 'yes', fr: 'Oui', en: 'Yes' },
  { key: 'pending', fr: 'En cours', en: 'Pending' },
  { key: 'no', fr: 'Non', en: 'No' },
] as const);

export const YES_NO = choices([
  { key: 'yes', fr: 'Oui', en: 'Yes' },
  { key: 'no', fr: 'Non', en: 'No' },
] as const);

export const ACTIVITY_NATURES = choices([
  { key: 'product', fr: 'Produit', en: 'Product' },
  { key: 'service', fr: 'Service', en: 'Service' },
  { key: 'platform', fr: 'Plateforme', en: 'Platform' },
  { key: 'mixed', fr: 'Mixte', en: 'Mixed' },
] as const);

export const TARGET_MARKETS = choices([
  { key: 'b2b', fr: 'B2B', en: 'B2B' },
  { key: 'b2c', fr: 'B2C', en: 'B2C' },
  { key: 'b2g', fr: 'B2G', en: 'B2G' },
  { key: 'b2b2c', fr: 'B2B2C', en: 'B2B2C' },
] as const);

export const SALES_ZONES = choices([
  { key: 'morocco', fr: 'Maroc', en: 'Morocco' },
  { key: 'international', fr: 'International', en: 'International' },
  { key: 'both', fr: 'Les deux', en: 'Both' },
] as const);

export const PRODUCT_STATUSES = choices([
  { key: 'in_development', fr: 'En développement', en: 'In development' },
  { key: 'available', fr: 'Disponible', en: 'Available' },
  { key: 'commercialised', fr: 'Commercialisé', en: 'On the market' },
] as const);

/**
 * La nature d'un financement — et la raison pour laquelle on ne les additionne
 * jamais ensemble : une subvention n'est pas une levée, un prêt d'honneur non
 * plus, et un total qui les mélange dit d'une société qu'elle a levé ce
 * qu'elle a emprunté.
 */
export const FUNDING_NATURES = choices([
  { key: 'equity', fr: 'Investissement en capital', en: 'Equity investment' },
  { key: 'debt', fr: 'Dette', en: 'Debt' },
  { key: 'grant', fr: 'Subvention', en: 'Grant' },
  { key: 'honour_loan', fr: 'Prêt d’honneur', en: 'Honour loan' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const PROGRAM_STATUSES = choices([
  { key: 'ongoing', fr: 'En cours', en: 'Ongoing' },
  { key: 'done', fr: 'Terminé', en: 'Completed' },
] as const);

/**
 * Ce que quelqu'un est dans l'organisation.
 *
 * Proposé et non imposé : le rôle d'une affiliation a toujours été un texte,
 * et ceux d'avant la liste — « Founder », « Directrice technique » — restent
 * lisibles tels quels.
 */
export const AFFILIATION_ROLES = choices([
  { key: 'founder', fr: 'Fondateur', en: 'Founder' },
  { key: 'cofounder', fr: 'Cofondateur', en: 'Co-founder' },
  { key: 'ceo', fr: 'CEO', en: 'CEO' },
  { key: 'employee', fr: 'Collaborateur', en: 'Team member' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

/* ---- Les besoins : « Comment pouvons-nous vous accompagner ? » ---- */

export const NEEDS = choices([
  { key: 'fundraising', fr: 'Lever des fonds', en: 'Raise funds' },
  { key: 'markets', fr: 'Accéder à de nouveaux marchés', en: 'Reach new markets' },
  { key: 'mentoring', fr: 'Bénéficier de mentorat', en: 'Get mentoring' },
  { key: 'product', fr: 'Développer mon produit', en: 'Build my product' },
  { key: 'partners', fr: 'Trouver des partenaires', en: 'Find partners' },
  { key: 'hiring', fr: 'Recruter des talents', en: 'Hire talent' },
  { key: 'support', fr: 'Intégrer un programme d’accompagnement', en: 'Join a support programme' },
] as const);
export type NeedKey = (typeof NEEDS)[number]['key'];

export const RAISE_TYPES = choices([
  { key: 'equity', fr: 'Equity', en: 'Equity' },
  { key: 'debt', fr: 'Dette', en: 'Debt' },
  { key: 'grant', fr: 'Subvention', en: 'Grant' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const HORIZONS = choices([
  { key: 'now', fr: 'Immédiat', en: 'Now' },
  { key: '3m', fr: '3 mois', en: '3 months' },
  { key: '6m', fr: '6 mois', en: '6 months' },
  { key: '12m', fr: '12 mois', en: '12 months' },
] as const);

export const MARKET_GOALS = choices([
  { key: 'clients', fr: 'Nouveaux clients', en: 'New clients' },
  { key: 'distributors', fr: 'Distributeurs', en: 'Distributors' },
  { key: 'tenders', fr: 'Appels d’offres et marchés', en: 'Tenders and public contracts' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const MENTORING_DOMAINS = choices([
  { key: 'strategy', fr: 'Stratégie', en: 'Strategy' },
  { key: 'finance', fr: 'Finance', en: 'Finance' },
  { key: 'sales', fr: 'Marketing et vente', en: 'Marketing and sales' },
  { key: 'legal', fr: 'Juridique', en: 'Legal' },
  { key: 'tech', fr: 'Technologie', en: 'Technology' },
  { key: 'hr', fr: 'Ressources humaines', en: 'People' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const PRODUCT_AREAS = choices([
  { key: 'mvp', fr: 'Développement MVP', en: 'Building an MVP' },
  { key: 'software', fr: 'Développement logiciel', en: 'Software development' },
  { key: 'uxui', fr: 'UX/UI', en: 'UX/UI' },
  { key: 'ai', fr: 'Intelligence artificielle', en: 'Artificial intelligence' },
  { key: 'cloud', fr: 'Infrastructure / Cloud', en: 'Infrastructure / Cloud' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const PARTNER_KINDS = choices([
  { key: 'commercial', fr: 'Partenaires commerciaux', en: 'Commercial partners' },
  { key: 'tech', fr: 'Partenaires technologiques', en: 'Technology partners' },
  { key: 'industrial', fr: 'Partenaires industriels', en: 'Industrial partners' },
  { key: 'distribution', fr: 'Partenaires de distribution', en: 'Distribution partners' },
  { key: 'other', fr: 'Autre', en: 'Other' },
] as const);

export const SUPPORT_KINDS = choices([
  { key: 'incubation', fr: 'Incubation', en: 'Incubation' },
  { key: 'acceleration', fr: 'Accélération', en: 'Acceleration' },
  { key: 'venture_building', fr: 'Venture building', en: 'Venture building' },
  { key: 'international', fr: 'Internationalisation', en: 'Going international' },
  { key: 'sector', fr: 'Accompagnement sectoriel', en: 'Sector-specific support' },
] as const);

/**
 * Ce que chaque besoin demande, et ce qui le dit rempli.
 *
 * Le champ `key` est la réponse sans laquelle le besoin ne dit rien : un
 * montant pour une levée, des domaines pour du mentorat. C'est lui qui compte,
 * et c'est lui qu'un rapprochement lira d'abord.
 */
export const NEED_KEY_FIELD: Record<NeedKey, string> = {
  fundraising: 'amount',
  markets: 'clients',
  mentoring: 'domains',
  product: 'areas',
  partners: 'kinds',
  hiring: 'profiles',
  support: 'kinds',
};

/* ---- Les documents ---- */

/** What a file may be, by what it is for. */
const PDF = ['application/pdf'];
const DECK = [
  ...PDF,
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const ANY_DOC = [
  ...DECK,
  'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
];

export const DOCUMENT_KINDS = [
  { key: 'statutes', fr: 'Statuts juridiques', en: 'Articles of association', mimes: PDF, accept: '.pdf' },
  { key: 'rc', fr: 'Registre de commerce (RC)', en: 'Commercial register (RC)', mimes: PDF, accept: '.pdf' },
  { key: 'financials', fr: 'Bilan', en: 'Financial statements', mimes: PDF, accept: '.pdf' },
  { key: 'pitch_deck', fr: 'Pitch deck', en: 'Pitch deck', mimes: DECK, accept: '.pdf,.ppt,.pptx' },
  { key: 'catalogue', fr: 'Catalogue produits', en: 'Product catalogue', mimes: PDF, accept: '.pdf' },
  {
    key: 'other', fr: 'Autre document', en: 'Other document', mimes: ANY_DOC,
    accept: '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp',
  },
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['key'];

/** A founder whatever the word: the key from the list, or the words people typed before it. */
export const isFounderRole = (role: string): boolean =>
  ['founder', 'cofounder', 'fondateur', 'fondatrice', 'cofondateur', 'cofondatrice', 'co-founder', 'co-fondateur']
    .includes(role.trim().toLowerCase().replace(/\s+/g, ' '));

/** The word for a stored key, or the stored value itself when it is from before the list. */
export const choiceLabel = (list: readonly Choice[], key: string, lang: 'fr' | 'en'): string =>
  list.find((c) => c.key === key)?.[lang] ?? key;

/* ------------------------------------------------------------------ */
/* The fiche                                                           */
/* ------------------------------------------------------------------ */

/** Un exercice : un montant, zéro compris, ou « pas disponible ». */
export interface Revenue {
  year: number;
  amount: number | null;
  unavailable: boolean;
  currency: string;
}

/** What goes with a patent, depending on whether it is granted or pending. */
export interface PatentDetails {
  number?: string;
  date?: string;
  country?: string;
  office?: string;
  /** For a pending one: where the procedure is. */
  procedure?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  imageUploadId: string | null;
  status: string;
  price: string;
  position: number;
}

export interface Funding {
  id: string;
  onDate: string;
  amount: number | null;
  currency: string;
  nature: string;
  funderName: string;
  funderId: string | null;
}

/** A programme followed elsewhere, typed by the company. */
export interface ExternalProgram {
  id: string;
  name: string;
  organisation: string;
  startsOn: string;
  endsOn: string;
  status: string;
}

/** A programme followed here, read from a candidacy that was kept — never typed. */
export interface CeedProgram {
  editionId: string;
  program: string;
  edition: string;
  startsOn: string | null;
  endsOn: string | null;
  done: boolean;
}

/** A need, its answers, and when it last changed. Inactive: deselected, answers kept. */
export interface Need {
  need: string;
  data: Record<string, unknown>;
  active: boolean;
  updatedAt: string;
  deselectedAt: string | null;
}

/** A document on the organisation's own page. Private: it never leaves the organisation and CEED. */
export interface OrgDocument {
  id: string;
  kind: string;
  year: number | null;
  label: string;
  uploadId: string;
  filename: string;
  size: number;
  mime: string;
  createdAt: string;
  createdByName: string;
}

export interface Place {
  city: string;
  country: string;
  address?: string;
}

/** The fiche as every screen reads it — a jury's pane included. */
export interface OrgProfile {
  logoUploadId: string | null;
  /** The short description: what the company does, in the founder's words. */
  pitch: string;
  orgType: string;
  legalStatus: string;
  foundedOn: string;
  /** The year alone, which is all a record from before the date had. */
  foundedYear: number | null;
  legalForm: string;
  capitalAmount: number | null;
  capitalCurrency: string;
  sector: string;
  secondarySectors: string[];
  website: string;
  linkedin: string;
  socials: string[];
  emails: string[];
  phones: string[];
  /** The first is the head office; the others are where else it operates. */
  places: Place[];
  city: string;
  country: string;
  /** The longer description, which the record has always had. */
  bio: string;
  teamSize: number | null;
  maturity: string;
  /** The five-level stage from before, read when no maturity was chosen since. */
  stage: string;
  mvpUsers: string;
  activeClients: number | null;
  patent: string;
  patentDetails: PatentDetails;
  signedContracts: string;
  contractsCount: number | null;
  contractsAmount: number | null;
  revenues: Revenue[];
  activityNature: string;
  targetMarkets: string[];
  mainOffering: string;
  catalogueUrl: string;
  salesZone: string;
  salesCountries: string[];
  demoUrl: string;
  products: Product[];
  foundersCount: number | null;
  womenCount: number | null;
  hasFunding: string;
  fundings: Funding[];
  pastPrograms: string;
  currentPrograms: string;
  programs: ExternalProgram[];
  ceedPrograms: CeedProgram[];
  needs: Need[];
  documents: OrgDocument[];
}

/** Anything with these fields on it — the directory record, mostly. */
export type ProfileSource = Partial<OrgProfile>;

export const profileOf = (record: ProfileSource): OrgProfile => ({
  logoUploadId: record.logoUploadId ?? null,
  pitch: record.pitch ?? '',
  orgType: record.orgType ?? '',
  legalStatus: record.legalStatus ?? '',
  foundedOn: record.foundedOn ?? '',
  foundedYear: record.foundedYear ?? null,
  legalForm: record.legalForm ?? '',
  capitalAmount: record.capitalAmount ?? null,
  capitalCurrency: record.capitalCurrency || 'MAD',
  sector: record.sector ?? '',
  secondarySectors: record.secondarySectors ?? [],
  website: record.website ?? '',
  linkedin: record.linkedin ?? '',
  socials: record.socials ?? [],
  emails: record.emails ?? [],
  phones: record.phones ?? [],
  places: record.places ?? [],
  city: record.city ?? record.places?.[0]?.city ?? '',
  country: record.country ?? record.places?.[0]?.country ?? '',
  bio: record.bio ?? '',
  teamSize: record.teamSize ?? null,
  maturity: record.maturity || (record.stage ? (STAGE_TO_MATURITY[record.stage as OrgStage] ?? '') : ''),
  stage: record.stage ?? '',
  mvpUsers: record.mvpUsers ?? '',
  activeClients: record.activeClients ?? null,
  patent: record.patent ?? '',
  patentDetails: record.patentDetails ?? {},
  signedContracts: record.signedContracts ?? '',
  contractsCount: record.contractsCount ?? null,
  contractsAmount: record.contractsAmount ?? null,
  revenues: record.revenues ?? [],
  activityNature: record.activityNature ?? '',
  targetMarkets: record.targetMarkets ?? [],
  mainOffering: record.mainOffering ?? '',
  catalogueUrl: record.catalogueUrl ?? '',
  salesZone: record.salesZone ?? '',
  salesCountries: record.salesCountries ?? [],
  demoUrl: record.demoUrl ?? '',
  products: record.products ?? [],
  foundersCount: record.foundersCount ?? null,
  womenCount: record.womenCount ?? null,
  hasFunding: record.hasFunding ?? '',
  fundings: record.fundings ?? [],
  pastPrograms: record.pastPrograms ?? '',
  currentPrograms: record.currentPrograms ?? '',
  programs: record.programs ?? [],
  ceedPrograms: record.ceedPrograms ?? [],
  needs: record.needs ?? [],
  documents: record.documents ?? [],
});

/* ------------------------------------------------------------------ */
/* The conditions                                                      */
/* ------------------------------------------------------------------ */

const rank = (maturity: string) => MATURITY_LEVELS.findIndex((m) => m.key === maturity);

/** Registered: the legal half of the identity applies. */
export const isRegistered = (p: Pick<OrgProfile, 'legalStatus'>) => p.legalStatus === 'registered';

/** Selling already: turnover, clients and contracts are worth asking. */
export const sells = (p: Pick<OrgProfile, 'maturity'>) => rank(p.maturity) >= rank('commercialisation');

/** Sold abroad: which countries is worth asking. */
export const abroad = (p: Pick<OrgProfile, 'salesZone'>) => p.salesZone === 'international' || p.salesZone === 'both';

/** Something one can try online: a demo link is worth offering. */
export const digital = (p: Pick<OrgProfile, 'activityNature'>) =>
  p.activityNature === 'platform' || p.activityNature === 'mixed';

/** Accompanied before, or now: the programmes are worth listing. */
export const accompanied = (p: Pick<OrgProfile, 'pastPrograms' | 'currentPrograms'>) =>
  p.pastPrograms === 'yes' || p.currentPrograms === 'yes';

/** At MVP, the one commercial question is whether anybody uses it yet. */
export const atMvp = (p: Pick<OrgProfile, 'maturity'>) => p.maturity === 'mvp';

/**
 * Les exercices qu'on demande : les trois derniers clos.
 *
 * Not the current year, which is not closed and has no figure yet. Not a year
 * before the company existed either: a business founded last spring is asked
 * for one year, not three of which two are impossible.
 */
export function revenueYears(p: Pick<OrgProfile, 'foundedOn' | 'foundedYear'>, today = new Date()): number[] {
  const last = today.getFullYear() - 1;
  const born = p.foundedOn ? Number(p.foundedOn.slice(0, 4)) : (p.foundedYear ?? null);
  return [last, last - 1, last - 2].filter((y) => !born || y >= born);
}

/* ------------------------------------------------------------------ */
/* What is asked, where, and whether it is answered                    */
/* ------------------------------------------------------------------ */

/**
 * The sections, in the order the fiche shows them. Later lots add their own;
 * a section with no ask yet does not exist on screen.
 */
export const PROFILE_SECTIONS = ['identity', 'activity', 'team', 'maturity', 'funding', 'needs', 'documents'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

interface Ask {
  section: ProfileSection;
  /** 1: the first profile; 2: the enriched one; 3: the complete file, documents included. */
  level: 1 | 2 | 3;
  applies?: (p: OrgProfile) => boolean;
  filled: (p: OrgProfile) => boolean;
}

const text = (v: string) => v.trim().length > 0;
/* Zéro n'est pas vide : une équipe de zéro salarié, zéro client, un capital
   déclaré à zéro sont des réponses. */
const number = (v: number | null) => typeof v === 'number' && Number.isFinite(v);

const ASKS = {
  logo: { section: 'identity', level: 1, filled: (p) => Boolean(p.logoUploadId) },
  pitch: { section: 'identity', level: 1, filled: (p) => text(p.pitch) },
  orgType: { section: 'identity', level: 1, filled: (p) => text(p.orgType) },
  legalStatus: { section: 'identity', level: 1, filled: (p) => text(p.legalStatus) },
  founded: {
    section: 'identity', level: 1, applies: isRegistered,
    filled: (p) => text(p.foundedOn) || number(p.foundedYear),
  },
  legalForm: { section: 'identity', level: 1, applies: isRegistered, filled: (p) => text(p.legalForm) },
  capital: { section: 'identity', level: 1, applies: isRegistered, filled: (p) => number(p.capitalAmount) },
  sector: { section: 'identity', level: 1, filled: (p) => text(p.sector) },
  website: { section: 'identity', level: 1, filled: (p) => text(p.website) },
  linkedin: { section: 'identity', level: 1, filled: (p) => text(p.linkedin) },
  email: { section: 'identity', level: 1, filled: (p) => p.emails.some(text) },
  phone: { section: 'identity', level: 1, filled: (p) => p.phones.some(text) },
  city: { section: 'identity', level: 1, filled: (p) => text(p.places[0]?.city ?? p.city) },
  address: { section: 'identity', level: 1, filled: (p) => text(p.places[0]?.address ?? '') },
  bio: { section: 'activity', level: 2, filled: (p) => text(p.bio) },
  activityNature: { section: 'activity', level: 2, filled: (p) => text(p.activityNature) },
  targetMarkets: { section: 'activity', level: 2, filled: (p) => p.targetMarkets.length > 0 },
  offering: { section: 'activity', level: 2, filled: (p) => text(p.mainOffering) },
  salesZone: { section: 'activity', level: 2, filled: (p) => text(p.salesZone) },
  salesCountries: { section: 'activity', level: 2, applies: abroad, filled: (p) => p.salesCountries.length > 0 },
  products: { section: 'activity', level: 2, filled: (p) => p.products.length > 0 },
  foundersCount: { section: 'team', level: 2, filled: (p) => number(p.foundersCount) },
  team: { section: 'team', level: 2, filled: (p) => number(p.teamSize) },
  womenCount: { section: 'team', level: 2, filled: (p) => number(p.womenCount) },
  maturity: { section: 'maturity', level: 1, filled: (p) => text(p.maturity) },
  mvpUsers: { section: 'maturity', level: 2, applies: atMvp, filled: (p) => text(p.mvpUsers) },
  revenues: {
    section: 'maturity', level: 2,
    applies: (p) => sells(p) && revenueYears(p).length > 0,
    filled: (p) =>
      revenueYears(p).every((y) => p.revenues.some((r) => r.year === y && (r.unavailable || number(r.amount)))),
  },
  clients: { section: 'maturity', level: 2, applies: sells, filled: (p) => number(p.activeClients) },
  patent: { section: 'maturity', level: 2, filled: (p) => text(p.patent) },
  patentDetails: {
    section: 'maturity', level: 2,
    applies: (p) => p.patent === 'yes' || p.patent === 'pending',
    filled: (p) =>
      p.patent === 'pending'
        ? text(p.patentDetails.procedure ?? '')
        : text(p.patentDetails.number ?? '') && text(p.patentDetails.country ?? ''),
  },
  contracts: { section: 'maturity', level: 2, applies: sells, filled: (p) => text(p.signedContracts) },
  contractsDetail: {
    section: 'maturity', level: 2, applies: (p) => sells(p) && p.signedContracts === 'yes',
    filled: (p) => number(p.contractsCount) && number(p.contractsAmount),
  },
  hasFunding: { section: 'funding', level: 2, filled: (p) => text(p.hasFunding) },
  fundings: {
    section: 'funding', level: 2, applies: (p) => p.hasFunding === 'yes', filled: (p) => p.fundings.length > 0,
  },
  pastPrograms: { section: 'funding', level: 2, filled: (p) => text(p.pastPrograms) },
  currentPrograms: { section: 'funding', level: 2, filled: (p) => text(p.currentPrograms) },
  programs: {
    section: 'funding', level: 2, applies: accompanied,
    filled: (p) => p.programs.length > 0 || p.ceedPrograms.length > 0,
  },
  needs: { section: 'needs', level: 2, filled: (p) => p.needs.some((n) => n.active) },
  needsDetail: {
    section: 'needs', level: 2, applies: (p) => p.needs.some((n) => n.active),
    filled: (p) => p.needs.filter((n) => n.active).every(needAnswered),
  },
  docStatutes: {
    section: 'documents', level: 3, applies: (p) => documentsAsked(p).includes('statutes'),
    filled: (p) => hasDoc(p, 'statutes'),
  },
  docRc: {
    section: 'documents', level: 3, applies: (p) => documentsAsked(p).includes('rc'),
    filled: (p) => hasDoc(p, 'rc'),
  },
  docPitch: {
    section: 'documents', level: 3, applies: (p) => documentsAsked(p).includes('pitch_deck'),
    filled: (p) => hasDoc(p, 'pitch_deck'),
  },
  /* Le bilan du dernier exercice clos : les précédents se proposent, celui-là
     seul se demande. */
  docFinancials: {
    section: 'documents', level: 3, applies: (p) => documentsAsked(p).includes('financials'),
    filled: (p) => hasDoc(p, 'financials', revenueYears(p)[0]),
  },
} satisfies Record<string, Ask>;

export type ProfileAsk = keyof typeof ASKS;
export const PROFILE_ASKS = Object.keys(ASKS) as ProfileAsk[];

const ask = (key: ProfileAsk): Ask => ASKS[key];

/** Is a need's main answer given? A list with something in it, a number, a text. */
export const needAnswered = (n: Pick<Need, 'need' | 'data'>): boolean => {
  const v = n.data[NEED_KEY_FIELD[n.need as NeedKey] ?? ''];
  return Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '';
};

/** The documents a company of this kind is offered — and asked for, in the complete file. */
export const documentsAsked = (p: OrgProfile): DocumentKind[] => [
  ...(isRegistered(p) ? (['statutes', 'rc'] as const) : []),
  ...(p.orgType === 'startup' ? (['pitch_deck'] as const) : []),
  ...(isRegistered(p) && sells(p) && revenueYears(p).length ? (['financials'] as const) : []),
];

const hasDoc = (p: OrgProfile, kind: DocumentKind, year?: number) =>
  p.documents.some((d) => d.kind === kind && (year === undefined || d.year === year));

/** What applies to this company — the only asks it can be asked, or counted on. */
export const profileAsks = (p: OrgProfile, section?: ProfileSection): ProfileAsk[] =>
  PROFILE_ASKS.filter((k) => (!section || ask(k).section === section) && (ask(k).applies?.(p) ?? true));

export const askSection = (key: ProfileAsk): ProfileSection => ask(key).section;
export const askLevel = (key: ProfileAsk): 1 | 2 | 3 => ask(key).level;
export const askFilled = (p: OrgProfile, key: ProfileAsk): boolean => ask(key).filled(p);

/** What is still missing, in the order the fiche asks it. */
export const profileMissing = (p: OrgProfile, section?: ProfileSection): ProfileAsk[] =>
  profileAsks(p, section).filter((k) => !askFilled(p, k));

/** How far along, out of a hundred — on what applies, and nothing else. */
export const profileDone = (p: OrgProfile, section?: ProfileSection): number => {
  const asks = profileAsks(p, section);
  if (!asks.length) return 100;
  return Math.round(((asks.length - profileMissing(p, section).length) / asks.length) * 100);
};

/**
 * Est-ce qu'il y a quelque chose dessus ?
 *
 * A jury is shown the profile "if it exists" — and a record nobody has touched
 * does exist as a row while being an empty sheet. Showing it would put an
 * empty card in front of a juror and read as a fault of the startup's.
 */
export const profileStarted = (p: OrgProfile): boolean => profileAsks(p).some((k) => askFilled(p, k));

/* ------------------------------------------------------------------ */
/* Who reads what                                                      */
/* ------------------------------------------------------------------ */

/**
 * Qui lit quoi, champ par champ.
 *
 *   public     — what a public directory may show, the day there is one
 *   ecosystem  — what a juror or a mentor of its programmes reads
 *   private    — the organisation and CEED, nobody else
 *
 * Fixed here rather than chosen per company: three levels a founder can trust
 * because they are the same for everybody. Legal and financial documents are
 * private, and so is how to reach the company — a juror's work is the company,
 * not its phone number.
 */
export const VISIBILITY: Record<keyof OrgProfile, 'public' | 'ecosystem' | 'private'> = {
  logoUploadId: 'public', pitch: 'public', orgType: 'public', sector: 'public', secondarySectors: 'public',
  website: 'public', linkedin: 'public', socials: 'public', city: 'public', country: 'public',
  maturity: 'public', stage: 'public', activityNature: 'public', targetMarkets: 'public', products: 'public',
  legalStatus: 'ecosystem', foundedOn: 'ecosystem', foundedYear: 'ecosystem', legalForm: 'ecosystem',
  capitalAmount: 'ecosystem', capitalCurrency: 'ecosystem', bio: 'ecosystem', mainOffering: 'ecosystem',
  catalogueUrl: 'ecosystem', salesZone: 'ecosystem', salesCountries: 'ecosystem', demoUrl: 'ecosystem',
  teamSize: 'ecosystem', foundersCount: 'ecosystem', womenCount: 'ecosystem', mvpUsers: 'ecosystem',
  activeClients: 'ecosystem', patent: 'ecosystem', patentDetails: 'ecosystem', signedContracts: 'ecosystem',
  contractsCount: 'ecosystem', contractsAmount: 'ecosystem', revenues: 'ecosystem', hasFunding: 'ecosystem',
  fundings: 'ecosystem', pastPrograms: 'ecosystem', currentPrograms: 'ecosystem', programs: 'ecosystem',
  ceedPrograms: 'ecosystem', needs: 'ecosystem',
  /* Les lieux sont lisibles par l'écosystème, sauf l'adresse — retirée plus bas. */
  places: 'ecosystem',
  emails: 'private', phones: 'private', documents: 'private',
};

const RANK = { public: 0, ecosystem: 1, private: 2 } as const;

/** The fiche with everything above this level emptied — done on the server, before the answer leaves it. */
function upTo(p: OrgProfile, level: 'public' | 'ecosystem'): OrgProfile {
  const empty = profileOf({});
  const out = { ...p } as Record<string, unknown>;
  for (const [key, seen] of Object.entries(VISIBILITY)) {
    if (RANK[seen] > RANK[level]) out[key] = (empty as unknown as Record<string, unknown>)[key];
  }
  /* L'adresse du siège reste avec l'organisation ; la ville et le pays, non. */
  out.places = level === 'ecosystem' ? p.places.map(({ city, country }) => ({ city, country })) : [];
  return out as unknown as OrgProfile;
}

/**
 * La fiche telle que l'écosystème la lit — un juré, un mentor.
 *
 * A field the screen merely hides is a field anybody can read in the network
 * tab, so what is private never leaves the server for these readers.
 */
export const forEcosystem = (p: OrgProfile): OrgProfile => upTo(p, 'ecosystem');

/** La fiche telle qu'un annuaire public la montrerait. */
export const forPublic = (p: OrgProfile): OrgProfile => upTo(p, 'public');

/* ------------------------------------------------------------------ */
/* Sums and checks                                                     */
/* ------------------------------------------------------------------ */

/**
 * Les totaux déclarés, par devise et par nature.
 *
 * Par devise, parce que des dirhams et des euros ne s'additionnent pas sans un
 * taux que personne n'a choisi. Par nature, parce que le capital levé, les
 * subventions et le reste sont trois réponses à trois questions différentes.
 */
export interface FundingTotal {
  currency: string;
  equity: number;
  grant: number;
  other: number;
  total: number;
}

export function fundingTotals(fundings: readonly Funding[]): FundingTotal[] {
  const by = new Map<string, FundingTotal>();
  for (const f of fundings) {
    if (f.amount === null || !Number.isFinite(f.amount)) continue;
    const row = by.get(f.currency) ?? { currency: f.currency, equity: 0, grant: 0, other: 0, total: 0 };
    if (f.nature === 'equity') row.equity += f.amount;
    else if (f.nature === 'grant') row.grant += f.amount;
    else row.other += f.amount;
    row.total += f.amount;
    by.set(f.currency, row);
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

/**
 * Ce qui ne peut pas être vrai à la fois.
 *
 * Refusé par le serveur et dit par l'écran : plus de femmes que de
 * collaborateurs, ou plus de fondateurs que de monde, est une faute de frappe
 * qu'on veut voir avant qu'un rapport la reprenne.
 */
export function teamProblems(
  p: Pick<OrgProfile, 'teamSize' | 'womenCount' | 'foundersCount'>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.teamSize !== null && p.womenCount !== null && p.womenCount > p.teamSize) {
    out.womenCount = 'There cannot be more women than people in the team.';
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* What an application form may take from the fiche                    */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'une question d'un formulaire peut reprendre de la fiche.
 *
 * Relié dans le builder, une question à la fois : « Nom de la société » prend
 * le nom, « Secteur » le secteur, « Pitch deck » le document déjà déposé. Le
 * formulaire arrive prérempli et la startup garde la main — elle corrige pour
 * cet appel sans toucher à sa fiche. Un document repris n'est pas redéposé.
 *
 * `types` dit à quelles questions la reprise a un sens : un nombre ne remplit
 * pas une liste, un texte ne remplit pas un fichier.
 */
type AnswerType =
  | 'short_text' | 'long_text' | 'email' | 'phone' | 'url' | 'number' | 'date' | 'select' | 'multiselect' | 'file';

export interface ProfileLink {
  key: string;
  fr: string;
  en: string;
  types: readonly AnswerType[];
  /** The answer, or undefined when the fiche has nothing to give. A list of words for a choice. */
  value: (p: OrgProfile, name: string, lang: 'fr' | 'en') => unknown;
}

const nonEmpty = (v: string) => (v.trim() ? v : undefined);
const num = (v: number | null) => (v === null ? undefined : v);
const doc = (p: OrgProfile, kind: string) => {
  const d = [...p.documents].filter((x) => x.kind === kind).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
  return d ? { uploadId: d.uploadId, filename: d.filename, size: d.size } : undefined;
};
/** A choice as words in both languages, so a form option written either way matches. */
const said = (list: readonly Choice[], key: string) => {
  const c = list.find((x) => x.key === key);
  return c ? [c.fr, c.en, c.key] : key ? [key] : undefined;
};
const TEXT = ['short_text', 'long_text'] as const;

export const PROFILE_SOURCES: readonly ProfileLink[] = [
  { key: 'name', fr: 'Dénomination', en: 'Name', types: ['short_text'], value: (_p, name) => nonEmpty(name) },
  { key: 'pitch', fr: 'Description courte', en: 'Short description', types: TEXT, value: (p) => nonEmpty(p.pitch) },
  { key: 'bio', fr: 'Description de l’activité', en: 'What the business does', types: TEXT, value: (p) => nonEmpty(p.bio) },
  { key: 'offering', fr: 'Produits et services principaux', en: 'Main products and services', types: TEXT, value: (p) => nonEmpty(p.mainOffering) },
  { key: 'sector', fr: 'Secteur principal', en: 'Main sector', types: ['short_text', 'select'], value: (p) => said(SECTORS, p.sector) },
  { key: 'maturity', fr: 'Niveau de maturité', en: 'Maturity level', types: ['short_text', 'select'], value: (p) => said(MATURITY_LEVELS, p.maturity) },
  { key: 'orgType', fr: 'Type d’organisation', en: 'Type of organisation', types: ['short_text', 'select'], value: (p) => said(ORG_TYPES, p.orgType) },
  { key: 'legalForm', fr: 'Forme juridique', en: 'Legal form', types: ['short_text', 'select'], value: (p) => said(LEGAL_FORMS, p.legalForm) },
  {
    key: 'targetMarkets', fr: 'Marché cible', en: 'Target market', types: ['short_text', 'multiselect'],
    value: (p) => (p.targetMarkets.length ? p.targetMarkets.map((k) => said(TARGET_MARKETS, k)!) : undefined),
  },
  { key: 'city', fr: 'Ville du siège', en: 'Head office city', types: ['short_text', 'select'], value: (p) => nonEmpty(p.places[0]?.city ?? p.city) },
  { key: 'website', fr: 'Site web', en: 'Website', types: ['url', 'short_text'], value: (p) => nonEmpty(p.website) },
  { key: 'linkedin', fr: 'LinkedIn', en: 'LinkedIn', types: ['url', 'short_text'], value: (p) => nonEmpty(p.linkedin) },
  { key: 'email', fr: 'Email professionnel', en: 'Work email', types: ['email'], value: (p) => p.emails[0] },
  { key: 'phone', fr: 'Téléphone', en: 'Phone', types: ['phone'], value: (p) => p.phones[0] },
  { key: 'foundedOn', fr: 'Date de création', en: 'Date founded', types: ['date'], value: (p) => nonEmpty(p.foundedOn) },
  {
    key: 'foundedYear', fr: 'Année de création', en: 'Year founded', types: ['number', 'short_text'],
    value: (p) => (p.foundedOn ? Number(p.foundedOn.slice(0, 4)) : num(p.foundedYear)),
  },
  { key: 'foundersCount', fr: 'Nombre de fondateurs', en: 'Number of founders', types: ['number'], value: (p) => num(p.foundersCount) },
  { key: 'teamSize', fr: 'Effectif', en: 'Headcount', types: ['number'], value: (p) => num(p.teamSize) },
  { key: 'womenCount', fr: 'Nombre de femmes', en: 'Number of women', types: ['number'], value: (p) => num(p.womenCount) },
  { key: 'activeClients', fr: 'Clients actifs', en: 'Active clients', types: ['number'], value: (p) => num(p.activeClients) },
  { key: 'capital', fr: 'Capital social', en: 'Share capital', types: ['number'], value: (p) => num(p.capitalAmount) },
  {
    key: 'lastRevenue', fr: 'Dernier chiffre d’affaires', en: 'Latest turnover', types: ['number'],
    value: (p) => num([...p.revenues].sort((a, b) => b.year - a.year).find((r) => !r.unavailable && r.amount !== null)?.amount ?? null),
  },
  {
    key: 'equityRaised', fr: 'Total levé en capital', en: 'Total equity raised', types: ['number'],
    value: (p) => {
      const first = fundingTotals(p.fundings).find((t) => t.equity > 0);
      return first ? first.equity : undefined;
    },
  },
  { key: 'pitchDeck', fr: 'Pitch deck', en: 'Pitch deck', types: ['file'], value: (p) => doc(p, 'pitch_deck') },
  { key: 'statutes', fr: 'Statuts', en: 'Articles of association', types: ['file'], value: (p) => doc(p, 'statutes') },
  { key: 'rc', fr: 'Registre de commerce', en: 'Commercial register', types: ['file'], value: (p) => doc(p, 'rc') },
  { key: 'financials', fr: 'Dernier bilan', en: 'Latest financial statements', types: ['file'], value: (p) => doc(p, 'financials') },
  { key: 'catalogue', fr: 'Catalogue produits', en: 'Product catalogue', types: ['file'], value: (p) => doc(p, 'catalogue') },
];

/** Comparer deux mots sans tenir aux majuscules ni aux accents. */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * La réponse qu'une question reliée reçoit de la fiche — ou rien.
 *
 * Pour une liste de choix, seulement une option que le formulaire propose
 * vraiment : écrite en français ou en anglais, avec ou sans accent. Une valeur
 * qui ne correspond à aucune option ne remplit rien, plutôt qu'une réponse que
 * le formulaire ne sait pas afficher.
 */
export function prefillFor(
  field: { type: string; options: string[]; fromProfile?: string },
  p: OrgProfile,
  name: string,
  lang: 'fr' | 'en' = 'fr',
): unknown {
  const source = PROFILE_SOURCES.find((s) => s.key === field.fromProfile);
  if (!source || !(source.types as readonly string[]).includes(field.type)) return undefined;
  const raw = source.value(p, name, lang);
  if (raw === undefined || raw === null) return undefined;
  const words = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [String(v)]);
  const pick = (candidates: string[]) => field.options.find((o) => candidates.some((c) => fold(c) === fold(o)));
  if (field.type === 'select') return pick(words(raw));
  if (field.type === 'multiselect') {
    const picked = (raw as unknown[]).map((one) => pick(words(one))).filter(Boolean) as string[];
    return picked.length ? picked : undefined;
  }
  /* Une liste de mots vers un texte : le mot dans la langue du formulaire. */
  if (Array.isArray(raw)) {
    const first = (one: unknown) => (Array.isArray(one) ? String(one[lang === 'fr' ? 0 : 1] ?? one[0]) : String(one));
    return Array.isArray(raw[0]) ? raw.map(first).join(', ') : first(raw);
  }
  return raw;
}
