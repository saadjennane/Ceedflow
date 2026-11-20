/// <reference types="vite/client" />
/**
 * L'annuaire en grille — organisations ou individus — AG Grid, version Community.
 *
 * Trier en cliquant un en-tête, filtrer sous chaque colonne, redimensionner,
 * déplacer, figer le nom à gauche, cocher pour exporter. Ce que la version
 * gratuite n'a pas — le panneau des colonnes — est le nôtre, à droite : chaque
 * colonne s'y coche et s'y range. La mise en page de la grille (ordre,
 * largeurs, colonnes cachées, tri) est gardée dans ce navigateur.
 */
import { ACCOUNT_STATE_LABEL, MATURITY_LEVELS, SECTORS, profileDone, profileOf } from '@ceed/shared';
import {
  CellApiModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  CustomFilterModule,
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
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';
import { download, toWorkbook, type Cell } from '../../lib/xlsx';
import { Icon } from '../../ui/Icon';
import { CopyLine, PopCard } from '../../ui/PopCard';
import { api } from '../../lib/api';
import { colourOf, initialsOf } from '../../ui/Showcase';
import type { RecordRow } from './DirectoryPage';
import { ChoiceFilter, ChoiceFloating, optionsOf } from './ChoiceFilter';
import { AccountDot, Mark, SheetRing, Trend, revenueOf, short, word } from './DirectoryViews';
import { AccountBadge } from './AccountCard';

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
  CustomFilterModule,
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
  return (
    <Link to={`/directory/${data.id}`} className="dir-who grid-who">
      <Mark r={data} size={30} />
      <span className="dir-min">
        <b>{data.name}</b>
        {data.testOwner && <span className="badge warn" style={{ marginLeft: 6 }}>TEST</span>}
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
  /* D'un clic : sa fiche en bref — son mail et ses numéros à copier, et le lien vers son profil. */
  const card = (close: () => void) => (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 4 }}>
        <span className="dir-av" style={{ background: colourOf(holder.name), width: 32, height: 32, fontSize: 12 }}>{initialsOf(holder.name)}</span>
        <span className="stack" style={{ gap: 0, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>{holder.name}</b>
          <span className="faint" style={{ fontSize: 12 }}>{[holder.role, data.name].filter(Boolean).join(' · ')}</span>
        </span>
      </div>
      {holder.email && <CopyLine icon="mail" text={holder.email} href={`mailto:${holder.email}`} />}
      {holder.phones.map((ph) => (
        <CopyLine key={ph} icon="phone" text={ph} href={`tel:${ph.replace(/\s+/g, '')}`} />
      ))}
      {!holder.email && !holder.phones.length && <span className="faint" style={{ fontSize: 12.5 }}>No email or phone on file.</span>}
      {data.holders.length > 1 && (
        <span className="faint" style={{ fontSize: 12 }}>Also: {data.holders.slice(1).map((h) => h.name).join(', ')}</span>
      )}
      <Link to={`/directory/${holder.id}`} className="btn sm" style={{ marginTop: 6, justifyContent: 'center' }} onClick={close}>
        <Icon name="users" size={13} /> Profile
      </Link>
    </div>
  );
  return (
    <span className="dir-contact">
      <span className="dir-av" style={{ background: colourOf(holder.name) }}>{initialsOf(holder.name)}</span>
      <PopCard label={holder.name} card={card} />
      <AccountDot account={data.account} />
      {data.holders.length > 1 && <span className="faint"> +{data.holders.length - 1}</span>}
    </span>
  );
}

/* Les programmes : leurs noms, rien d'autre. */
function ProgrammesCell({ data }: Renderer) {
  if (!data?.programmes.length) return <span className="faint">—</span>;
  const names = data.programmes.map((p) => p.name).join(', ');
  return <span className="grid-names" title={names}>{names}</span>;
}

const activityOf = (r: RecordRow) => (r.lastActivity ?? r.createdAt).slice(0, 10);

/** Un mail ou un numéro dans sa cellule : on clique pour écrire ou appeler, l'icône copie. */
function CopyCell({ value, href }: { value: string; href: string }) {
  const [done, setDone] = useState(false);
  if (!value) return <span className="faint">—</span>;
  return (
    <span className="grid-copy">
      <a href={href} className="grid-copy-text" title={value}>{value}</a>
      <button
        className="btn ghost icon sm"
        aria-label={done ? 'Copied' : `Copy ${value}`}
        title={done ? 'Copied' : 'Copy'}
        onClick={() => {
          const ok = () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1400);
          };
          navigator.clipboard?.writeText(value).then(ok, ok);
        }}
      >
        <Icon name={done ? 'check' : 'copy'} size={12} />
      </button>
    </span>
  );
}

