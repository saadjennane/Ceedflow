/**
 * Les attributs que CEED ajoute à la fiche startup, leurs valeurs, et
 * l'historique de tout ce qui change sur une fiche.
 *
 * The history is written by comparing the sheet before and after a change,
 * rather than by each route saying what it did: there are some forty routes
 * that write on a sheet, and a journal that relies on each of them to report
 * is a journal with holes in it the day someone adds the forty-first.
 */
import {
  attributeText,
  newId,
  type DirectoryRecord,
  type OrgAttribute,
  type OrgAttributeInput,
  type OrgAttributePatch,
  type SheetChange,
} from '@ceed/shared';
import { all, one } from './client.js';

const ATTR_COLS = `id, label, label_en as "labelEn", type, options, currency, visible, position,
  archived_at is not null as archived`;

export async function listAttributes(opts: { visibleOnly?: boolean; withArchived?: boolean } = {}): Promise<OrgAttribute[]> {
  const where = [
    opts.withArchived ? null : 'archived_at is null',
    opts.visibleOnly ? 'visible' : null,
  ].filter(Boolean);
  return all<OrgAttribute>(
    `select ${ATTR_COLS} from org_attributes ${where.length ? `where ${where.join(' and ')}` : ''}
      order by archived_at is not null, position, created_at`,
  );
}

export const getAttribute = (id: string) => one<OrgAttribute>(`select ${ATTR_COLS} from org_attributes where id = $1`, [id]);

export async function createAttribute(input: OrgAttributeInput): Promise<OrgAttribute> {
  const id = newId('att');
  const last = await one<{ n: number }>('select coalesce(max(position), -1)::int as n from org_attributes');
  await all(
    `insert into org_attributes (id, label, label_en, type, options, currency, visible, position)
     values ($1,$2,$3,$4,$5::text::jsonb,$6,$7,$8)`,
    [id, input.label, input.labelEn, input.type, JSON.stringify(input.options), input.currency, input.visible, (last?.n ?? -1) + 1],
  );
  return (await getAttribute(id))!;
}

export async function updateAttribute(id: string, patch: OrgAttributePatch): Promise<OrgAttribute | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const put = (column: string, value: unknown, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if (patch.label !== undefined) put('label', patch.label);
  if (patch.labelEn !== undefined) put('label_en', patch.labelEn);
  if (patch.options !== undefined) put('options', JSON.stringify(patch.options), '::text::jsonb');
  if (patch.currency !== undefined) put('currency', patch.currency);
  if (patch.visible !== undefined) put('visible', patch.visible);
  if (patch.position !== undefined) put('position', patch.position);
  if (patch.archived !== undefined) sets.push(patch.archived ? 'archived_at = coalesce(archived_at, now())' : 'archived_at = null');
  if (sets.length) await all(`update org_attributes set ${sets.join(', ')} where id = $1`, params);
  return getAttribute(id);
}

/** Les valeurs d'une organisation, par attribut. */
export async function attributeValues(orgId: string): Promise<Record<string, unknown>> {
  const rows = await all<{ attributeId: string; value: unknown }>(
    'select attribute_id as "attributeId", value from org_attribute_values where org_id = $1',
    [orgId],
  );
  return Object.fromEntries(rows.map((r) => [r.attributeId, r.value]));
}

/**
 * Écrit une valeur déjà vérifiée — `null` l'efface.
 *
 * En JSON explicite, `$n::text::jsonb` : le pilote Postgres encode lui-même un
 * texte envoyé vers du jsonb, PGlite non — ainsi les deux lisent la même chose.
 */
