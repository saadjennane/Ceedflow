import { z } from 'zod';

/**
 * One internal directory, two natures. Organisations and people are the same
 * kind of row — the two sidebar entries are a filter, and an affiliation joins
 * one to the other.
 */
export const RECORD_KINDS = ['org', 'person'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/**
 * Roles are statuses for now: labels a record carries, nothing more. Field sets
 * per role come later — the model leaves room, the screens do not ask for it.
 */
export const ORG_ROLES = ['Startup', 'Corporate', 'Investor', 'Institution', 'Partner'] as const;
export const PERSON_ROLES = ['Mentor', 'Investor', 'Jury', 'CEED team'] as const;

export const rolesFor = (kind: RecordKind): readonly string[] => (kind === 'org' ? ORG_ROLES : PERSON_ROLES);

/**
 * How the row got here — the only provenance the first version keeps. Claiming a
 * page needs an invitation to travel and a session to come back on; neither
 * exists yet, so a state machine for it would have been decoration.
 */
export const RECORD_ORIGINS = ['import', 'manual', 'signup'] as const;
export type RecordOrigin = (typeof RECORD_ORIGINS)[number];

export const ORIGIN_LABEL: Record<RecordOrigin, string> = {
  import: 'Imported from a file',
  manual: 'Added by the team',
  signup: 'Registered themselves',
};

export const recordSchema = z.object({
  id: z.string(),
  kind: z.enum(RECORD_KINDS),
  name: z.string().min(1),
  roles: z.array(z.string()).default([]),
  origin: z.enum(RECORD_ORIGINS).default('manual'),
  email: z.string().default(''),
  phone: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default(''),
  website: z.string().default(''),
  bio: z.string().default(''),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export type DirectoryRecord = z.infer<typeof recordSchema>;

/**
 * A person belongs to zero or several organisations; an organisation is held by
 * one or several people. The second half is a completeness rule rather than a
 * constraint — the two rows cannot be written in one statement, and a list of
 * company names with no contacts is a legitimate starting point — but an
 * organisation nobody is attached to can be reached by nobody either.
 */
export const affiliationSchema = z.object({
  id: z.string(),
  personId: z.string(),
  orgId: z.string(),
  role: z.string().default(''),
  since: z.string().default(''),
});

export type Affiliation = z.infer<typeof affiliationSchema>;

/** An affiliation seen from one side, carrying the other side's identity. */
export interface AffiliationView {
  affiliation: Affiliation;
  record: DirectoryRecord;
}

/** A person named from elsewhere in the model: the link, and what to display. */
export interface PersonRef {
  id: string;
  name: string;
}

export interface RecordDetail {
  record: DirectoryRecord;
  /** Organisations for a person, people for an organisation. */
  links: AffiliationView[];
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export const createRecordInput = z.object({
  kind: z.enum(RECORD_KINDS),
  name: z.string().min(1, 'A name is required.'),
  roles: z.array(z.string()).default([]),
  email: z.string().default(''),
  phone: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default('Morocco'),
  website: z.string().default(''),
  bio: z.string().default(''),
  tags: z.array(z.string()).default([]),
  origin: z.enum(RECORD_ORIGINS).default('manual'),
  /** Attach to an organisation on creation — how a contact arrives with its org. */
  affiliateTo: z.string().nullable().default(null),
  affiliationRole: z.string().default(''),
});

export const updateRecordInput = createRecordInput
  .omit({ kind: true, affiliateTo: true, affiliationRole: true, origin: true })
  .partial();

export const affiliationInput = z.object({
  personId: z.string(),
  orgId: z.string(),
  role: z.string().default(''),
  since: z.string().default(''),
});

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

/**
 * The columns an import can fill. The file's own headers are mapped onto these
 * by the person importing, so no particular spreadsheet layout is imposed.
 */
export const IMPORT_COLUMNS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'website', label: 'Website' },
  { key: 'bio', label: 'Description' },
  { key: 'roles', label: 'Roles' },
  { key: 'tags', label: 'Tags' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'contactRole', label: 'Contact role' },
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]['key'];

export const importInput = z.object({
  kind: z.enum(RECORD_KINDS),
  /** Rows already mapped onto the columns above. */
  rows: z.array(z.record(z.string())).max(2000),
  /** True to report what would happen without writing anything. */
  dryRun: z.boolean().default(false),
});

export interface ImportOutcome {
  row: number;
  name: string;
  /** created: a new record. merged: an existing record was completed. */
  action: 'created' | 'merged' | 'skipped';
  reason: string;
  contact: string | null;
}

export interface ImportReport {
  created: number;
  merged: number;
  skipped: number;
  contacts: number;
  outcomes: ImportOutcome[];
}

/** Two records are the same when the name matches once punctuation is set aside. */
export const matchKey = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

/** Splits "Mentor, Investor" or "Mentor; Investor" into roles the model knows. */
export function parseRoles(raw: string, kind: RecordKind): string[] {
  const known = rolesFor(kind);
  return raw
    .split(/[,;/|]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => known.find((r) => r.toLowerCase() === x.toLowerCase()) ?? null)
    .filter((x): x is string => x !== null);
}

/* ------------------------------------------------------------------ */
/* Public signup                                                       */
/* ------------------------------------------------------------------ */

/**
 * Registering yourself. The person always exists — they are who fills this in —
 * and the organisation only when they name one, because a mentor arrives without
 * a startup behind them.
 */
export const signupInput = z.object({
  contactName: z.string().min(1, 'Tell us who you are.'),
  contactEmail: z.string().email('Enter a valid email address.'),
  contactRole: z.string().default(''),
  contactCity: z.string().default(''),
  contactBio: z.string().default(''),
  /** Empty when the person is registering on their own. */
  name: z.string().default(''),
  email: z.string().default(''),
  website: z.string().default(''),
  city: z.string().default(''),
  bio: z.string().default(''),
});