function AccountCell({ data }: Renderer) {
  if (!data) return null;
  const a = data.account;
  return (
    <span className="grid-account">
      <AccountBadge account={a} />
      {a && <span className="faint">{a.lastSeenAt ? `seen ${formatDate(a.lastSeenAt)}` : `opened ${formatDate(a.createdAt)}`}</span>}
    </span>
  );
}

/** Qui l'a ajoutée : un collègue, la personne elle-même, ou un fichier. */
const addedBy = (r: RecordRow) =>
  r.createdByName || (r.origin === 'signup' ? 'Themselves' : r.origin === 'import' ? 'File import' : 'Not recorded');

const accountWord = (r: RecordRow) => (r.account ? ACCOUNT_STATE_LABEL[r.account.state] : 'No account');
const dateColumn = (colId: string, headerName: string, get: (r: RecordRow) => string, hide = false): ColDef<RecordRow> => ({
  colId, headerName, width: 130, hide, filter: 'agDateColumnFilter',
  valueGetter: (p) => (p.data ? get(p.data) : ''),
  valueFormatter: (p) => (p.value ? formatDate(p.value as string) : ''),
  filterParams: {
    comparator: (day: Date, cell: string) => {
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      return cell === iso ? 0 : cell < iso ? -1 : 1;
    },
  },
});

/** Les individus : qui, ce qu'ils font pour CEED, où ils travaillent, et s'ils peuvent entrer. */
const PERSON_COLUMNS: ColDef<RecordRow>[] = [
  {
    colId: 'name', headerName: 'Name', pinned: 'left', lockPinned: true, lockVisible: true, width: 260, minWidth: 180,
    valueGetter: (p) => p.data?.name ?? '', cellRenderer: NameCell, filter: 'agTextColumnFilter',
  },
  { colId: 'roles', headerName: 'Roles', width: 150, valueGetter: (p) => p.data?.roles.join(', ') ?? '' },
  {
    colId: 'orgs', headerName: 'Organisations', width: 200,
    valueGetter: (p) => p.data?.orgs.map((o) => o.name).join(', ') ?? '',
    cellRenderer: (p: Renderer) => (p.value ? <span className="grid-names" title={p.value as string}>{p.value as string}</span> : <span className="faint">—</span>),
  },
  { colId: 'job', headerName: 'Job title', width: 160, hide: true, valueGetter: (p) => (p.data ? p.data.jobTitle || p.data.orgs[0]?.role || '' : '') },
  { colId: 'programmes', headerName: 'Programmes', width: 200, valueGetter: (p) => p.data?.programmes.map((x) => x.name).join(', ') ?? '', cellRenderer: ProgrammesCell },
  { colId: 'city', headerName: 'City', width: 130, valueGetter: (p) => p.data?.city ?? '' },
  {
    colId: 'email', headerName: 'Email', width: 230, valueGetter: (p) => p.data?.emails[0] ?? p.data?.email ?? '',
    cellRenderer: (p: Renderer) => <CopyCell value={(p.value as string) ?? ''} href={`mailto:${p.value as string}`} />,
  },
  {
    colId: 'phone', headerName: 'Phone', width: 170, valueGetter: (p) => p.data?.phones[0] ?? '',
    cellRenderer: (p: Renderer) => <CopyCell value={(p.value as string) ?? ''} href={`tel:${String(p.value ?? '').replace(/\s+/g, '')}`} />,
  },
  { colId: 'account', headerName: 'Account', width: 190, valueGetter: (p) => (p.data ? accountWord(p.data) : ''), cellRenderer: AccountCell },
  { colId: 'sessions', headerName: 'Sessions', width: 110, type: 'rightAligned', filter: 'agNumberColumnFilter', valueGetter: (p) => p.data?.sessions ?? 0 },
  { colId: 'evaluations', headerName: 'Evaluations', width: 120, type: 'rightAligned', filter: 'agNumberColumnFilter', hide: true, valueGetter: (p) => p.data?.evaluations ?? 0 },
  { colId: 'tags', headerName: 'Tags', width: 160, hide: true, valueGetter: (p) => p.data?.tags.join(', ') ?? '' },
  { colId: 'addedBy', headerName: 'Added by', width: 160, hide: true, valueGetter: (p) => (p.data ? addedBy(p.data) : '') },
  { colId: 'viaProgram', headerName: 'Via programme', width: 170, hide: true, valueGetter: (p) => p.data?.sourceProgramName ?? '' },
  dateColumn('created', 'Added', (r) => r.createdAt.slice(0, 10), true),
];