export async function putAttributeValue(orgId: string, attributeId: string, value: unknown): Promise<void> {
  if (value === null) {
    await all('delete from org_attribute_values where org_id = $1 and attribute_id = $2', [orgId, attributeId]);
    return;
  }
  await all(
    `insert into org_attribute_values (org_id, attribute_id, value) values ($1,$2,$3::text::jsonb)
     on conflict (org_id, attribute_id) do update set value = excluded.value, updated_at = now()`,
    [orgId, attributeId, JSON.stringify(value)],
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/** Who changed something, and through what. */
export interface Changer {
  kind: 'staff' | 'member' | 'system';
  id: string | null;
  name: string;
  source?: 'sheet' | 'form';
  sourceLabel?: string;
}

type Change = Pick<SheetChange, 'field' | 'label' | 'before' | 'after'>;

export async function recordChanges(orgId: string, changes: Change[], by: Changer): Promise<void> {
  for (const c of changes) {
    await all(
      `insert into org_history (id, org_id, field, label, before, after, by_kind, by_id, by_name, source, source_label)
       values ($1,$2,$3,$4,$5::text::jsonb,$6::text::jsonb,$7,$8,$9,$10,$11)`,
      [
        newId('hst'), orgId, c.field, c.label,
        c.before === undefined || c.before === null ? null : JSON.stringify(c.before),
        c.after === undefined || c.after === null ? null : JSON.stringify(c.after),
        by.kind, by.id, by.name, by.source ?? 'sheet', by.sourceLabel ?? '',
      ],
    );
  }
}

export async function historyOf(orgId: string, limit = 500): Promise<SheetChange[]> {
  return all<SheetChange>(
    `select id, field, label, before, after, by_kind as "byKind", by_name as "byName", source,
            source_label as "sourceLabel", created_at::text as at
       from org_history where org_id = $1 order by created_at desc, id desc limit $2`,
    [orgId, limit],
  );
}

/** Ce qui ne se raconte pas : calculé, technique, ou suivi à part plus bas. */
const NOT_TOLD = new Set([
  'id', 'kind', 'createdAt', 'createdBy', 'createdByName', 'origin', 'ceedPrograms', 'testOwner',
  // Dérivés de leur liste : `emails`, `phones` et `places` les disent déjà.
  'email', 'phone', 'city', 'country',
  'revenues', 'documents', 'fundings', 'products', 'programs', 'needs', 'login',
]);

const LABEL: Record<string, string> = {
  name: 'Name', pitch: 'Short description', bio: 'What the business does', mainOffering: 'Main products and services',
  sector: 'Main sector', secondarySectors: 'Other sectors', maturity: 'Maturity', stage: 'Stage', orgType: 'Type of organisation',
  legalStatus: 'Legal status', legalForm: 'Legal form', foundedOn: 'Date founded', foundedYear: 'Year founded',
  capitalAmount: 'Share capital', capitalCurrency: 'Capital currency', teamSize: 'Headcount', foundersCount: 'Number of founders',
  womenCount: 'Number of women', activeClients: 'Active clients', targetMarkets: 'Target market', salesZone: 'Sales zone',
  salesCountries: 'Sales countries', website: 'Website', linkedin: 'LinkedIn', socials: 'Social networks', emails: 'Emails',
  phones: 'Phones', places: 'Addresses', logoUploadId: 'Logo', tags: 'Tags', roles: 'Roles', activityNature: 'Nature of the activity',
  catalogueUrl: 'Catalogue', demoUrl: 'Demo', hasFunding: 'Has raised funds', pastPrograms: 'Past programmes',
  currentPrograms: 'Current programmes', patent: 'Patent', patentDetails: 'Patent details', mvpUsers: 'MVP users',
  signedContracts: 'Signed contracts', contractsCount: 'Number of contracts', contractsAmount: 'Contracts amount',
};
const LIST_LABEL: Record<string, string> = { fundings: 'Funding', products: 'Product', programs: 'Programme' };

const humanise = (key: string) => LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Lines of a list, keyed by what identifies them. */
function byKey<T>(rows: readonly T[] | undefined, key: (row: T) => string): Map<string, T> {
  return new Map((rows ?? []).map((r) => [key(r), r]));
}

/** Ce qui sépare deux états d'une même fiche, ligne par ligne. */
export function sheetDiff(before: DirectoryRecord, after: DirectoryRecord): Change[] {
  const out: Change[] = [];
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (NOT_TOLD.has(key)) continue;
    if (same(b[key], a[key]) || (empty(b[key]) && empty(a[key]))) continue;
    out.push({ field: key, label: humanise(key), before: b[key] ?? null, after: a[key] ?? null });
  }

  /* Le chiffre d'affaires, un exercice à la fois. */
  const revB = byKey(before.revenues, (r) => String(r.year));
  const revA = byKey(after.revenues, (r) => String(r.year));
  for (const year of new Set([...revB.keys(), ...revA.keys()])) {
    const x = revB.get(year);
    const y = revA.get(year);
    const show = (r: typeof x) => (r ? (r.unavailable ? 'Not available' : r.amount === null ? null : `${r.amount} ${r.currency}`) : null);
    if (!same(show(x), show(y))) out.push({ field: `revenue:${year}`, label: `Revenue ${year}`, before: show(x), after: show(y) });
  }

  /* Les documents : déposé, remplacé, retiré. */
  const docB = byKey(before.documents, (d) => d.id);
  const docA = byKey(after.documents, (d) => d.id);
  for (const id of new Set([...docB.keys(), ...docA.keys()])) {
    const x = docB.get(id);
    const y = docA.get(id);
    const show = (d: typeof x) => (d ? { uploadId: d.uploadId, filename: d.filename } : null);
    if (same(show(x), show(y))) continue;
    const d = (y ?? x)!;
    const label = `Document — ${d.label || d.kind}${d.year ? ` ${d.year}` : ''}`;
    out.push({ field: `document:${d.kind}`, label, before: show(x), after: show(y) });
  }

  /* Les listes : une ligne ajoutée, changée ou retirée. */
  for (const list of ['fundings', 'products', 'programs'] as const) {
    const lb = byKey(before[list] as { id: string }[] | undefined, (r) => r.id);
    const la = byKey(after[list] as { id: string }[] | undefined, (r) => r.id);
    for (const id of new Set([...lb.keys(), ...la.keys()])) {
      if (same(lb.get(id), la.get(id))) continue;
      out.push({ field: `${list}:${id}`, label: LIST_LABEL[list]!, before: lb.get(id) ?? null, after: la.get(id) ?? null });
    }
  }

  /* Les besoins : choisis, retirés, ou leurs réponses. */
  const nb = byKey(before.needs, (n) => n.need);
  const na = byKey(after.needs, (n) => n.need);
  for (const need of new Set([...nb.keys(), ...na.keys()])) {
    const show = (n: ReturnType<typeof nb.get>) => (n ? { active: n.active, data: n.data } : null);
    if (same(show(nb.get(need)), show(na.get(need)))) continue;
    out.push({ field: `need:${need}`, label: `Need — ${need}`, before: show(nb.get(need)), after: show(na.get(need)) });
  }
  return out;
}

/** Un changement d'attribut ajouté, raconté comme les autres. */
export const attributeChange = (attr: OrgAttribute, before: unknown, after: unknown): Change => ({
  field: `attr:${attr.id}`,
  label: attr.label,
  before: before ?? null,
  after: after ?? null,
});

export { attributeText };
