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
});

/* ------------------------------------------------------------------ */
/* The conditions                                                      */
/* ------------------------------------------------------------------ */

const rank = (maturity: string) => MATURITY_LEVELS.findIndex((m) => m.key === maturity);

/** Registered: the legal half of the identity applies. */
export const isRegistered = (p: Pick<OrgProfile, 'legalStatus'>) => p.legalStatus === 'registered';

/** Selling already: turnover, clients and contracts are worth asking. */
export const sells = (p: Pick<OrgProfile, 'maturity'>) => rank(p.maturity) >= rank('commercialisation');

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
export const PROFILE_SECTIONS = ['identity', 'activity', 'team', 'maturity'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

interface Ask {
  section: ProfileSection;
  /** 1: the first profile; 2: the enriched one. What is asked first is level 1. */
  level: 1 | 2;
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
  team: { section: 'team', level: 2, filled: (p) => number(p.teamSize) },
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
} satisfies Record<string, Ask>;

export type ProfileAsk = keyof typeof ASKS;
export const PROFILE_ASKS = Object.keys(ASKS) as ProfileAsk[];

const ask = (key: ProfileAsk): Ask => ASKS[key];

/** What applies to this company — the only asks it can be asked, or counted on. */
export const profileAsks = (p: OrgProfile, section?: ProfileSection): ProfileAsk[] =>
  PROFILE_ASKS.filter((k) => (!section || ask(k).section === section) && (ask(k).applies?.(p) ?? true));

export const askSection = (key: ProfileAsk): ProfileSection => ask(key).section;
export const askLevel = (key: ProfileAsk): 1 | 2 => ask(key).level;
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
export const profileStarted = (p: OrgProfile): boolean => PROFILE_ASKS.some((k) => askFilled(p, k));

/* ------------------------------------------------------------------ */
/* Who reads what                                                      */
/* ------------------------------------------------------------------ */

/**
 * La fiche telle que l'écosystème la lit — un juré, un mentor.
 *
 * Their work is the company, not reaching it: the addresses, the numbers and
 * the street of the head office stay with the organisation and with CEED.
 * Done on the server, before the answer leaves it — a field the screen merely
 * hides is a field anybody can read in the network tab.
 */
export const forEcosystem = (p: OrgProfile): OrgProfile => ({
  ...p,
  emails: [],
  phones: [],
  places: p.places.map(({ city, country }) => ({ city, country })),
});