/** Les organisations. */
const ORG_COLUMNS: ColDef<RecordRow>[] = [
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
  { colId: 'addedBy', headerName: 'Added by', width: 160, hide: true, valueGetter: (p) => (p.data ? addedBy(p.data) : '') },
  { colId: 'viaProgram', headerName: 'Via programme', width: 170, hide: true, valueGetter: (p) => p.data?.sourceProgramName ?? '' },
  { colId: 'created', headerName: 'Added', width: 120, hide: true, valueGetter: (p) => p.data?.createdAt.slice(0, 10) ?? '', valueFormatter: (p) => (p.value ? formatDate(p.value as string) : '') },
];

/* Les colonnes de la grille elle-même (cases à cocher) : jamais dans le panneau. */
const isService = (id: string) => id.startsWith('ag-Grid-');

/* Les colonnes aux valeurs fermées : un menu déroulant à choix multiple plutôt qu'un champ libre. */
const CHOICES: Record<string, (r: RecordRow) => string[]> = {
  roles: (r) => r.roles,
  sector: (r) => [word(SECTORS, profileOf(r).sector)].filter(Boolean),
  maturity: (r) => [word(MATURITY_LEVELS, profileOf(r).maturity)].filter(Boolean),
  city: (r) => [r.city.trim()].filter(Boolean),
  programmes: (r) => r.programmes.map((p) => p.name),
  orgs: (r) => r.orgs.map((o) => o.name),
  account: (r) => [accountWord(r)],
  addedBy: (r) => [addedBy(r)],
  viaProgram: (r) => [r.sourceProgramName ?? ''].filter(Boolean),
};

/** Ce qui change d'un annuaire à l'autre : ses colonnes, où sa vue est gardée, le nom de son export. */
const KINDS = {
  org: { columns: ORG_COLUMNS, store: 'dir-org-grid', filters: 'dir-org-filters', sheet: 'Organisations', file: 'organisations.xlsx' },
  person: { columns: PERSON_COLUMNS, store: 'dir-person-grid', filters: 'dir-person-filters', sheet: 'Individuals', file: 'individuals.xlsx' },
} as const;

const loadState = (store: string): ColumnState[] | null => {
  try {
    const raw = localStorage.getItem(store);
    return raw ? (JSON.parse(raw) as ColumnState[]) : null;
  } catch {
    return null;
  }
};
/* Sur le compte : chacun retrouve sa vue sur n'importe quel poste. Le
   navigateur en garde une copie, pour l'afficher sans attendre le serveur. */
