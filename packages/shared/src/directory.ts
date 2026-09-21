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
export const RECORD_ORIGINS = ['import', 'manual', 'signup', 'team'] as const;
export type RecordOrigin = (typeof RECORD_ORIGINS)[number];

export const ORIGIN_LABEL: Record<RecordOrigin, string> = {
  import: 'Imported from a file',
  manual: 'Added by the team',
  signup: 'Registered themselves',
  team: 'Added by their organisation',
};

/**
 * Who belongs in the people column, and who is only a name on a page.
 *
 * A record CEED put there is a relationship CEED chose to have, so it shows from
 * the moment it exists. Somebody a founder typed onto their own team page is
 * content — the jury reads it — and becomes a person CEED knows only once they
 * come through the door themselves.
 *
 * Filtering a list, never a search: what is hidden here is still findable by
 * name, and still shown on the organisation it belongs to.
 */
export function listedInDirectory(
  record: Pick<DirectoryRecord, 'kind' | 'origin'>,
  account: Pick<RecordAccount, 'state'> | null,
): boolean {
  if (record.kind === 'org') return true;
  if (record.origin !== 'team') return true;
  return account?.state === 'claimed';
}

export const recordSchema = z.object({
  id: z.string(),
  kind: z.enum(RECORD_KINDS),
  /** The display form. For a person it follows from the two fields below. */
  name: z.string().min(1),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
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
/**
 * What somebody may do on an organisation's page. A ladder rather than a set of
 * independent switches: three rungs are explainable to a founder in one line
 * each, and a fourth can be inserted later without invalidating a single row —
 * whereas removing one would force every affiliation to be decided again.
 *
 * The rung that matters is the last one. Editing a page is reversible; applying
 * commits the company to a programme and carries its declared figures, so it
 * stays with whoever holds the organisation. The team drafts, the founder signs.
 */
export const ORG_ACCESS = ['member', 'editor', 'admin'] as const;
export type OrgAccess = (typeof ORG_ACCESS)[number];

export const ORG_ACCESS_LABEL: Record<OrgAccess, string> = {
  member: 'Member',
  editor: 'Editor',
  admin: 'Administrator',
};

export const ORG_ACCESS_HINT: Record<OrgAccess, string> = {
  member: 'Appears on the page. Changes nothing.',
  editor: 'Edits the page and drafts applications.',
  admin: 'Everything, including applying and managing the team.',
};

export const canEditOrg = (access: OrgAccess) => access === 'editor' || access === 'admin';
export const canApplyFor = (access: OrgAccess) => access === 'admin';
export const canManageTeam = (access: OrgAccess) => access === 'admin';

export const affiliationSchema = z.object({
  id: z.string(),
  personId: z.string(),
  orgId: z.string(),
  /** The title, which the jury reads. Never a permission. */
  role: z.string().default(''),
  /** The permission, which nobody reads off the title. */
  access: z.enum(ORG_ACCESS).default('member'),
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

/**
 * What goes with somebody when they are taken out of the directory. Removing a
 * person means different things depending on what they were: a founder takes
 * the application they filed with them, while a juror is only lifted off the
 * sittings they sat on — the sitting itself, and the marks they already gave,
 * stay where they are.
 *
 * Read before the act rather than described after it, so the confirmation names
 * what will actually happen instead of a general warning.
 */
export interface RemovalPlan {
  name: string;
  kind: RecordKind;
  /** Deleted with the record: an account belongs to one person. */
  account: { email: string; state: AccountState } | null;
  /** Applications this person filed. They go. */
  candidacies: { id: string; orgName: string }[];
  /** Organisations nobody else holds. They go too. */
  organisations: { id: string; name: string }[];
  /** Sittings they are lifted off. The sitting stays. */
  panels: { id: string; name: string }[];
  /** Evaluations they are taken off the reviewer list of. */
  evaluations: { id: string; name: string }[];
  /** Marks already filed, which stay under the name they were filed with. */
  scoresKept: number;
  /** Anything that refuses outright. Empty means the removal can go ahead. */
  blocked: string[];
}

export interface RecordDetail {
  record: DirectoryRecord;
  /** Organisations for a person, people for an organisation. */
  links: AffiliationView[];
  /** Null when this person has no way in yet — and always null for an organisation. */
  account: RecordAccount | null;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export const createRecordInput = z.object({
  kind: z.enum(RECORD_KINDS),
  name: z.string().default(''),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
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
  /**
   * What that affiliation lets them do. A founder created alongside their
   * candidacy runs the organisation's page, so the caller has to be able to say
   * so — the column's default is the safe one, not the right one here.
   */
  affiliationAccess: z.enum(ORG_ACCESS).default('member'),
});

export const updateRecordInput = createRecordInput
  .omit({ kind: true, affiliateTo: true, affiliationRole: true, affiliationAccess: true, origin: true })
  .partial();

export const affiliationInput = z.object({
  personId: z.string(),
  orgId: z.string(),
  role: z.string().default(''),
  access: z.enum(ORG_ACCESS).default('member'),
  since: z.string().default(''),
});

/* ------------------------------------------------------------------ */
/* A team, as its own organisation manages it                          */
/* ------------------------------------------------------------------ */

/**
 * Adding somebody to the page and giving them a way in are two acts, and the
 * first does not imply the second: a founder composes the team the jury reads,
 * then decides separately who gets a door. So no password is asked for here —
 * this only writes a name onto a page.
 */
export const teamMemberInput = z.object({
  name: z.string().min(1, 'Who are you adding?'),
  email: z.string().email('Enter a valid email address.').or(z.literal('')).default(''),
  phone: z.string().default(''),
  /** Their title on the page. */
  role: z.string().default(''),
  access: z.enum(ORG_ACCESS).default('member'),
});

export const teamMemberPatch = teamMemberInput.pick({ role: true, access: true }).partial();

/** One row of an organisation's team, as its administrator sees it. */
export interface TeamMember {
  affiliationId: string;
  person: DirectoryRecord;
  role: string;
  access: OrgAccess;
  /** Null while nobody has opened a way in for them. */
  account: RecordAccount | null;
}

/** Handed back once, when an administrator opens a way in for a teammate. */
export interface TeamInvite {
  email: string;
  password: string;
}

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


/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/** A person's display name follows from the two fields they fill in. */
export const fullName = (firstName: string, lastName: string) =>
  [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

export const signupAccountInput = z.object({
  firstName: z.string().min(1, 'Tell us your first name.'),
  lastName: z.string().min(1, 'Tell us your last name.'),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'At least 8 characters.'),
});

export const loginInput = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

/**
 * Replacing a password. The current one is asked for even when it was
 * provisional: possession of the session is not on its own a licence to lock
 * somebody else out of their account.
 */
export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, 'Enter the password you signed in with.'),
    newPassword: z.string().min(8, 'At least 8 characters.'),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the one you were given.',
  });

/** What a member may change on their own record. */
export const profileInput = z.object({
  firstName: z.string().min(1, 'A first name is required.'),
  lastName: z.string().min(1, 'A last name is required.'),
  phone: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default(''),
  bio: z.string().default(''),
});

/** An organisation page created from the member space. */
export const myOrgInput = z.object({
  name: z.string().min(1, 'Tell us the name of the organisation.'),
  roles: z.array(z.string()).default(['Startup']),
  email: z.string().default(''),
  phone: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default('Morocco'),
  website: z.string().default(''),
  bio: z.string().default(''),
  /** What the member does there. */
  myRole: z.string().default('Founder'),
});

/**
 * Words rather than characters: a provisional password is spoken on the phone or
 * pasted into a message, and read back by somebody who is not looking at a
 * keyboard. It only has to hold until its owner replaces it, which is the first
 * thing they do. Lives here because both sides hand one over — CEED from a
 * record, a founder from their team page.
 */
const PASSWORD_WORDS = [
  'atlas', 'argan', 'safran', 'ambre', 'cedre', 'menthe', 'dune',
  'zellige', 'oasis', 'corail', 'sable', 'olive',
];

export function suggestPassword(): string {
  const pick = () => PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  return `${pick()}-${pick()}-${1000 + Math.floor(Math.random() * 9000)}`;
}

/* ------------------------------------------------------------------ */
/* The CEED workspace                                                  */
/* ------------------------------------------------------------------ */

/**
 * What somebody at CEED may do in the workspace. Held by the account, not by
 * the record: `CEED team` on a directory row says who a person is, and saying
 * so has never been a permission.
 *
 * Read-only is a rung rather than an afterthought. A board member, a partner
 * funding the cohort, somebody in their first week — the safe answer is to let
 * them look, and widen afterwards.
 */
export const STAFF_ROLES = ['admin', 'editor', 'observer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  observer: 'Observer',
};

export const STAFF_ROLE_HINT: Record<StaffRole, string> = {
  admin: 'Everything, including the CEED team, accounts and the trash.',
  editor: 'The daily work: records, candidacies, outcomes, the builder.',
  observer: 'Reads the workspace. Changes nothing.',
};

/** Whether this staff role may change anything at all. */
export const canWriteWorkspace = (role: StaffRole) => role !== 'observer';
/** Whether it may do what only CEED's own administrators do. */
export const isWorkspaceAdmin = (role: StaffRole) => role === 'admin';

/**
 * Somebody on the CEED team, as the workspace settings show them. The account
 * state is the same three it is everywhere else: putting a colleague on the
 * team and telling them about it are two acts, here as on an organisation page.
 */
export interface StaffMember {
  accountId: string;
  person: DirectoryRecord;
  email: string;
  role: StaffRole;
  state: AccountState;
  invitedAt: string | null;
  createdAt: string;
}

export const staffMemberInput = z.object({
  name: z.string().min(1, 'Who are you adding?'),
  email: z.string().email('Enter a valid email address.'),
  role: z.enum(STAFF_ROLES).default('editor'),
});

export const staffRolePatch = z.object({ role: z.enum(STAFF_ROLES) });

export interface Account {
  id: string;
  email: string;
  /** Null for everybody who is not CEED — every founder, every teammate. */
  staffRole?: StaffRole | null;
  /**
   * True while the password was chosen by CEED rather than by its owner. The
   * session it opens may do one thing: replace it.
   */
  mustChangePassword: boolean;
  /** When the invitation went out. Null while nobody has been told. */
  invitedAt?: string | null;
}

/**
 * Where an account stands, from CEED's side. Three states, and none of them is
 * stored: they follow from whether the invitation went out and whether the
 * password is still the one CEED chose.
 *
 * - `unclaimed` the account exists and nobody has been told about it.
 * - `invited`   the invitation went out; its owner has not come yet.
 * - `claimed`   its owner chose their own password. It is theirs.
 */
export const ACCOUNT_STATES = ['unclaimed', 'invited', 'claimed'] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export const ACCOUNT_STATE_LABEL: Record<AccountState, string> = {
  unclaimed: 'Not invited',
  invited: 'Invited',
  claimed: 'Claimed',
};

export const ACCOUNT_STATE_TONE: Record<AccountState, 'neutral' | 'info' | 'ok'> = {
  unclaimed: 'neutral',
  invited: 'info',
  claimed: 'ok',
};

export function accountStateOf(account: Pick<Account, 'mustChangePassword' | 'invitedAt'>): AccountState {
  if (!account.mustChangePassword) return 'claimed';
  return account.invitedAt ? 'invited' : 'unclaimed';
}

/** An account as the team sees it on a directory record. */
export interface RecordAccount {
  id: string;
  email: string;
  state: AccountState;
  invitedAt: string | null;
  createdAt: string;
}

export interface Me {
  account: Account;
  record: DirectoryRecord;
  organisations: AffiliationView[];
}
