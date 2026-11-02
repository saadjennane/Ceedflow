/**
 * Les KPI d'une startup : un attribut qui se suit dans le temps.
 *
 * A KPI does not keep one value but one value per period — the turnover of
 * 2025, the headcount at the third quarter — and a new value for a period that
 * already has one corrects it rather than adding a point. The period is the
 * one the value is about, not the day it was typed: a turnover for 2024 can be
 * given in 2026.
 */
import { z } from 'zod';

export const KPI_PERIODS = ['year', 'quarter', 'month', 'day'] as const;
export type KpiPeriod = (typeof KPI_PERIODS)[number];

export const KPI_PERIOD_LABEL: Record<KpiPeriod, string> = {
  year: 'Per year',
  quarter: 'Per quarter',
  month: 'Per month',
  day: 'At the date given',
};

/**
 * Les attributs fixes qui peuvent devenir des KPI.
 *
 * `column`: the sheet's own field, kept as the latest value. `revenue` lives in
 * its yearly table already and `equityRaised` is read off the funding rounds —
 * the latter is followed, never typed.
 */
export const FIXED_KPIS = [
  { key: 'revenue', fr: 'Chiffre d’affaires', en: 'Turnover', type: 'amount', period: 'year' },
  { key: 'equityRaised', fr: 'Montant levé en capital (cumul)', en: 'Equity raised (cumulative)', type: 'amount', period: 'year', computed: true },
  { key: 'teamSize', fr: 'Effectif', en: 'Headcount', type: 'number', column: 'teamSize' },
  { key: 'foundersCount', fr: 'Nombre de fondateurs', en: 'Number of founders', type: 'number', column: 'foundersCount' },
  { key: 'womenCount', fr: 'Nombre de femmes', en: 'Number of women', type: 'number', column: 'womenCount' },
  { key: 'activeClients', fr: 'Clients actifs', en: 'Active clients', type: 'number', column: 'activeClients' },
  { key: 'contractsCount', fr: 'Contrats signés', en: 'Signed contracts', type: 'number', column: 'contractsCount' },
  { key: 'contractsAmount', fr: 'Montant des contrats', en: 'Contracts amount', type: 'amount', column: 'contractsAmount' },
  { key: 'capital', fr: 'Capital social', en: 'Share capital', type: 'amount', column: 'capitalAmount' },
  { key: 'pitchDeck', fr: 'Pitch deck', en: 'Pitch deck', type: 'file', document: 'pitch_deck' },
] as const satisfies readonly {
  key: string;
  fr: string;
  en: string;
  type: 'number' | 'amount' | 'file';
  /** Its periodicity is not a choice. */
  period?: KpiPeriod;
  computed?: boolean;
  column?: string;
  document?: string;
}[];
export type FixedKpiKey = (typeof FIXED_KPIS)[number]['key'];

/** The period a value given today falls in. */
export function currentPeriod(kind: KpiPeriod, today = new Date().toISOString().slice(0, 10)): string {
  const [y, m] = today.split('-');
  if (kind === 'year') return y!;
  if (kind === 'quarter') return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
  if (kind === 'month') return `${y}-${m}`;
  return today;
}

const SHAPE: Record<KpiPeriod, RegExp> = {
  year: /^\d{4}$/,
  quarter: /^\d{4}-Q[1-4]$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
  day: /^\d{4}-\d{2}-\d{2}$/,
};
export const validPeriod = (kind: KpiPeriod, period: string) => SHAPE[kind].test(period);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 2025 », « T3 2026 », « nov. 2026 », « 3 nov. 2026 ». */
export function periodLabel(period: string, lang: 'fr' | 'en' = 'en'): string {
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  if (q) return lang === 'fr' ? `T${q[2]} ${q[1]}` : `Q${q[2]} ${q[1]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) return `${(lang === 'fr' ? MOIS : MONTHS)[Number(m[2]) - 1]} ${m[1]}`;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  if (d) return `${Number(d[3])} ${(lang === 'fr' ? MOIS : MONTHS)[Number(d[2]) - 1]} ${d[1]}`;
  return period;
}

/** One value of a KPI, for one period. */
export interface KpiPoint {
  period: string;
  value: unknown;
  /** For an amount read off a table that keeps its own currency. */
  currency?: string;
}

/** A KPI with its values, as a sheet shows it. */
export interface KpiSeries {
  /** A fixed key, or `attr:<id>` for an attribute CEED added. */
  key: string;
  label: string;
  labelEn: string;
  type: string;
  period: KpiPeriod;
  currency: string;
  /** The choices, for a KPI that is a list. */
  options: string[];
  /** Followed from other data, never typed. */
  readOnly: boolean;
  /** The periodicity is the attribute's own and cannot change. */
  fixedPeriod: boolean;
  points: KpiPoint[];
}

/** What the settings screen shows of a fixed attribute that can be a KPI. */
export interface FixedKpiSetting {
  key: FixedKpiKey;
  label: string;
  type: string;
  /** Null: not followed. */
  period: KpiPeriod | null;
  fixedPeriod: boolean;
}

export const kpiSettingInput = z.object({ period: z.enum(KPI_PERIODS).nullable() });
export const kpiPointInput = z.object({ value: z.unknown() });
