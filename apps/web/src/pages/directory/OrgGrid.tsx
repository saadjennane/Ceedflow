/// <reference types="vite/client" />
/**
 * Les organisations en grille — AG Grid, version Community.
 *
 * Trier en cliquant un en-tête, filtrer sous chaque colonne, redimensionner,
 * déplacer, figer le nom à gauche, cocher pour exporter. Ce que la version
 * gratuite n'a pas — le panneau des colonnes — est le nôtre, à droite : chaque
 * colonne s'y coche et s'y range. La mise en page de la grille (ordre,
 * largeurs, colonnes cachées, tri) est gardée dans ce navigateur.
 */
import { MATURITY_LEVELS, SECTORS, profileDone, profileOf } from '@ceed/shared';
import {
  CellApiModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  DateFilterModule,
  ModuleRegistry,
  NumberFilterModule,
  RowApiModule,
  RowSelectionModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type ColumnState,
  type GridApi,
  type ICellRendererParams,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';
import { download, toWorkbook, type Cell } from '../../lib/xlsx';
import { Icon } from '../../ui/Icon';
import { colourOf, initialsOf } from '../../ui/Showcase';
import type { RecordRow } from './DirectoryPage';
import { AccountDot, Mark, SheetRing, Trend, revenueOf, short, word } from './DirectoryViews';

/* Seulement ce que la grille sert — pas toute la librairie : moins à télécharger.
   Trier, déplacer, redimensionner et figer sont dans le cœur. Le module de
   validation, qui nomme un module oublié, ne sert qu'en développement. */
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  RowApiModule,
  ColumnApiModule,
  CellApiModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  RowSelectionModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

/* Les couleurs viennent des jetons de l'application : la grille suit le mode sombre. */
const theme = themeQuartz.withParams({
  accentColor: 'var(--blue)',
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--ink)',
  headerBackgroundColor: 'var(--canvas)',
  headerTextColor: 'var(--ink-2)',
  headerFontWeight: 600,
  borderColor: 'var(--line)',
  rowHoverColor: 'var(--wash)',
  selectedRowBackgroundColor: 'var(--blue-soft)',
  oddRowBackgroundColor: 'var(--surface)',
  fontFamily: 'inherit',
  fontSize: 13,
  headerFontSize: 12.5,
  rowHeight: 52,
  headerHeight: 42,
  wrapperBorderRadius: 12,
  inputBorder: { color: 'var(--line)' },
  inputFocusBorder: { color: 'var(--blue)' },
});

type Renderer = ICellRendererParams<RecordRow>;

function NameCell({ data }: Renderer) {
  if (!data) return null;
  const p = profileOf(data);
  return (
    <Link to={`/directory/${data.id}`} className="dir-who grid-who">
      <Mark r={data} size={30} />
      <span className="dir-min">
        <b>{data.name}</b>
        {data.testOwner && <span className="badge warn" style={{ marginLeft: 6 }}>TEST</span>}
        <span className="faint dir-clip">{p.pitch || data.email || ''}</span>
      </span>
    </Link>
  );
}

function SectorCell({ data }: Renderer) {
  if (!data) return null;
  const s = profileOf(data).sector;
  return s ? <span className="badge">{word(SECTORS, s) || s}</span> : <span className="faint">—</span>;
}

function RevenueCell({ data }: Renderer) {
  const rev = data ? revenueOf(data) : null;
  if (!rev) return <span className="faint">—</span>;
  return (
    <span className="grid-rev">
      <b className="num">{short(rev.amount)}</b> <span className="faint" style={{ fontSize: 11 }}>{rev.currency}</span>{' '}
      <Trend delta={rev.delta} />
    </span>
  );
}

function ContactCell({ data }: Renderer) {
  const holder = data?.holders[0];
  if (!data || !holder) return <span className="badge warn">None</span>;
  return (
    <span className="dir-contact" title={[holder.email, ...holder.phones].filter(Boolean).join(' · ')}>
      <span className="dir-av" style={{ background: colourOf(holder.name) }}>{initialsOf(holder.name)}</span>
      <Link to={`/directory/${holder.id}`}>{holder.name}</Link>
      <AccountDot account={data.account} />
      {data.holders.length > 1 && <span className="faint"> +{data.holders.length - 1}</span>}
    </span>
  );
}

/* Les programmes en toutes lettres : une pastille par programme, son nom et où elle en est. */
const STATE_WORD = { now: 'now', alumni: 'alumni', applied: 'applied' } as const;
function ProgrammesCell({ data }: Renderer) {
  if (!data?.programmes.length) return <span className="faint">—</span>;
  return (
    <span className="grid-pms" title={data.programmes.map((p) => `${p.name} — ${STATE_WORD[p.state]}`).join('\n')}>
      {data.programmes.map((p) => (
        <span key={p.name} className="grid-pm">
          <i style={{ background: p.colour }} />
          {p.name} <small>{STATE_WORD[p.state]}</small>
        </span>
      ))}
    </span>
  );
}

const activityOf = (r: RecordRow) => (r.lastActivity ?? r.createdAt).slice(0, 10);

