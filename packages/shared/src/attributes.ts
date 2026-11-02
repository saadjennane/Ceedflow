/**
 * La fiche startup, administrable.
 *
 * The fixed attributes of the sheet stay as they are — screens, filters and
 * exports lean on them. CEED adds its own next to them: a name, a type, and
 * whether the startup sees it. And whatever changes on a sheet, fixed or added,
 * is kept in its history: what it was, what it became, who, and from where.
 */
import { z } from 'zod';

export const ATTRIBUTE_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'url',
  'number',
  'amount',
  'date',
  'select',
  'multiselect',
  'file',
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const ATTRIBUTE_TYPE_LABEL: Record<AttributeType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  email: 'Email',
  phone: 'Phone',
  url: 'Link',
  number: 'Number',
  amount: 'Amount',
  date: 'Date',
  select: 'One choice',
  multiselect: 'Several choices',
  file: 'File',
};

/** Les types qui proposent une liste de choix. */
export const hasOptions = (type: AttributeType) => type === 'select' || type === 'multiselect';

export interface OrgAttribute {
  id: string;
  label: string;
  /** Its name in English, for a startup reading its space in English. Empty: the label. */
  labelEn: string;
  type: AttributeType;
  options: string[];
  /** For an amount. */
  currency: string;
  /** The startup sees it and fills it in its space. Otherwise it stays CEED's. */
  visible: boolean;
  position: number;
  archived: boolean;
  /** Followed over time, one value per period of this kind. Null: a plain attribute. */
  kpiPeriod: 'year' | 'quarter' | 'month' | 'day' | null;
}

export const orgAttributeInput = z
  .object({
    label: z.string().trim().min(1, 'Give it a name.').max(120, '120 characters at most.'),
    labelEn: z.string().trim().max(120, '120 characters at most.').default(''),
    type: z.enum(ATTRIBUTE_TYPES),
    options: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
    currency: z.string().trim().min(1).max(8).default('MAD'),
    visible: z.boolean().default(true),
    kpiPeriod: z.enum(['year', 'quarter', 'month', 'day']).nullable().default(null),
  })
  .superRefine((a, ctx) => {
    if (hasOptions(a.type) && !a.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Give at least one choice.' });
    }
  });
export type OrgAttributeInput = z.infer<typeof orgAttributeInput>;

/** Le type ne change pas une fois créé : les valeurs déjà saisies n'y survivraient pas. */
export const orgAttributePatch = z.object({
  label: z.string().trim().min(1, 'Give it a name.').max(120).optional(),
  labelEn: z.string().trim().max(120).optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  visible: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
  kpiPeriod: z.enum(['year', 'quarter', 'month', 'day']).nullable().optional(),
});
export type OrgAttributePatch = z.infer<typeof orgAttributePatch>;

export const attributeLabel = (a: Pick<OrgAttribute, 'label' | 'labelEn'>, lang: 'fr' | 'en' = 'fr') =>
  lang === 'en' && a.labelEn ? a.labelEn : a.label;

/** A file kept on a sheet: which upload, and what it was called. */
export interface AttributeFile {
  uploadId: string;
  filename: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ce qu'une valeur devient avant d'être gardée — ou pourquoi elle est refusée.
 * `null` efface : une case vidée veut dire « je ne sais pas », pas zéro.
 */
export function normaliseAttributeValue(
  attr: Pick<OrgAttribute, 'type' | 'options'>,
  raw: unknown,
): { value: unknown } | { error: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  switch (attr.type) {
    case 'short_text':
    case 'long_text':
    case 'phone': {
      if (typeof raw !== 'string') return { error: 'Expected text.' };
      const text = raw.trim();
      if (text.length > (attr.type === 'long_text' ? 10_000 : 500)) return { error: 'Too long.' };
      return { value: text || null };
    }
    case 'email': {
      if (typeof raw !== 'string' || !EMAIL.test(raw.trim())) return { error: 'Not an email address.' };
      return { value: raw.trim().toLowerCase() };
    }
    case 'url': {
      if (typeof raw !== 'string') return { error: 'Expected a link.' };
      const text = raw.trim();
      const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      try {
        new URL(withScheme);
      } catch {
        return { error: 'Not a link.' };
      }
      return { value: withScheme };
    }
    case 'number':
    case 'amount': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) return { error: 'Expected a number.' };
      return { value: n };
    }
    case 'date': {
      if (typeof raw !== 'string' || !DAY.test(raw)) return { error: 'Expected a date.' };
      return { value: raw };
    }
    case 'select': {
      if (typeof raw !== 'string' || !attr.options.includes(raw)) return { error: 'Not one of the choices.' };
      return { value: raw };
    }
    case 'multiselect': {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string' || !attr.options.includes(x))) {
        return { error: 'Not among the choices.' };
      }
      return { value: raw.length ? [...new Set(raw as string[])] : null };
    }
    case 'file': {
      const f = raw as Partial<AttributeFile>;
      if (typeof f !== 'object' || typeof f.uploadId !== 'string' || !f.uploadId) return { error: 'Expected a file.' };
      return { value: { uploadId: f.uploadId, filename: String(f.filename ?? '') } };
    }
  }
}

/** Une valeur en mots, pour un tableau ou l'historique. */
export function attributeText(type: AttributeType | string, value: unknown, currency = ''): string {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'file') return (value as AttributeFile).filename || 'File';
  if (Array.isArray(value)) return value.join(', ');
  if (type === 'amount' && typeof value === 'number') return `${value.toLocaleString('fr-FR')} ${currency}`.trim();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** What a sheet's own screen reads: the attributes it shows, and their values. */
export interface SheetAttributes {
  attributes: OrgAttribute[];
  values: Record<string, unknown>;
}

/** One change on a sheet, as its history keeps it. */
export interface SheetChange {
  id: string;
  /** What changed: a field of the sheet, `attr:<id>`, `revenue:<year>`, `document:<id>`… */
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  byKind: 'staff' | 'member' | 'system';
  byName: string;
  /** Where it was changed: on the sheet itself, or through a form. */
  source: 'sheet' | 'form';
  sourceLabel: string;
  at: string;
}
