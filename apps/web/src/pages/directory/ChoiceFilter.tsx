/**
 * Un filtre à choix multiple pour la grille — ce que la version gratuite d'AG
 * Grid n'a pas.
 *
 * Pour une colonne aux valeurs fermées (secteur, maturité, ville, rôles,
 * programmes) : la liste de ce qui s'y trouve, avec combien de lignes chacune,
 * et on coche. Une ligne passe si l'une de ses valeurs est cochée — une
 * organisation à deux programmes passe pour l'un comme pour l'autre.
 */
import type { IDoesFilterPassParams } from 'ag-grid-community';
import { useGridFilter, type CustomFilterProps, type CustomFloatingFilterProps } from 'ag-grid-react';
import { useCallback, useMemo, useState } from 'react';
import { PopCard } from '../../ui/PopCard';
import type { RecordRow } from './DirectoryPage';

/** Ce que la colonne donne à son filtre : les valeurs d'une ligne, et toutes celles de la liste. */
export interface ChoiceParams {
  valuesOf: (row: RecordRow) => string[];
  options: { value: string; count: number }[];
}

type Model = string[] | null;
const NONE = '';
const shown = (v: string) => (v === NONE ? 'None' : v);

/* Le filtre lui-même : la grille lui demande si une ligne passe. */
export function ChoiceFilter(props: CustomFilterProps<RecordRow, unknown, Model> & ChoiceParams) {
  const { model, onModelChange, valuesOf, options } = props;
  const doesFilterPass = useCallback(
    (p: IDoesFilterPassParams<RecordRow>) => {
      if (!model?.length || !p.data) return true;
      const vals = valuesOf(p.data);
      return (vals.length ? vals : [NONE]).some((v) => model.includes(v));
    },
    [model, valuesOf],
  );
  useGridFilter({ doesFilterPass });
  return (
    <div style={{ padding: 10, width: 260 }}>
      <Choices options={options} picked={model ?? []} onChange={(next) => onModelChange(next.length ? next : null)} />
    </div>
  );
}

/* Sous l'en-tête : un menu déroulant, « All » ou ce qui est coché. */
export function ChoiceFloating(props: CustomFloatingFilterProps & { filterParams: ChoiceParams }) {
  const { model, onModelChange } = props as CustomFloatingFilterProps & { model: Model };
  const options = props.filterParams.options;
  const picked = model ?? [];
  const label = !picked.length ? 'All' : picked.length <= 2 ? picked.map(shown).join(', ') : `${picked.length} selected`;
  return (
    <PopCard
      className={picked.length ? 'choice-drop on' : 'choice-drop'}
      label={
        <>
          <span className="choice-drop-text">{label}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </>
      }
      card={() => <Choices options={options} picked={picked} onChange={(next) => onModelChange(next.length ? next : null)} />}
    />
  );
}

function Choices({
  options,
  picked,
  onChange,
}: {
  options: ChoiceParams['options'];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => shown(o.value).toLowerCase().includes(q)) : options;
  }, [options, query]);
  const flip = (v: string) => onChange(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);
  return (
    <div className="stack" style={{ gap: 6 }}>
      {options.length > 8 && (
        <input className="input" autoFocus placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ height: 34 }} />
      )}
      <div className="choice-list">
        {list.map((o) => (
          <label key={o.value} className="choice-row">
            <input type="checkbox" checked={picked.includes(o.value)} onChange={() => flip(o.value)} />
            <span className={o.value === NONE ? 'faint' : undefined}>{shown(o.value)}</span>
            <span className="num faint">{o.count}</span>
          </label>
        ))}
        {!list.length && <span className="faint" style={{ fontSize: 12.5, padding: 6 }}>Nothing matches.</span>}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="linkish" style={{ fontSize: 12.5 }} onClick={() => onChange(list.map((o) => o.value))}>
          Select all
        </button>
        <button className="linkish" style={{ fontSize: 12.5 }} disabled={!picked.length} onClick={() => onChange([])}>
          Clear
        </button>
      </div>
    </div>
  );
}

/** Les options d'une colonne : chaque valeur présente, avec son nombre de lignes, la plus fréquente d'abord. */
export function optionsOf(rows: RecordRow[], valuesOf: (row: RecordRow) => string[]): ChoiceParams['options'] {
  const count = new Map<string, number>();
  for (const r of rows) {
    const vals = valuesOf(r);
    for (const v of vals.length ? vals : [NONE]) count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()]
    .map(([value, n]) => ({ value, count: n }))
    .sort((a, b) => (a.value === NONE ? 1 : b.value === NONE ? -1 : b.count - a.count || a.value.localeCompare(b.value)));
}