/** Les colonnes : l'identifiant reste stable — c'est lui qu'on garde dans le navigateur. */
const COLUMNS: ColDef<RecordRow>[] = [
  {
    colId: 'name', headerName: 'Organisation', pinned: 'left', lockPinned: true, lockVisible: true, width: 290, minWidth: 200,
    valueGetter: (p) => p.data?.name ?? '', cellRenderer: NameCell, filter: 'agTextColumnFilter',
  },
  { colId: 'roles', headerName: 'Roles', width: 150, valueGetter: (p) => p.data?.roles.join(', ') ?? '' },
  { colId: 'sector', headerName: 'Sector', width: 150, valueGetter: (p) => (p.data ? word(SECTORS, profileOf(p.data).sector) : ''), cellRenderer: SectorCell },
  { colId: 'maturity', headerName: 'Maturity', width: 130, valueGetter: (p) => (p.data ? word(MATURITY_LEVELS, profileOf(p.data).maturity) : '') },
  { colId: 'city', headerName: 'City', width: 130, valueGetter: (p) => p.data?.city ?? '' },
  {
    colId: 'programmes', headerName: 'Programmes',
    valueGetter: (p) => p.data?.programmes.map((x) => x.name).join(', ') ?? '',
    cellRenderer: ProgrammesCell, width: 230,
  },
  {
    colId: 'revenue', headerName: 'Revenue', width: 150, type: 'rightAligned', filter: 'agNumberColumnFilter',
    valueGetter: (p) => (p.data ? revenueOf(p.data)?.amount ?? null : null), cellRenderer: RevenueCell,
  },
  {
    colId: 'team', headerName: 'Team', width: 100, type: 'rightAligned', filter: 'agNumberColumnFilter',
    valueGetter: (p) => (p.data ? profileOf(p.data).teamSize : null),
  },
  {
    colId: 'sheet', headerName: 'Sheet', width: 110, filter: 'agNumberColumnFilter',
    valueGetter: (p) => (p.data ? profileDone(profileOf(p.data)) : null),
    cellRenderer: (p: Renderer) => (p.value === null || p.value === undefined ? null : <SheetRing value={p.value as number} />),
  },
  {
    colId: 'contact', headerName: 'Contact', width: 210,
    valueGetter: (p) => p.data?.holders[0]?.name ?? '', cellRenderer: ContactCell,
  },
  { colId: 'email', headerName: 'Email', width: 200, hide: true, valueGetter: (p) => p.data?.email ?? '' },
  { colId: 'tags', headerName: 'Tags', width: 160, hide: true, valueGetter: (p) => p.data?.tags.join(', ') ?? '' },
  {
    colId: 'activity', headerName: 'Activity', width: 130, filter: 'agDateColumnFilter',
    valueGetter: (p) => (p.data ? activityOf(p.data) : ''),
    valueFormatter: (p) => (p.value ? formatDate(p.value as string) : ''),
    filterParams: {
      comparator: (day: Date, cell: string) => {
        const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        return cell === iso ? 0 : cell < iso ? -1 : 1;
      },
    },
  },
  { colId: 'created', headerName: 'Added', width: 120, hide: true, valueGetter: (p) => p.data?.createdAt.slice(0, 10) ?? '', valueFormatter: (p) => (p.value ? formatDate(p.value as string) : '') },
];

const STORE = 'dir-org-grid';
const loadState = (): ColumnState[] | null => {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as ColumnState[]) : null;
  } catch {
    return null;
  }
};
const saveState = (state: ColumnState[]) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* rien à garder */
  }
};

