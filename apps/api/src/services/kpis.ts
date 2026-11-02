/**
 * Les KPI d'une fiche : lus, écrits période par période, et suivis quand la
 * fiche change.
 *
 * Three sources behind one shape. The turnover keeps its own yearly table, the
 * equity raised is added up from the funding rounds, and everything else keeps
 * its values in `org_kpi_points`. Whichever it is, the latest period is also
 * the sheet's current value — what the tables, the filters and the forms read.
 */
import {
  FIXED_KPIS,
  KPI_PERIODS,
  currentPeriod,
  normaliseAttributeValue,
  periodLabel,
  validPeriod,
  type DirectoryRecord,
  type FixedKpiSetting,
  type KpiPeriod,
  type KpiPoint,
  type KpiSeries,
  type OrgAttribute,
} from '@ceed/shared';
import { all } from '../db/client.js';
import * as dir from '../db/directory.js';
import * as attrs from '../db/attributes.js';
import { HttpError } from '../routes/util.js';

type Fixed = (typeof FIXED_KPIS)[number];

/** Suivis tant que personne n'a dit le contraire : le chiffre d'affaires, année par année. */
const BY_DEFAULT: Record<string, KpiPeriod> = { revenue: 'year' };

/** The fixed attributes CEED follows, and how often. */
async function settings(): Promise<Map<string, KpiPeriod>> {
  const rows = await all<{ key: string; period: KpiPeriod | null }>('select key, period from kpi_settings');
  const said = new Map(rows.map((r) => [r.key, r.period]));
  const out = new Map<string, KpiPeriod>();
  for (const k of FIXED_KPIS) {
    const period = said.has(k.key) ? said.get(k.key) : BY_DEFAULT[k.key];
    if (period) out.set(k.key, period);
  }
  return out;
}

export async function fixedKpiSettings(): Promise<FixedKpiSetting[]> {
  const on = await settings();
  return FIXED_KPIS.map((k) => ({
    key: k.key,
    label: k.en,
    type: k.type,
    period: on.get(k.key) ?? null,
    fixedPeriod: 'period' in k,
  }));
}

export async function setFixedKpi(key: string, period: KpiPeriod | null): Promise<void> {
  const fixed = FIXED_KPIS.find((k) => k.key === key);
  if (!fixed) throw new HttpError(404, 'No such attribute.');
  const kept = period === null ? null : 'period' in fixed ? fixed.period : period;
  await all(
    `insert into kpi_settings (key, period) values ($1,$2) on conflict (key) do update set period = excluded.period`,
    [key, kept],
  );
}

interface Definition {
  key: string;
  label: string;
  labelEn: string;
  type: string;
  period: KpiPeriod;
  currency: string;
  readOnly: boolean;
  fixedPeriod: boolean;
  fixed?: Fixed;
  attribute?: OrgAttribute;
}

/** Every KPI followed, the startup's view or CEED's. */
async function definitions(visibleOnly: boolean): Promise<Definition[]> {
  const on = await settings();
  const out: Definition[] = [];
  for (const k of FIXED_KPIS) {
    const period = on.get(k.key);
    if (!period) continue;
    out.push({
      key: k.key, label: k.fr, labelEn: k.en, type: k.type, period, currency: 'MAD',
      readOnly: 'computed' in k, fixedPeriod: 'period' in k, fixed: k,
    });
  }
  for (const a of await attrs.listAttributes({ visibleOnly })) {
    if (!a.kpiPeriod) continue;
    out.push({
      key: `attr:${a.id}`, label: a.label, labelEn: a.labelEn, type: a.type, period: a.kpiPeriod,
      currency: a.currency, readOnly: false, fixedPeriod: false, attribute: a,
    });
  }
  return out;
}

