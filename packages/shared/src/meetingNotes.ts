/**
 * L'assistant de réunion : un compte rendu collé, des tâches proposées par
 * l'IA, vérifiées et créées par quelqu'un de l'équipe. Les tâches créées sont
 * des tâches comme les autres, dans le module Tasks.
 */
import { z } from 'zod';
import { TASK_PRIORITIES, type TaskPriority, type TaskState } from './tasks.js';

export const SUGGESTION_STATUSES = ['proposed', 'dismissed', 'creating', 'created', 'failed'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface MeetingMember {
  id: string;
  name: string;
}

export interface MeetingSuggestion {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingOn: string;
  /** Une réunion analysée, ou le groupe des tâches écrites à la main. */
  meetingKind: 'meeting' | 'manual';
  position: number;
  source: 'ai' | 'manual';
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string;
  /** Le nom tel que le compte rendu l'écrit. */
  assigneeSaid: string;
  /** Pourquoi personne n'est proposé : introuvable, ou plusieurs du même nom. */
  assigneeNote: string;
  dueOn: string | null;
  dueNote: string;
  /** Le programme de la tâche, quand le compte rendu le dit clairement. */
  editionId: string | null;
  editionName: string;
  /** Ce à quoi la tâche se rapporte — une seule attache, comme une tâche donnée à la main. */
  link: { kind: 'person' | 'org' | 'edition' | 'candidate'; id: string; name: string } | null;
  /** Le sujet tel que le compte rendu l'écrit, quand il n'a pas été trouvé dans l'annuaire. */
  aboutSaid: string;
  priority: TaskPriority;
  sourceExcerpt: string;
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
  reviewReason: string;
  duplicate: { id: string; title: string; ownerName: string; state: TaskState; dueOn: string | null } | null;
  status: SuggestionStatus;
  task: { id: string; title: string; state: TaskState } | null;
  error: string;
}

export interface MeetingView {
  id: string;
  title: string;
  meetingOn: string;
  editionId: string | null;
  editionName: string;
  content: string;
  createdByName: string;
  status: 'pending' | 'done' | 'failed';
  summary: string;
  error: string;
  analysedAt: string | null;
  createdAt: string;
  suggestions: MeetingSuggestion[];
}

export interface MeetingRow {
  id: string;
  title: string;
  meetingOn: string;
  editionName: string;
  createdByName: string;
  status: 'pending' | 'done' | 'failed';
  analysedAt: string | null;
  proposed: number;
  created: number;
}

export interface MeetingOptions {
  members: MeetingMember[];
  editions: { id: string; name: string }[];
  canWrite: boolean;
  me: string;
}

/** Le compte rendu suffit : le titre, la date et les programmes, l'IA les lit dedans. */
export const meetingInput = z.object({
  title: z.string().trim().max(200).default(''),
  meetingOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  editionId: z.string().nullable().default(null),
  content: z.string().trim().min(20, 'Paste the meeting notes.').max(60_000, 'Sixty thousand characters at most.'),
});

export const suggestionPatch = z.object({
  title: z.string().trim().max(300).optional(),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  editionId: z.string().nullable().optional(),
  link: z.object({ kind: z.enum(['person', 'org', 'edition', 'candidate']), id: z.string().min(1) }).nullable().optional(),
  status: z.enum(['proposed', 'dismissed']).optional(),
});

export const createSuggestionsInput = z.object({
  ids: z.array(z.string()).min(1, 'Select at least one task.').max(200),
  /** Une lettre par personne, qui liste toutes ses tâches de la réunion. */
  tell: z.boolean().default(false),
});

export interface MeetingBacklog {
  analysing: { id: string; title: string; status: 'pending' | 'failed'; error: string; createdAt: string }[];
  items: MeetingSuggestion[];
}