export function OrgGrid({ rows }: { rows: RecordRow[] }) {
  const grid = useRef<GridApi<RecordRow> | null>(null);
  const [picked, setPicked] = useState<RecordRow[]>([]);
  const [shown, setShown] = useState<RecordRow[]>(rows);
  const [panel, setPanel] = useState(false);
  const [cols, setCols] = useState<{ id: string; label: string; on: boolean; fixed: boolean }[]>([]);
  const [filtered, setFiltered] = useState(0);

  const defaultColDef = useMemo<ColDef<RecordRow>>(
    () => ({ sortable: true, resizable: true, filter: 'agTextColumnFilter', floatingFilter: true, suppressHeaderMenuButton: true }),
    [],
  );

  /* Ce que le panneau montre : les colonnes dans l'ordre de la grille. */
  const readColumns = useCallback(() => {
    const api = grid.current;
    if (!api) return;
    setCols(
      (api.getColumns() ?? []).map((c) => ({
        id: c.getColId(),
        label: c.getColDef().headerName ?? c.getColId(),
        on: c.isVisible(),
        fixed: c.getColId() === 'name',
      })),
    );
  }, []);

  const remember = useCallback(() => {
    if (grid.current) saveState(grid.current.getColumnState());
    readColumns();
  }, [readColumns]);

  const refreshCounts = useCallback(() => {
    const api = grid.current;
    if (!api) return;
    const out: RecordRow[] = [];
    api.forEachNodeAfterFilterAndSort((n) => n.data && out.push(n.data));
    setShown(out);
    setFiltered(Object.keys(api.getFilterModel() ?? {}).length);
  }, []);

  const move = (id: string, d: number) => {
    const api = grid.current;
    if (!api) return;
    const order = cols.map((c) => c.id);
    const at = order.indexOf(id);
    const to = at + d;
    if (to < 1 || to >= order.length) return; /* le nom reste premier */
    api.moveColumns([id], to);
    remember();
  };

  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const r of shown) {
      const rev = revenueOf(r);
      if (rev) byCurrency.set(rev.currency, (byCurrency.get(rev.currency) ?? 0) + rev.amount);
    }
    return [...byCurrency.entries()].map(([c, n]) => `${short(n)} ${c}`).join(' · ');
  }, [shown]);

  const exportRows = (list: RecordRow[]) => {
    const api = grid.current;
    if (!api) return;
    const visible = (api.getAllDisplayedColumns() ?? []).filter((c) => c.getColDef().headerName);
    const head: Cell[] = visible.map((c) => c.getColDef().headerName ?? '');
    const body: Cell[][] = list.map((r) =>
      visible.map((c) => {
        const v = api.getCellValue({ rowNode: api.getRowNode(r.id)!, colKey: c });
        return v === null || v === undefined ? '' : (v as Cell);
      }),
    );
    download(toWorkbook([{ name: 'Organisations', rows: [head, ...body] }]), 'organisations.xlsx');
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        {picked.length > 0 && (
          <span className="grid-picked">
            {picked.length} selected
            <button className="btn sm" onClick={() => exportRows(picked)}>
              <Icon name="download" size={13} /> Export selection
            </button>
            <button className="linkish" style={{ fontSize: 12.5 }} onClick={() => grid.current?.deselectAll()}>
              Clear
            </button>
          </span>
        )}
        <div className="spacer" />
        {filtered > 0 && (
          <button className="linkish" style={{ fontSize: 12.5 }} onClick={() => grid.current?.setFilterModel(null)}>
            Clear column filters ({filtered})
          </button>
        )}
        <button className="btn sm" onClick={() => exportRows(shown)}>
          <Icon name="download" size={13} /> Export
        </button>
        <button className={panel ? 'btn sm on' : 'btn sm'} aria-pressed={panel} onClick={() => setPanel((v) => !v)}>
          <Icon name="grid" size={13} /> Columns
        </button>
      </div>

      <div className="grid-shell">
        <div className="grid-main">
          <AgGridReact<RecordRow>
            theme={theme}
            rowData={rows}
            columnDefs={COLUMNS}
            defaultColDef={defaultColDef}
            getRowId={(p) => p.data.id}
            rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, selectAll: 'filtered', enableClickSelection: false }}
            /* La case à cocher, figée à gauche du nom — jamais ailleurs, même en déplaçant les colonnes. */
            selectionColumnDef={{ pinned: 'left', lockPinned: true, width: 44, minWidth: 44, maxWidth: 44, suppressMovable: true, resizable: false, sortable: false }}
            suppressCellFocus
            animateRows={false}
            onGridReady={(e) => {
              grid.current = e.api;
              const kept = loadState();
              if (kept) e.api.applyColumnState({ state: kept, applyOrder: true });
              readColumns();
              refreshCounts();
            }}
            onSelectionChanged={(e) => setPicked(e.api.getSelectedRows())}
            onModelUpdated={refreshCounts}
            onColumnMoved={(e) => e.finished && remember()}
            onColumnResized={(e) => e.finished && remember()}
            onColumnVisible={remember}
            onSortChanged={remember}
          />
        </div>

        {panel && (
          <aside className="grid-panel" aria-label="Columns">
            <div className="grid-panel-head">
              <b>Columns</b>
              <button className="btn ghost icon sm" aria-label="Close the column panel" onClick={() => setPanel(false)}>
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="grid-panel-list">
              {cols.map((c) => (
                <div key={c.id} className="grid-panel-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={c.on}
                      disabled={c.fixed}
                      onChange={() => {
                        grid.current?.setColumnsVisible([c.id], !c.on);
                        remember();
                      }}
                    />
                    {c.label}
                  </label>
                  {!c.fixed && (
                    <>
                      <button className="btn ghost icon sm" aria-label={`Move ${c.label} up`} onClick={() => move(c.id, -1)}>
                        ↑
                      </button>
                      <button className="btn ghost icon sm" aria-label={`Move ${c.label} down`} onClick={() => move(c.id, 1)}>
                        ↓
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              className="linkish"
              style={{ fontSize: 12.5, padding: '6px 4px' }}
              onClick={() => {
                grid.current?.resetColumnState();
                remember();
              }}
            >
              Default columns
            </button>
            <p className="faint" style={{ fontSize: 12, margin: 0 }}>Drag a header to move it, its edge to resize it. Kept in this browser.</p>
          </aside>
        )}
      </div>

      <div className="grid-status">
        <span>
          {picked.length > 0 ? `${picked.length} selected · ` : ''}
          {shown.length} shown of {rows.length}
        </span>
        {totals && (
          <span>
            Revenue, last known: <b className="num">{totals}</b>
          </span>
        )}
      </div>
    </div>
  );
}
