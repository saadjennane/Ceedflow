/**
 * Funding Intelligence : un appel d'offres devient une analyse exploitable —
 * qui finance, qui commande, quelles opportunités pour CEED, et avec quel
 * degré de certitude. Ce que dit le document, ce que dit le web et ce que
 * l'IA déduit restent toujours séparés.
 */
import { z } from 'zod';
import { TASK_PRIORITIES, type TaskPriority } from './tasks.js';

/** Un fait tiré du document : sa valeur, sa page, et l'extrait qui le justifie. Null : absent du document. */
export interface SourcedValue {
  value: string | null;
  page: number | null;
  excerpt: string;
}

export const OVERVIEW_FIELDS = [
  ['title', 'Title'],
  ['reference', 'Reference'],
  ['contractingAuthority', 'Contracting authority'],
  ['funder', 'Funder'],
  ['serviceType', 'Type of service'],
  ['country', 'Country'],
  ['publishedOn', 'Published'],
  ['deadline', 'Submission deadline'],
  ['duration', 'Duration'],
  ['budget', 'Budget'],
  ['status', 'Status'],
] as const;
export type OverviewKey = (typeof OVERVIEW_FIELDS)[number][0];

/** Ce qu'on affiche quand le document ne dit rien — jamais une valeur inventée. */
export const OVERVIEW_MISSING: Partial<Record<OverviewKey, string>> = {
  budget: 'Non communiqué',
  deadline: 'Non précisée',
  status: 'Statut non vérifié',
  publishedOn: 'Non précisée',
  duration: 'Non précisée',
};

export const FUNDING_ORG_ROLES = ['funder', 'funding_facility', 'contracting_authority', 'implementing_partner', 'institutional_partner'] as const;
export type FundingOrgRole = (typeof FUNDING_ORG_ROLES)[number];
export const FUNDING_ORG_ROLE_LABEL: Record<FundingOrgRole, string> = {
  funder: 'Funder',
  funding_facility: 'Funding Facility',
  contracting_authority: 'Contracting Authority',
  implementing_partner: 'Implementing Partner',
  institutional_partner: 'Institutional Partner',
};

export interface FundingOrganization {
  name: string;
  acronym: string;
  roles: FundingOrgRole[];
  /** En quelques mots : « Banque multilatérale de développement ». */
  kind: string;
  description: string;
  themes: string[];
  relations: string;
  /** L'organisme dont il fait partie : l'ADFI est une facilité de la BAD, pas un bailleur indépendant. */
  parent: string | null;
  page: number | null;
  excerpt: string;
  /** La fiche de l'annuaire, quand une seule porte ce nom. Jamais créée sans un clic. */
  recordId: string | null;
  recordName: string;
}

export const OPPORTUNITY_TYPES = ['identified_tender', 'future_opportunity', 'strategic_prospecting', 'project_concept'] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  identified_tender: 'Identified Tender',
  future_opportunity: 'Future Opportunity',
  strategic_prospecting: 'Strategic Prospecting',
  project_concept: 'Project Concept',
};

export const VERIFICATION_STATUSES = ['document_confirmed', 'externally_verified', 'inferred', 'unverified'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  document_confirmed: 'Document Confirmed',
  externally_verified: 'Externally Verified',
  inferred: 'Inferred',
  unverified: 'Unverified',
};

export const RELEVANCE = ['high', 'medium', 'low'] as const;
export type Relevance = (typeof RELEVANCE)[number];
export const RELEVANCE_LABEL: Record<Relevance, string> = { high: 'High Relevance', medium: 'Medium Relevance', low: 'Low Relevance' };

export interface FundingOpportunity {
  key: string;
  type: OpportunityType;
  title: string;
  /** L'organisme concerné, ou le bailleur potentiel. */
  organization: string;
  /** La nature de l'intervention, en quelques mots : « Prestation de conseil », « Partenariat opérationnel », « Projet à proposer ». */
  nature: string;
  /** Le financement en une phrase : « Marché financé par l'ADFI, montant non communiqué. » */
  fundingNote: string;
  summary: string;
  amount: string | null;
  deadline: string | null;
  period: string | null;
  eligibility: string | null;
  targetAudience: string | null;
  activities: string[];
  interestForCeed: string;
  vigilance: string[];
  nextAction: string;
  /** Pourquoi l'IA la propose : ce qu'elle a lu, et ce qu'elle en déduit. */
  rationale: string;
  /** La vérification élément par élément, jamais un statut global trompeur. */
  verification: { claim: string; status: VerificationStatus }[];
  relevance: Relevance;
  relevanceReason: string;
  eligibilityToVerify: boolean;
  sources: { page: number | null; excerpt: string }[];
}

export interface FundingAction {
  id: string;
  position: number;
  title: string;
  description: string;
  priority: TaskPriority;
  opportunityKey: string | null;
  rationale: string;
  assigneeId: string | null;
  status: 'proposed' | 'creating' | 'created' | 'dismissed' | 'failed';
  task: { id: string; title: string } | null;
  error: string;
}

export interface FundingResult {
  overview: Record<OverviewKey, SourcedValue>;
  summary: string;
  organizations: FundingOrganization[];
  opportunities: FundingOpportunity[];
  /** Les points de vigilance de l'appel lui-même. */
  warnings: string[];
  /** Le point le plus intéressant du document, et les recommandations à faire remonter en priorité. */
  insight: { headline: string; priorities: string[] };
  /** Les connaissances publiées de la Knowledge Base qui ont servi à situer CEED. */
  ceedContext: { entryId: string; title: string }[];
}