/** Les montants levés en capital, cumulés d'année en année, dans la devise la plus présente. */
function equitySeries(record: DirectoryRecord): KpiPoint[] {
  const equity = record.fundings.filter((f) => f.nature === 'equity' && f.amount !== null && f.onDate);
  if (!equity.length) return [];
  const byCurrency = new Map<string, number>();
  for (const f of equity) byCurrency.set(f.currency, (byCurrency.get(f.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const byYear = new Map<string, number>();
  for (const f of equity.filter((x) => x.currency === currency)) {
    const year = String(f.onDate).slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + f.amount!);
  }
  let total = 0;
  return [...byYear.keys()].sort().map((year) => {
    total += byYear.get(year)!;
    return { period: year, value: total, currency };
  });
}

async function storedPoints(orgId: string): Promise<Map<string, KpiPoint[]>> {
  const rows = await all<{ key: string; period: string; value: unknown }>(
    'select key, period, value from org_kpi_points where org_id = $1 order by period',
    [orgId],
  );
  const out = new Map<string, KpiPoint[]>();
  for (const r of rows) out.set(r.key, [...(out.get(r.key) ?? []), { period: r.period, value: r.value }]);
  return out;
}

export async function kpisOf(orgId: string, visibleOnly: boolean): Promise<KpiSeries[]> {
  const record = await dir.getRecord(orgId);
  if (!record) return [];
  const stored = await storedPoints(orgId);
  return (await definitions(visibleOnly)).map((d) => {
    const points =
      d.key === 'revenue'
        ? [...record.revenues]
            .filter((r) => !r.unavailable && r.amount !== null)
            .sort((a, b) => a.year - b.year)
            .map((r) => ({ period: String(r.year), value: r.amount, currency: r.currency }))
        : d.key === 'equityRaised'
          ? equitySeries(record)
          : (stored.get(d.key) ?? []);
    const { fixed: _f, attribute: _a, ...shown } = d;
    return { ...shown, options: d.attribute?.options ?? [], points };
  });
}

/** La périodicité de chaque KPI suivi — le réglage, sans aucune fiche. */
export async function kpiPeriodsByKey(): Promise<Map<string, KpiPeriod>> {
  return new Map((await definitions(false)).map((d) => [d.key, d.period]));
}

/** The latest period of a series, after this one is written or removed. */
const latest = (points: KpiPoint[]) => [...points].sort((a, b) => a.period.localeCompare(b.period)).at(-1) ?? null;

/** Ce que la fiche garde comme valeur du moment : la dernière période. */
async function keepCurrent(orgId: string, d: Definition, value: unknown): Promise<void> {
  if (d.attribute) await attrs.putAttributeValue(orgId, d.attribute.id, value);
  else if (d.fixed && 'column' in d.fixed) await dir.updateRecord(orgId, { [d.fixed.column]: value });
}

/**
 * Écrit la valeur d'une période — ou l'efface, `null`. Une période déjà
 * remplie est corrigée, et son ancienne valeur va à l'historique.
 */
export async function putKpiPoint(
  orgId: string,
  key: string,
  period: string,
  raw: unknown,
  by: attrs.Changer,
  opts: { visibleOnly: boolean },
): Promise<KpiSeries[]> {
  const d = (await definitions(opts.visibleOnly)).find((x) => x.key === key);
  if (!d) throw new HttpError(404, 'No such KPI.');
  if (d.readOnly) throw new HttpError(422, 'This one is followed from other data — it is not typed here.');
  if (!validPeriod(d.period, period)) throw new HttpError(422, 'Not a period of this KPI.', { period: 'Not a valid period.' });
  const checked = normaliseAttributeValue({ type: d.type as OrgAttribute['type'], options: d.attribute?.options ?? [] }, raw);
  if ('error' in checked) throw new HttpError(422, checked.error, { value: checked.error });
  const value = checked.value;

  const label = `${d.label} — ${periodLabel(period, 'fr')}`;
  if (d.key === 'revenue') {
    const before = (await dir.getRecord(orgId))!.revenues.find((r) => String(r.year) === period);
    await dir.putRevenue(orgId, Number(period), { amount: value as number | null, unavailable: false, currency: before?.currency ?? 'MAD' });
    await attrs.recordChanges(orgId, [{ field: `kpi:${key}:${period}`, label, before: before?.amount ?? null, after: value }], by);
    return kpisOf(orgId, opts.visibleOnly);
  }

  const points = (await storedPoints(orgId)).get(key) ?? [];
  const before = points.find((p) => p.period === period)?.value ?? null;
  if (JSON.stringify(before) === JSON.stringify(value ?? null)) return kpisOf(orgId, opts.visibleOnly);
  if (value === null) {
    await all('delete from org_kpi_points where org_id = $1 and key = $2 and period = $3', [orgId, key, period]);
  } else {
    await all(
      `insert into org_kpi_points (org_id, key, period, value) values ($1,$2,$3,$4::text::jsonb)
       on conflict (org_id, key, period) do update set value = excluded.value, updated_at = now()`,
      [orgId, key, period, JSON.stringify(value)],
    );
  }
  await attrs.recordChanges(orgId, [{ field: `kpi:${key}:${period}`, label, before, after: value }], by);

  /* La période la plus récente fait la valeur du moment de la fiche. */
  const after = value === null ? points.filter((p) => p.period !== period) : [...points.filter((p) => p.period !== period), { period, value }];
  const newest = latest(after);
  if (!newest || newest.period === period || latest(points)?.period === period) {
    await keepCurrent(orgId, d, newest?.value ?? null);
  }
  return kpisOf(orgId, opts.visibleOnly);
}

/**
 * Une valeur changée sur la fiche elle-même devient la valeur de la période
 * en cours, pour un attribut suivi — sans quoi l'effectif corrigé sur la fiche
 * n'apparaîtrait jamais dans sa courbe.
 */
export async function followSheetChange(orgId: string, changes: { field: string; after: unknown }[]): Promise<void> {
  if (!changes.length) return;
  const defs = await definitions(false);
  for (const c of changes) {
    const d =
      defs.find((x) => x.fixed && 'column' in x.fixed && x.fixed.column === c.field) ??
      (c.field === 'document:pitch_deck' ? defs.find((x) => x.key === 'pitchDeck') : undefined) ??
      (c.field.startsWith('attr:') ? defs.find((x) => x.key === c.field) : undefined);
    if (!d || d.readOnly || d.key === 'revenue') continue;
    const period = currentPeriod(d.period);
    if (c.after === null || c.after === undefined) continue;
    await all(
      `insert into org_kpi_points (org_id, key, period, value) values ($1,$2,$3,$4::text::jsonb)
       on conflict (org_id, key, period) do update set value = excluded.value, updated_at = now()`,
      [orgId, d.key, period, JSON.stringify(c.after)],
    );
  }
}

export { KPI_PERIODS };
