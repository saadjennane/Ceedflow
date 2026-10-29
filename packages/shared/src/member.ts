/**
 * Ce qu'un membre a à faire, et ce qui l'attend : la forme des lignes que la
 * page d'accueil montre, lues côté serveur sur les objets eux-mêmes.
 */
import type { Task } from './tasks.js';

export type ActionStatus = 'pending' | 'in_progress' | 'late';
export type ActionRole = 'startup' | 'jury' | 'mentor' | 'member';

/** One thing somebody has to do, and where to do it. */
export interface MemberAction {
  /** Stable across reloads: the kind and the object it is about. */
  id: string;
  kind: 'task' | 'deliverable' | 'profile' | 'review' | 'report' | 'answer_committee' | 'answer_meeting' | 'prepare';
  role: ActionRole;
  status: ActionStatus;
  dueOn: string | null;
  programName: string | null;
  editionId: string | null;
  /** Where the act happens: a page of this app. */
  href: string;
  /** What the line names — the screen composes the sentence from these. */
  label: string;
  /** For a startup's line, which of its organisations it is about. */
  orgName?: string;
  /** Counted lines: how many are left, out of how many. */
  left?: number;
  of?: number;
  /** A deliverable item sent back to be done again. */
  back?: boolean;
  /** For an answer: whether to pick a time or to confirm one. */
  answer?: 'book' | 'confirm';
  /** A task, whole, so the Home can tick it and its lines where it stands. */
  task?: Task;
}

/** Something on the calendar — not a thing to do, unless it asks for one. */
export interface MemberActivity {
  id: string;
  kind: 'committee' | 'one_to_one' | 'jury_sitting';
  role: ActionRole;
  on: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  programName: string | null;
  editionId: string | null;
  /** The sitting, the interlocutor, or the startup met. */
  label: string;
  href: string | null;
}

