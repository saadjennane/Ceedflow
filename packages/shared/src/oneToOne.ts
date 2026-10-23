/**
 * Un One to One : une startup, un interlocuteur, un rendez-vous, un compte rendu.
 *
 * The brick (blocks.ts) holds what is the same for every meeting — who may be
 * met, and what the report asks. A meeting is one row: when, with whom, how it
 * was set, and what the interlocutor wrote. The report never reaches the
 * startup: it is between the interlocutor and CEED.
 */
import { z } from 'zod';
import { RSVP_MODES, type FormField } from './blocks.js';

export const MEETING_STATUSES = ['planned', 'held', 'cancelled', 'no_show'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  planned: 'Planned',
  held: 'Held',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export interface OneToOneMeeting {
  id: string;
  blockId: string;
  candidateId: string;
  orgName: string;
  personId: string;
  personName: string;
  seriesId: string | null;
  /** 'YYYY-MM-DD' and 'HH:MM', local to the edition — the committee's convention. Null until set or booked. */
  heldOn: string | null;
  startTime: string | null;
  durationMinutes: number;
  location: string;
  /** How it was set: booked by the startup, proposed and confirmed, or simply fixed. */
  invite: (typeof RSVP_MODES)[number];
  token: string;
  rsvpState: 'pending' | 'confirmed' | 'declined';
  respondedAt: string | null;
  status: MeetingStatus;
  /** The report's answers, by question id. Empty until somebody writes. */
  report: Record<string, unknown>;
  reportSubmittedAt: string | null;
  reportByName: string;
  createdAt: string;
}

/** Where a meeting stands, for a badge: what the reader needs to know first. */
export function meetingState(m: Pick<OneToOneMeeting, 'status' | 'heldOn' | 'invite' | 'rsvpState' | 'reportSubmittedAt'>):
  'cancelled' | 'no_show' | 'reported' | 'to_report' | 'declined' | 'awaiting' | 'unscheduled' | 'scheduled' {
  if (m.status === 'cancelled') return 'cancelled';
  if (m.status === 'no_show') return 'no_show';
  if (m.reportSubmittedAt) return 'reported';
  if (m.status === 'held') return 'to_report';
  if (m.invite !== 'none' && m.rsvpState === 'declined') return 'declined';
  if (!m.heldOn) return 'unscheduled';
  if (m.invite === 'confirm' && m.rsvpState === 'pending') return 'awaiting';
  return 'scheduled';
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date, day by day.');
const clock = z.string().regex(/^\d{2}:\d{2}$/, 'A time, HH:MM.');

/** Plan one meeting per startup named, all with the same interlocutor. */
export const planMeetingsInput = z.object({
  candidateIds: z.array(z.string()).min(1, 'Pick at least one startup.'),
  personId: z.string().min(1, 'Who are they meeting?'),
  invite: z.enum(RSVP_MODES),
  heldOn: day.nullable().default(null),
  startTime: clock.nullable().default(null),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  location: z.string().optional(),
});

export const meetingPatch = z.object({
  personId: z.string().optional(),
  heldOn: day.nullable().optional(),
  startTime: clock.nullable().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  location: z.string().optional(),
  status: z.enum(MEETING_STATUSES).optional(),
});

/** Writing the report: the answers so far, and whether it is being sent. */
export const reportInput = z.object({
  answers: z.record(z.unknown()).default({}),
  submit: z.boolean().default(false),
});

/* ------------------------------------------------------------------ */
/* The reporting, like a form's responses                              */
/* ------------------------------------------------------------------ */

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** One question's answers, summed up the way a form's response page does. */
export type QuestionSummary =
  | { kind: 'choice'; field: FormField; answered: number; counts: { option: string; count: number }[] }
  | { kind: 'number'; field: FormField; answered: number; average: number | null; min: number | null; max: number | null }
  | { kind: 'text'; field: FormField; answered: number; answers: string[] }
  | { kind: 'file'; field: FormField; answered: number };

/**
 * Le résumé d'une question sur un ensemble de comptes rendus.
 *
 * A choice is counted per option — an answer no longer among the options is
 * still counted, under its own words, rather than vanishing from the total.
 * A number gives its average and its range; a text, its answers, newest first.
 */
export function summarise(field: FormField, reports: Record<string, unknown>[]): QuestionSummary {
  const given = reports.map((r) => r[field.id]).filter((v) => !empty(v));
  if (field.type === 'select' || field.type === 'multiselect') {
    const counts = new Map<string, number>(field.options.map((o) => [o, 0]));
    for (const v of given) for (const o of Array.isArray(v) ? v : [v]) counts.set(String(o), (counts.get(String(o)) ?? 0) + 1);
    return {
      kind: 'choice', field, answered: given.length,
      counts: [...counts.entries()].map(([option, count]) => ({ option, count })),
    };
  }
  if (field.type === 'number') {
    const numbers = given.map(Number).filter((n) => Number.isFinite(n));
    return {
      kind: 'number', field, answered: numbers.length,
      average: numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null,
      min: numbers.length ? Math.min(...numbers) : null,
      max: numbers.length ? Math.max(...numbers) : null,
    };
  }
  if (field.type === 'file') return { kind: 'file', field, answered: given.length };
  return { kind: 'text', field, answered: given.length, answers: given.map(String) };
}