const pending = new Map<string, number>();
const saveState = (store: string, state: ColumnState[]) => {
  try {
    localStorage.setItem(store, JSON.stringify(state));
  } catch {
    /* rien à garder */
  }
  const was = pending.get(store);
  if (was) window.clearTimeout(was);
  pending.set(
    store,
    window.setTimeout(() => {
      void api.put(`/api/me/prefs/${store}`, { value: state }).catch(() => undefined);
    }, 600),
  );
};
const fetchState = (store: string) =>
  api.get<{ value: ColumnState[] | null }>(`/api/me/prefs/${store}`).then((r) => r.value).catch(() => null);

export function DirectoryGrid({
  kind,
  rows,
  onPicked,
  pickedActions,
}: {
  kind: 'org' | 'person';
  rows: RecordRow[];
  /** Ce qui est coché, pour la page — inviter les individus choisis. */
  onPicked?: (rows: RecordRow[]) => void;
  /** Ce qu'on fait de la sélection, en plus de l'exporter. */
  pickedActions?: (rows: RecordRow[]) => ReactNode;
}) {
  const conf = KINDS[kind];
  const STORE = conf.store;
  const grid = useRef<GridApi<RecordRow> | null>(null);
  const [picked, setPicked] = useState<RecordRow[]>([]);
  const [shown, setShown] = useState<RecordRow[]>(rows);
  const [panel, setPanel] = useState(false);
  const [cols, setCols] = useState<{ id: string; label: string; on: boolean; fixed: boolean }[]>([]);
  const [filtered, setFiltered] = useState(0);
  /* Toute la hauteur de l'écran sous la barre d'outils : la grille défile en elle-même. */
  const fill = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(560);
  useLayoutEffect(() => {
    const fit = () => {
      const top = fill.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(420, window.innerHeight - top - 52));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  /* La rangée de filtres s'ouvre et se ferme d'un bouton ; on s'en souvient dans ce navigateur. */
  const [filtersOn, setFiltersOnState] = useState(() => {
    try {
      return localStorage.getItem(conf.filters) === 'on';
    } catch {
      return false;
    }
  });
  const setFiltersOn = (on: boolean) => {
    setFiltersOnState(on);
    try {
      localStorage.setItem(conf.filters, on ? 'on' : 'off');
    } catch {
      /* rien à garder */
    }
  };
  const defaultColDef = useMemo<ColDef<RecordRow>>(
    () => ({ sortable: true, resizable: true, filter: 'agTextColumnFilter', floatingFilter: filtersOn, suppressHeaderMenuButton: true }),
    [filtersOn],
  );
  /* Les colonnes, avec pour celles aux valeurs fermées la liste de ce qui s'y trouve. */
  const columnDefs = useMemo<ColDef<RecordRow>[]>(
    () =>
      conf.columns.map((c) => {
        const valuesOf = c.colId ? CHOICES[c.colId] : undefined;
        if (!valuesOf) return c;
        return {
          ...c,
          filter: ChoiceFilter,
          filterParams: { valuesOf, options: optionsOf(rows, valuesOf) },
          floatingFilterComponent: ChoiceFloating,
          suppressFloatingFilterButton: true,
        };
      }),
    [rows, conf.columns],
  );

  /* Ce que le panneau montre : les colonnes dans l'ordre de la grille. */
  const readColumns = useCallback(() => {
    const api = grid.current;
    if (!api) return;
    setCols(
      (api.getColumns() ?? []).filter((c) => !isService(c.getColId())).map((c) => ({
        id: c.getColId(),
        label: c.getColDef().headerName ?? c.getColId(),
        on: c.isVisible(),
        fixed: c.getColId() === 'name',
      })),
    );
  }, []);

  const remember = useCallback(() => {
    if (grid.current) saveState(STORE, grid.current.getColumnState());
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

  /* Monter ou descendre d'un cran : échanger sa place avec sa voisine dans
     l'ordre réel de la grille. Un index calculé sur la liste du panneau tombait
     à côté — la grille compte aussi sa colonne de cases à cocher. */
  const move = (id: string, d: number) => {
    const api = grid.current;
    if (!api) return;
    const state = api.getColumnState();
    const movable = state.filter((c) => !isService(c.colId) && c.colId !== 'name').map((c) => c.colId);
    const at = movable.indexOf(id);
    const other = movable[at + d];
    if (at < 0 || !other) return; /* le nom reste premier, rien ne passe après la dernière */
    const i = state.findIndex((c) => c.colId === id);
    const j = state.findIndex((c) => c.colId === other);
    const next = [...state];
    [next[i], next[j]] = [next[j]!, next[i]!];
    api.applyColumnState({ state: next, applyOrder: true });
    remember();
  };

  const totals = useMemo(() => {
    if (kind !== 'org') return '';
    const byCurrency = new Map<string, number>();
    for (const r of shown) {
      const rev = revenueOf(r);
      if (rev) byCurrency.set(rev.currency, (byCurrency.get(rev.currency) ?? 0) + rev.amount);
    }
    return [...byCurrency.entries()].map(([c, n]) => `${short(n)} ${c}`).join(' · ');
  }, [shown, kind]);

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
    download(toWorkbook([{ name: conf.sheet, rows: [head, ...body] }]), conf.file);
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        {picked.length > 0 && (
          <span className="grid-picked">
            {picked.length} selected
            {pickedActions?.(picked)}
            <button className="btn sm" onClick={() => exportRows(picked)}>
              <Icon name="download" size={13} /> Export selection
            </button>
            <button className="linkish" style={{ fontSize: 12.5 }} onClick={() => grid.current?.deselectAll()}>
              Clear
            </button>
          </span>
        )}
        <div className="spacer" />
        <button
          className={filtersOn ? 'btn sm on' : 'btn sm'}
          aria-pressed={filtersOn}
          onClick={() => setFiltersOn(!filtersOn)}
          title={filtersOn ? 'Hide the filters under the headers' : 'Filter by any column'}
        >
          <Icon name="filter" size={13} /> Filter
          {filtered > 0 && <span className="nav-count">{filtered}</span>}
        </button>
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
        <div className="grid-main" ref={fill} style={{ height }}>
          <AgGridReact<RecordRow>
            theme={theme}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(p) => p.data.id}
            rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, selectAll: 'filtered', enableClickSelection: false }}
            /* La case à cocher, figée à gauche du nom — jamais ailleurs, même en déplaçant les colonnes. */
            selectionColumnDef={{ pinned: 'left', lockPinned: true, width: 44, minWidth: 44, maxWidth: 44, suppressMovable: true, resizable: false, sortable: false }}
            suppressCellFocus
            animateRows={false}
            onGridReady={(e) => {
              grid.current = e.api;
              const kept = loadState(STORE);
              if (kept) e.api.applyColumnState({ state: kept, applyOrder: true });
              readColumns();
              /* Puis celle du compte, qui fait foi. */
              void fetchState(STORE).then((saved) => {
                if (!saved || e.api.isDestroyed()) return;
                e.api.applyColumnState({ state: saved, applyOrder: true });
                try {
                  localStorage.setItem(STORE, JSON.stringify(saved));
                } catch {
                  /* rien à garder */
                }
                readColumns();
              });
              refreshCounts();
            }}
            onSelectionChanged={(e) => {
              const now = e.api.getSelectedRows();
              setPicked(now);
              onPicked?.(now);
            }}
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
            <p className="faint" style={{ fontSize: 12, margin: 0 }}>Drag a header to move it, its edge to resize it. Kept on your account.</p>
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
