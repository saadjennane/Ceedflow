/**
 * Filtrer l'annuaire par ses colonnes.
 *
 * Une liste déroulante par colonne du tableau : on y lit les valeurs qui
 * existent vraiment dans la liste, chacune avec son nombre, plutôt qu'un
 * vocabulaire complet dont la moitié ne garderait rien.
 */
import { MATURITY_LEVELS, SECTORS, profileDone, profileOf } from '@ceed/shared';
import type { RecordRow } from './DirectoryPage';
import { revenueOf } from './DirectoryViews';

interface Column {
  key: string;
  label: string;
  /** Les valeurs d'une fiche dans cette colonne — plusieurs pour les programmes. */
  values: (r: RecordRow) => string[];
  /** Le libellé d'une valeur ; la valeur elle-même sinon. */
  word?: (value: string) => string;
  /** Un ordre fixe, quand l'alphabet n'a pas de sens (oui / non, complet / pas). */
  order?: string[];
}

const wordIn = (list: readonly { key: string; en: string }[]) => (key: string) => list.find((c) => c.key === key)?.en ?? key;
const NONE = '__none';
const none = (label: string) => (value: string) => (value === NONE ? label : value);

const ORG_COLUMNS: Column[] = [
  { key: 'sector', label: 'Sector', values: (r) => [profileOf(r).sector || NONE], word: (v) => (v === NONE ? 'No sector' : wordIn(SECTORS)(v)) },
  {
    key: 'maturity',
    label: 'Maturity',
    values: (r) => [profileOf(r).maturity || NONE],
    word: (v) => (v === NONE ? 'Not stated' : wordIn(MATURITY_LEVELS)(v)),
    order: [...MATURITY_LEVELS.map((m) => m.key), NONE],
  },
  { key: 'city', label: 'City', values: (r) => [r.city.trim() || NONE], word: none('No city') },
  { key: 'programme', label: 'Programme', values: (r) => (r.programmes.length ? r.programmes.map((p) => p.name) : [NONE]), word: none('No programme') },
  { key: 'revenue', label: 'Revenue', values: (r) => [revenueOf(r) ? 'known' : 'unknown'], word: (v) => (v === 'known' ? 'Revenue known' : 'No revenue'), order: ['known', 'unknown'] },
  { key: 'team', label: 'Team', values: (r) => [profileOf(r).teamSize != null ? 'known' : 'unknown'], word: (v) => (v === 'known' ? 'Team size known' : 'No team size'), order: ['known', 'unknown'] },
  {
    key: 'sheet',
    label: 'Sheet',
    values: (r) => {
      const d = profileDone(profileOf(r));
      return [d === 100 ? 'full' : d >= 60 ? 'most' : 'little'];
    },
    word: (v) => ({ full: 'Complete', most: '60–99 %', little: 'Under 60 %' })[v] ?? v,
    order: ['full', 'most', 'little'],
  },
  { key: 'contact', label: 'Contact', values: (r) => [r.holders.length ? 'with' : 'without'], word: (v) => (v === 'with' ? 'With a contact' : 'No contact'), order: ['with', 'without'] },
];

const PERSON_COLUMNS: Column[] = [
  { key: 'programme', label: 'Programme', values: (r) => (r.programmes.length ? r.programmes.map((p) => p.name) : [NONE]), word: none('No programme') },
  { key: 'org', label: 'Organisation', values: (r) => (r.orgs.length ? r.orgs.map((o) => o.name) : [NONE]), word: none('No organisation') },
  { key: 'city', label: 'City', values: (r) => [r.city.trim() || NONE], word: none('No city') },
  {
    key: 'contact',
    label: 'Contact',
    values: (r) => [r.emails[0] && r.phones[0] ? 'both' : r.emails[0] ? 'email' : r.phones[0] ? 'phone' : 'nothing'],
    word: (v) => ({ both: 'Email and phone', email: 'Email only', phone: 'Phone only', nothing: 'No contact' })[v] ?? v,
    order: ['both', 'email', 'phone', 'nothing'],
  },
  {
    key: 'account',
    label: 'Account',
    values: (r) => [r.account?.state ?? 'none'],
    word: (v) => ({ claimed: 'Active', invited: 'Invited', unclaimed: 'Not invited yet', disabled: 'Disabled', none: 'No account' })[v] ?? v,
    order: ['claimed', 'invited', 'unclaimed', 'disabled', 'none'],
  },
];

export type ColumnPicks = Record<string, string>;

export const columnsFor = (isOrg: boolean) => (isOrg ? ORG_COLUMNS : PERSON_COLUMNS);

/** Ce que les filtres choisis gardent : toutes les colonnes à la fois. */
export function matchesColumns(isOrg: boolean, picks: ColumnPicks, r: RecordRow): boolean {
  return columnsFor(isOrg).every((c) => !picks[c.key] || c.values(r).includes(picks[c.key]!));
}

export function ColumnFilters({
  isOrg,
  rows,
  picks,
  onChange,
}: {
  isOrg: boolean;
  /** Ce que la page montre, pour compter chaque valeur. */
  rows: RecordRow[];
  picks: ColumnPicks;
  onChange: (next: ColumnPicks) => void;
}) {
  const active = Object.values(picks).filter(Boolean).length;
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {columnsFor(isOrg).map((c) => {
        const counts = new Map<string, number>();
        rows.forEach((r) => new Set(c.values(r)).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
        const picked = picks[c.key] ?? '';
        if (picked && !counts.has(picked)) counts.set(picked, 0);
        const word = c.word ?? ((v: string) => v);
        const values = [...counts.keys()].sort((a, b) =>
          c.order
            ? c.order.indexOf(a) - c.order.indexOf(b)
            : Number(a === NONE) - Number(b === NONE) || word(a).localeCompare(word(b), 'fr'),
        );
        if (values.length < 2 && !picked) return null;
        return (
          <select
            key={c.key}
            className="select"
            style={{ width: 'auto', maxWidth: 200, fontSize: 12.5, borderColor: picked ? 'var(--blue)' : undefined }}
            value={picked}
            aria-label={c.label}
            onChange={(e) => onChange({ ...picks, [c.key]: e.target.value })}
          >
            <option value="">{c.label}: any</option>
            {values.map((v) => (
              <option key={v} value={v}>
                {word(v)} ({counts.get(v)})
              </option>
            ))}
          </select>
        );
      })}
      {active > 0 && (
        <button className="linkish" style={{ fontSize: 12.5 }} onClick={() => onChange({})}>
          Clear {active} filter{active === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