export interface WebSource {
  url: string;
  title: string;
  publishedAt: string | null;
  consultedAt: string;
}

export interface FundingWeb {
  status: 'none' | 'pending' | 'done' | 'failed';
  error: string;
  ranAt: string | null;
  findings: { organization: string; topic: string; text: string; urls: string[] }[];
  sources: WebSource[];
}

export interface FundingAnalysis {
  id: string;
  title: string;
  sourceKind: 'pdf' | 'text';
  uploadId: string | null;
  filename: string;
  pages: number;
  truncated: boolean;
  status: 'pending' | 'done' | 'failed';
  error: string;
  result: FundingResult | null;
  web: FundingWeb;
  actions: FundingAction[];
  /** Les opportunités déjà enregistrées depuis cette analyse, par clé. */
  saved: Record<string, string>;
  /** Pour chaque opportunité, une opportunité enregistrée qui lui ressemble. */
  duplicates: Record<string, { id: string; title: string }>;
  createdByName: string;
  createdAt: string;
  analysedAt: string | null;
  provider: string;
  model: string;
}

export interface FundingAnalysisRow {
  id: string;
  title: string;
  status: 'pending' | 'done' | 'failed';
  createdByName: string;
  createdAt: string;
  opportunities: number;
  organizations: number;
}

/** Le suivi d'une opportunité, en étapes simples — pas un CRM. */
export const OPPORTUNITY_STAGES = ['identified', 'exploring', 'preparing', 'submitted', 'won', 'lost', 'dropped'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export const OPPORTUNITY_STAGE_LABEL: Record<OpportunityStage, string> = {
  identified: 'Identified',
  exploring: 'Exploring',
  preparing: 'Preparing',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
  dropped: 'Dropped',
};
export const OPEN_STAGES: readonly OpportunityStage[] = ['identified', 'exploring', 'preparing', 'submitted'];

export interface SavedOpportunity {
  id: string;
  stage: OpportunityStage;
  stageChangedAt: string;
  recordName: string;
  /** Les étapes par lesquelles elle est passée, datées. */
  history: { stage: OpportunityStage; byName: string; at: string }[];
  analysisId: string | null;
  analysisTitle: string;
  type: OpportunityType;
  title: string;
  organization: string;
  recordId: string | null;
  relevance: Relevance;
  summary: string;
  verification: { claim: string; status: VerificationStatus }[];
  createdByName: string;
  createdAt: string;
}

export const fundingTextInput = z.object({
  title: z.string().trim().max(200).default(''),
  text: z.string().trim().min(200, 'Paste the call for tenders — at least a few paragraphs.').max(400_000),
});

export const fundingActionPatch = z.object({
  title: z.string().trim().max(300).optional(),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(['proposed', 'dismissed']).optional(),
});

export const fundingCreateTasksInput = z.object({
  ids: z.array(z.string()).min(1, 'Select at least one action.').max(100),
  tell: z.boolean().default(false),
});

export const fundingSaveInput = z.object({
  opportunities: z
    .array(z.object({ key: z.string(), title: z.string().trim().min(1).max(300), summary: z.string().max(5000) }))
    .min(1, 'Select at least one opportunity.'),
});

/** Un bailleur suivi : une organisation de l'annuaire avec le rôle « Funder ». */
/** Le statut court d'une opportunité, tel qu'il se lit d'un coup d'œil. */
export const OPPORTUNITY_STATUS_WORD: Record<OpportunityType, string> = {
  identified_tender: 'To verify',
  future_opportunity: 'Future opportunity',
  strategic_prospecting: 'Prospecting',
  project_concept: 'Prospecting',
};

/** Un bailleur vu dans les analyses mais pas encore suivi. */
export interface DetectedFunder {
  name: string;
  acronym: string;
  recordId: string | null;
  parent: string | null;
  roles: string[];
  themes: string[];
  analyses: { id: string; title: string }[];
}

/** Une opportunité détectée dans une analyse, pas encore enregistrée. */
export interface DetectedOpportunity {
  analysisId: string;
  analysisTitle: string;
  analysedAt: string | null;
  opportunity: FundingOpportunity;
}

export interface FunderRow {
  id: string;
  name: string;
  themes: string[];
  kind: string;
  opportunities: number;
  openOpportunities: number;
  analyses: number;
  openTasks: number;
  lastActivity: string | null;
}

export interface FunderView {
  id: string;
  name: string;
  website: string;
  kind: string;
  description: string;
  themes: string[];
  opportunities: SavedOpportunity[];
  analyses: { id: string; title: string; createdAt: string; roles: string[] }[];
  /** Ce que les recherches web ont trouvé sur lui, avec leurs pages. */
  web: { analysisId: string; topic: string; text: string; urls: string[]; ranAt: string | null }[];
}

export const opportunityPatch = z.object({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  recordId: z.string().nullable().optional(),
});

export const trackFunderInput = z.union([
  z.object({ recordId: z.string().min(1) }),
  z.object({ name: z.string().trim().min(1, 'Give its name.').max(300) }),
]);
