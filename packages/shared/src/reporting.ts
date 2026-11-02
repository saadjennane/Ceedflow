/**
 * Le reporting d'une édition : les KPI de sa cohorte, relevés à des moments du
 * programme.
 *
 * Not a brick: measuring is not a step a startup goes through, it is a question
 * CEED asks about its programme. The indicators are defined for the programme,
 * so every edition is measured on the same ones and cohorts compare; an edition
 * may add its own. The moments — start, midway, end, a year after — are the
 * edition's, with its own dates. Each indicator is a question, linked to the
 * startup sheet or the programme's own, exactly as a form question is.
 */
import { z } from 'zod';
import { formFieldSchema, type FormField } from './blocks.js';

export const kpiMomentSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Give it a name.').max(80),
  /** The day the measure opens. A sheet value is written at this date. */
  opensOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date.').nullable().default(null),
  /** Late after this day — still answered. */
  closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date.').nullable().default(null),
  /** When CEED sent it to the cohort. Before that, the startups see nothing. */
  launchedAt: z.string().nullable().default(null),
});
export type KpiMoment = z.infer<typeof kpiMomentSchema>;

export const DEFAULT_MOMENTS = ['Début du programme', 'Mi-parcours', 'Fin du programme', 'N+1'];

const OPEN_DEFAULT = `Bonjour {{prenom}},

Dans le cadre du programme {{programme}}, nous suivons l'évolution de {{startup}}. Merci de renseigner vos indicateurs — {{moment}} — avant le {{date_limite}} :
{{lien}}

Cela prend quelques minutes, et vos réponses mettent aussi à jour votre fiche.

L'équipe CEED`;

const REMIND_DEFAULT = `Bonjour {{prenom}},

Petit rappel : les indicateurs de {{startup}} — {{moment}} — sont attendus pour le {{date_limite}}.
{{lien}}

L'équipe CEED`;

export const reportingMessagesSchema = z.object({
  openSubject: z.string().default('{{programme}} — vos indicateurs, {{moment}}'),
  open: z.string().default(OPEN_DEFAULT),
  remindSubject: z.string().default('Rappel — vos indicateurs, {{moment}}'),
  remind: z.string().default(REMIND_DEFAULT),
});

/** The programme's indicators, shared by all its editions. */
export const programReportingSchema = z.object({
  indicators: z.array(formFieldSchema).default([]),
  /** Filled in by CEED itself, for each edition, at each moment. */
  teamIndicators: z.array(formFieldSchema).default([]),
});
export type ProgramReporting = z.infer<typeof programReportingSchema>;

/** One edition's: its own indicators, its moments, its letters. */
export const editionReportingSchema = z.object({
  indicators: z.array(formFieldSchema).default([]),
  moments: z.array(kpiMomentSchema).default([]),
  messages: reportingMessagesSchema.default({}),
});
export type EditionReporting = z.infer<typeof editionReportingSchema>;

export const REPORTING_VARIABLES = [
  { name: 'prenom', label: 'First name', what: 'The first name of the startup’s contact', example: 'Salma' },
  { name: 'startup', label: 'Startup', what: 'The startup’s name', example: 'Atlas Robotics' },
  { name: 'programme', label: 'Programme', what: 'The programme and its edition', example: 'The Builders — Cohorte 1' },
  { name: 'moment', label: 'Moment', what: 'The measure asked for', example: 'Début du programme' },
  { name: 'date_limite', label: 'Deadline', what: 'The moment’s deadline, in words', example: '15 novembre 2026' },
  { name: 'lien', label: 'Link', what: 'Where the startup gives its indicators, in its space', example: 'https://www.ceedflow.com/kpi/…' },
];

/** What CEED reads: the indicators, the moments, the cohort and every answer. */
export interface ReportingView {
  programIndicators: FormField[];
  editionIndicators: FormField[];
  moments: KpiMoment[];
  messages: z.infer<typeof reportingMessagesSchema>;
  cohort: { candidateId: string; orgId: string; orgName: string; contactName: string }[];
  responses: { momentId: string; candidateId: string; answers: Record<string, unknown>; submittedAt: string | null; updatedAt: string }[];
  /** What CEED measures itself, and what it has entered. */
  teamIndicators: FormField[];
  teamValues: { momentId: string; indicatorId: string; value: unknown; byName: string; updatedAt: string }[];
}

/** One measure, as the startup fills it. */
export interface KpiMeasurePage {
  momentId: string;
  candidateId: string;
  momentName: string;
  programName: string;
  editionName: string;
  orgName: string;
  closesOn: string | null;
  fields: FormField[];
  /** What was saved — or, before anything, what the sheet already says. */
  answers: Record<string, unknown>;
  /** For a prefilled value: the date the sheet knew it from. */
  asOf: Record<string, string>;
  submittedAt: string | null;
}

/** L'écart entre la référence et la dernière mesure. */
export function evolution(values: (number | null)[]): { from: number; to: number; delta: number; pct: number | null } | null {
  const known = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (known.length < 2) return null;
  const from = known[0]!;
  const to = known[known.length - 1]!;
  return { from, to, delta: to - from, pct: from === 0 ? null : ((to - from) / Math.abs(from)) * 100 };
}

/** Ce que la plateforme sait déjà d'une édition, compté tel quel. */
export interface ProgramMetrics {
  applications: { total: number; withdrawn: number };
  cohort: number;
  funnel: { track: string; steps: { name: string; count: number; rate: number | null }[] }[];
  /** No presence is recorded at a committee: what the startups answered. */
  committees: { name: string; convoked: number; confirmed: number; declined: number; pending: number; confirmRate: number | null }[];
  oneToOne: {
    name: string;
    planned: number;
    held: number;
    noShow: number;
    cancelled: number;
    /** Held over held and missed. */
    attendance: number | null;
    reports: number;
    reportRate: number | null;
  }[];
  deliverables: { name: string; asked: number; sent: number; accepted: number; sentRate: number | null }[];
  profiles: { average: number | null; complete: number; of: number };
}
