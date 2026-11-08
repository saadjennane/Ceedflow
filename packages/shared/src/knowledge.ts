/**
 * La Knowledge Base : le référentiel interne de CEED.
 *
 * L'IA analyse et recommande, les membres relisent, le président valide. Une
 * connaissance garde un identifiant stable ; ses versions passent chacune par
 * le circuit complet, et une seule est officielle à la fois.
 */
import { z } from 'zod';

export const KB_STATUSES = [
  'draft',
  'analysis_pending',
  'analysis_failed',
  'to_review',
  'changes_requested',
  'to_validate',
  'published',
  'rejected',
  'archived',
] as const;
export type KbStatus = (typeof KB_STATUSES)[number];

export const KB_STATUS_LABEL: Record<KbStatus, string> = {
  draft: 'Draft',
  analysis_pending: 'Analysis Pending',
  analysis_failed: 'Analysis Failed',
  to_review: 'To Review',
  changes_requested: 'Changes Requested',
  to_validate: 'To Validate',
  published: 'Published',
  rejected: 'Rejected',
  archived: 'Archived',
};

/** Les statuts d'une version encore en chemin — une seule par connaissance. */
export const KB_OPEN: readonly KbStatus[] = ['draft', 'analysis_pending', 'analysis_failed', 'to_review', 'changes_requested', 'to_validate'];

export const KB_FINDING_KINDS = ['duplicate', 'conflict', 'clarification'] as const;
export type KbFindingKind = (typeof KB_FINDING_KINDS)[number];
export const KB_FINDING_LABEL: Record<KbFindingKind, string> = {
  duplicate: 'Potential Duplicate',
  conflict: 'Potential Conflict',
  clarification: 'Needs Clarification',
};

export const KB_FINDING_STATES = ['open', 'not_a_conflict', 'resolved', 'acknowledged'] as const;
export type KbFindingState = (typeof KB_FINDING_STATES)[number];

/**
 * Ce qui bloque la publication : un conflit ou un doublon sans décision. Un
 * point à clarifier se lit et se traite, il ne bloque pas.
 */
export const kbFindingBlocks = (f: { kind: KbFindingKind; state: KbFindingState }) =>
  f.state === 'open' && (f.kind === 'conflict' || f.kind === 'duplicate');

export interface KbCategory {
  id: string;
  name: string;
  position: number;
  active: boolean;
}

export interface KbPerson {
  id: string;
  name: string;
}

export interface KbVersion {
  id: string;
  entryId: string;
  number: number;
  title: string;
  body: string;
  contentHash: string;
  changeSummary: string;
  status: KbStatus;
  author: KbPerson | null;
  revision: number;
  reviewedBy: KbPerson | null;
  reviewedAt: string | null;
  reviewedHash: string | null;
  reviewComment: string;
  validatedBy: KbPerson | null;
  validatedAt: string | null;
  decision: 'approved' | 'changes_requested' | 'rejected' | null;
  decisionNote: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbAnalysis {
  id: string;
  versionId: string;
  contentHash: string;
  provider: string;
  model: string;
  status: 'pending' | 'done' | 'failed';
  summary: string;
  error: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface KbFinding {
  id: string;
  versionId: string;
  source: 'ai' | 'member';
  kind: KbFindingKind;
  confidence: number;
  excerpt: string;
  otherExcerpt: string;
  explanation: string;
  recommendation: string;
  state: KbFindingState;
  justification: string;
  decidedBy: KbPerson | null;
  decidedAt: string | null;
  /** La connaissance à laquelle elle est comparée, et la version exacte. */
  other: { entryId: string; versionId: string; number: number; title: string; status: KbStatus } | null;
  createdAt: string;
}

export interface KbComment {
  id: string;
  versionId: string;
  author: KbPerson | null;
  body: string;
  createdAt: string;
}

export interface KbEvent {
  id: string;
  entryId: string;
  entryTitle: string;
  versionId: string | null;
  versionNumber: number | null;
  action: string;
  actor: KbPerson | null;
  note: string;
  createdAt: string;
}

/** Une ligne des listes : la connaissance, sa version officielle et celle en chemin. */
export interface KbListItem {
  entryId: string;
  category: KbCategory | null;
  official: Pick<KbVersion, 'id' | 'number' | 'title' | 'publishedAt' | 'author'> | null;
  open: Pick<KbVersion, 'id' | 'number' | 'title' | 'status' | 'author' | 'createdAt' | 'updatedAt'> | null;
  /** Le dernier état connu, pour l'historique : rejetée, par exemple. */
  latest: Pick<KbVersion, 'id' | 'number' | 'title' | 'status'>;
  /** Constats ouverts qui bloquent sa version en chemin. */
  blocking: number;
  excerpt: string;
}

export interface KbOverview {
  counts: { published: number; toReview: number; toValidate: number; conflicts: number };
  items: KbListItem[];
  categories: KbCategory[];
  me: KbRights;
}

export interface KbRights {
  recordId: string;
  canWrite: boolean;
  isPresident: boolean;
  isAdmin: boolean;
  presidentName: string;
}

export interface KbEntryDetail {
  entryId: string;
  category: KbCategory | null;
  officialVersionId: string | null;
  versions: KbVersion[];
  /** Par version : sa dernière analyse, et ses constats sur son texte actuel. */
  analyses: Record<string, KbAnalysis | null>;
  findings: Record<string, KbFinding[]>;
  comments: Record<string, KbComment[]>;
  activity: KbEvent[];
  me: KbRights;
}

export interface KbSettings {
  president: { recordId: string; name: string; email: string } | null;
  provider: '' | 'anthropic' | 'openai';
  model: string;
  /** Les clés se lisent côté serveur seulement : on dit si elles sont là, jamais ce qu'elles valent. */
  keys: { anthropic: boolean; openai: boolean };
}

/** Les modèles proposés, le recommandé en tête. « Other model… » reste possible pour un nom plus récent. */
export const KB_MODELS: Record<'anthropic' | 'openai', { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol — recommended: strong reasoning, moderate cost' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra — the most capable, five times the price' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna — the cheapest, for high volumes' },
  ],
  anthropic: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — recommended: strong reasoning, moderate cost' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — the most capable, higher price' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — the cheapest, for high volumes' },
  ],
};

export const KB_DEFAULT_MODEL: Record<'anthropic' | 'openai', string> = {
  anthropic: KB_MODELS.anthropic[0]!.id,
  openai: KB_MODELS.openai[0]!.id,
};

/* ---------------------------------------------------------------- */
/* Inputs                                                            */
/* ---------------------------------------------------------------- */

const title = z.string().trim().min(1, 'Give it a title.').max(200, 'Two hundred characters at most.');
const body = z.string().max(100_000, 'A hundred thousand characters at most.');

export const kbCreateInput = z.object({
  categoryId: z.string().min(1, 'Pick a category.'),
  title,
  body,
});

export const kbUpdateInput = z.object({
  title,
  body,
  changeSummary: z.string().trim().max(1000).default(''),
});

export const kbEditInput = z.object({
  title,
  body,
  changeSummary: z.string().trim().max(1000).default(''),
  categoryId: z.string().optional(),
  /** La révision lue : une autre arrivée entre-temps refuse l'enregistrement. */
  revision: z.number().int().min(1),
});

export const kbReviewInput = z.object({
  action: z.enum(['reviewed', 'changes']),
  comment: z.string().trim().max(5000).default(''),
  /** Le texte exact relu. */
  contentHash: z.string().min(1),
});

export const kbValidateInput = z.object({
  action: z.enum(['approve', 'changes', 'reject']),
  note: z.string().trim().max(5000).default(''),
  contentHash: z.string().min(1),
});

export const kbCommentInput = z.object({ body: z.string().trim().min(1, 'Write something.').max(5000) });

export const kbFlagInput = z.object({
  kind: z.enum(KB_FINDING_KINDS),
  otherEntryId: z.string().optional(),
  excerpt: z.string().trim().max(2000).default(''),
  explanation: z.string().trim().min(1, 'Say what is wrong.').max(5000),
});

export const kbDecideInput = z.object({
  state: z.enum(['not_a_conflict', 'resolved', 'acknowledged']),
  justification: z.string().trim().min(1, 'Say why — the decision is kept with the versions it concerns.').max(5000),
});

export const kbSettingsInput = z.object({
  presidentEmail: z.string().trim().toLowerCase().default(''),
  provider: z.enum(['', 'anthropic', 'openai']).default(''),
  model: z.string().trim().max(100).default(''),
});

export const kbCategoryInput = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(80),
  position: z.number().int().optional(),
  active: z.boolean().optional(),
});

/* ---------------------------------------------------------------- */
/* Comparing two versions                                            */
/* ---------------------------------------------------------------- */

export type DiffLine = { op: 'same' | 'add' | 'del'; text: string };

/** Les lignes ajoutées, retirées et gardées entre deux textes — une comparaison simple, ligne à ligne. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  /* Au-delà, la table serait trop grande : on montre l'avant et l'après en bloc. */
  if (a.length * b.length > 4_000_000) {
    return [...a.map((text) => ({ op: 'del' as const, text })), ...b.map((text) => ({ op: 'add' as const, text }))];
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: 'del', text: a[i++]! });
    else out.push({ op: 'add', text: b[j++]! });
  }
  while (i < a.length) out.push({ op: 'del', text: a[i++]! });
  while (j < b.length) out.push({ op: 'add', text: b[j++]! });
  return out;
}
