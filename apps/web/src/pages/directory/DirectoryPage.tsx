import { ORG_SECTIONS, PERSON_SECTIONS, profileDone, profileOf, type DirectoryRecord, type RecordAccount, type RecordKind } from '@ceed/shared';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { cachedList, loadList } from '../../lib/directoryCache';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { ImportModal } from './ImportModal';
import { InviteManyModal } from './InviteManyModal';
import { RecordModal } from './RecordModal';
import { ColumnFilters, matchesColumns, type ColumnPicks } from './ColumnFilters';
import { OrgCards, PersonCards, Tiles, type Tile } from './DirectoryViews';
/* AG Grid pèse son poids : chargé seulement quand la grille s'affiche. */
const DirectoryGrid = lazy(() => import('./DirectoryGrid').then((m) => ({ default: m.DirectoryGrid })));

/** Ce qu'une audience de sourcing rend : qui on écrit, et qui reste muet. */
interface AudienceView {
  audience: { id: string; name: string; kind: string }[];
  silent: string[];
}

/** A record as the list endpoint returns it: with how many affiliations it has. */
export interface RecordRow extends DirectoryRecord {
  contacts: number;
  /** Null for an organisation, and for anybody who has no way in yet. */
  account: RecordAccount | null;
  /** Les organisations qu'une personne tient. Vide pour une organisation. */
  orgs: { id: string; name: string; role: string }[];
  /** Les personnes qui tiennent une organisation. Vide pour une personne. */
  holders: { id: string; name: string; email: string; phones: string[]; role: string }[];
  /** Les programmes finis où elle était encore en lice à la clôture. */
  alumni: number;
  /** Ceux qui tournent et où elle l'est encore. */
  current: string[];
  /** Ses programmes en pastilles : en cours, terminés, candidatures. */
  programmes: { name: string; colour: string; state: 'now' | 'alumni' | 'applied' }[];
  /** Ce qu'une personne a fait pour CEED. */
  sessions: number;
  evaluations: number;
  panels: number;
  /** Le dernier changement sur la fiche d'une organisation. */
  lastActivity: string | null;
  /** Un compte vraiment ouvert — le sien, ou pour une organisation celui d'une personne qui la tient. */
  registered: boolean;
}

/** Ce qu'une tuile du résumé garde de la liste. */
function presetOf(key: string, r: RecordRow): boolean {
  switch (key) {
    case 'startups':
      return r.roles.includes('Startup');
    case 'running':
      return r.programmes.some((p) => p.state === 'now');
    case 'raising':
      return (r.needs ?? []).some((n) => n.active && n.need === 'fundraising');
    case 'complete':
      return profileDone(profileOf(r)) === 100;
    case 'mentors':
      return r.roles.includes('Mentor');
    case 'jury':
      return r.roles.includes('Jury');
    case 'teams':
      return r.orgs.length > 0;
    case 'active':
      return r.account?.state === 'claimed';
    default:
      return true;
  }
}

const isOrgKind = (k: RecordKind) => k === 'org';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function DirectoryPage({ kind }: { kind: RecordKind }) {
  /* Ce qu'on avait déjà, aussitôt ; la liste fraîche ensuite. */
  const records = useAsync(() => loadList<RecordRow[]>(kind), kind);
  /* Ouvert depuis une pastille : « les 440 qu'on va écrire », « les 4 sans
     adresse ». Un nombre ne se corrige pas — une liste, si. Les identifiants
     viennent du serveur et non de l'URL : quatre cents dans une adresse de
     page est une adresse que rien ne transporte. */
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? '';
  const only = params.get('only') ?? '';
  const audience = useAsync(
    async () => (from ? api.get<AudienceView>(`/api/blocks/${from}/outreach`) : null),
    `audience:${from}`,
  );
  /* Le rôle vient de l'adresse : la barre latérale y mène (« Startups »,
     « Donors »…), et la liste se partage telle qu'on la voit. */
  const role = params.get('role');
  const section = (isOrgKind(kind) ? ORG_SECTIONS : PERSON_SECTIONS).find((x) => x.role === role);
  const [query, setQuery] = useState('');
  /* Un filtre par colonne du tableau. */
  const [columnPicks, setColumnPicks] = useState<ColumnPicks>({});
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  /* Picking people to invite. Organisations never sign in, so the column only
     exists on the individuals list. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  /* Tableau ou cartes : gardé d'une visite à l'autre, dans ce navigateur. */
  const [view, setViewState] = useState<'table' | 'cards'>(() => {
    try {
      return localStorage.getItem('dir-view') === 'cards' ? 'cards' : 'table';
    } catch {
      return 'table';
    }
  });
  const setView = (v: 'table' | 'cards') => {
    setViewState(v);
    try {
      localStorage.setItem('dir-view', v);
    } catch {
      /* rien à garder */
    }
  };
  /* Une tuile du résumé choisie : un filtre de plus. */
  const [preset, setPreset] = useState('all');
  const data = records.data ?? cachedList<RecordRow[]>(kind);
  const loaded = data ?? [];
  const testCount = loaded.filter((r) => r.testOwner).length;
  /* Les fiches de l'espace de test restent hors de vue, des comptes et des
     exports : elles ont leur onglet, qui ne montre qu'elles. */
  const real = loaded.filter((r) => !r.testOwner);
  /* L'onglet des inscrits : ceux qui sont vraiment entrés sur la plateforme. Dans l'adresse, pour s'y partager. */
  const asked = params.get('tab');
  const tab: 'all' | 'registered' | 'test' = asked === 'registered' ? 'registered' : asked === 'test' && testCount > 0 ? 'test' : 'all';
  const everyone = tab === 'test' ? loaded.filter((r) => r.testOwner) : real;
  const setTab = (t: 'all' | 'registered' | 'test') =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (t === 'all') next.delete('tab');
      else next.set('tab', t);
      return next;
    });
  const all = tab === 'registered' ? everyone.filter((r) => r.registered) : everyone;
  const isOrg = kind === 'org';

  /* Exactement ce que la pastille comptait : la même liste, pas une requête
     qui lui ressemble. */
  const fromAudience = audience.data
    ? new Set(only === 'silent' ? audience.data.silent : audience.data.audience.map((a) => a.id))
    : null;
  /* Une audience attrape des sociétés et des personnes. Celles qui ne sont pas
     de ce genre-ci ne sont pas perdues : elles sont comptées et on y mène. */
  const elsewhere = fromAudience ? fromAudience.size - all.filter((r) => fromAudience.has(r.id)).length : 0;

  const rows = useMemo(() => {
    /* Pas de recherche sur la grille : une recherche tapée sur les cartes ne la filtre pas en cachette. */
    const needle = view === 'table' ? '' : query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!fromAudience || fromAudience.has(r.id)) &&
        presetOf(preset, r) &&
        (view === 'table' ? true : matchesColumns(isOrg, columnPicks, r)) &&
        (!role || (role === '__none' ? !r.roles.length : r.roles.includes(role))) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          r.city.toLowerCase().includes(needle) ||
          r.tags.join(' ').toLowerCase().includes(needle)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, role, query, audience.data, only, preset, columnPicks, isOrg, view]);

  const shown = fromAudience ? all.filter((r) => fromAudience.has(r.id)) : all;
  /* Le résumé, compté sur ce que la page montre. */
  const month = new Date().toISOString().slice(0, 7);
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)} %` : '—');
  const added = shown.filter((r) => r.createdAt.slice(0, 7) === month).length;
  const tiles: Tile[] = isOrg
    ? [
        { key: 'all', label: 'All', value: String(shown.length), note: `${added} added this month` },
        { key: 'startups', label: 'Startups', value: String(shown.filter((r) => presetOf('startups', r)).length), note: pct(shown.filter((r) => presetOf('startups', r)).length, shown.length) },
        { key: 'running', label: 'In a programme', value: String(shown.filter((r) => presetOf('running', r)).length), note: 'taking part now' },
        { key: 'raising', label: 'Raising funds', value: String(shown.filter((r) => presetOf('raising', r)).length), note: 'need stated' },
        { key: 'complete', label: 'Complete sheets', value: pct(shown.filter((r) => presetOf('complete', r)).length, shown.length), note: `${shown.filter((r) => presetOf('complete', r)).length} of ${shown.length}` },
      ]
    : [
        { key: 'all', label: 'All', value: String(shown.length), note: `${added} added this month` },
        { key: 'mentors', label: 'Mentors', value: String(shown.filter((r) => presetOf('mentors', r)).length), note: `${shown.reduce((n, r) => n + r.sessions, 0)} sessions held` },
        { key: 'jury', label: 'Jury', value: String(shown.filter((r) => presetOf('jury', r)).length), note: `${shown.reduce((n, r) => n + r.evaluations, 0)} evaluations` },
        { key: 'teams', label: 'Startup teams', value: String(shown.filter((r) => presetOf('teams', r)).length), note: 'attached to an organisation' },
        { key: 'active', label: 'Active accounts', value: pct(shown.filter((r) => presetOf('active', r)).length, shown.length), note: `${shown.filter((r) => r.account && r.account.state !== 'claimed').length} invited, not in yet` },
      ];

  /* Cocher dans la grille, c'est ce qui est à l'écran : ses filtres disent qui on vise. */
  const chosen = all.filter((r) => picked.has(r.id));

  return (
    <>
      <header className="topbar">
        <h1>
          {isOrg ? 'Organisations' : 'Individuals'}
          {section && <span className="faint"> · {section.label}</span>}
        </h1>
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 12.5 }}>
          {isOrg
            ? 'Startups, corporates, funds and institutions.'
            : 'Founders, mentors, jury members and the CEED team.'}{' '}
          Internal — members never browse it.
        </span>
        <button className="btn" onClick={() => setImporting(true)}>
          <Icon name="arrowRight" size={14} /> Import
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Add {isOrg ? 'an organisation' : 'a person'}
        </button>
      </header>

      <nav className="tabbar" role="tablist" aria-label={isOrg ? 'Organisations' : 'Individuals'}>
        <button role="tab" className={tab === 'all' ? 'tab on' : 'tab'} onClick={() => setTab('all')}>
          All <span className="num faint">{real.length}</span>
        </button>
        <button
          role="tab"
          className={tab === 'registered' ? 'tab on' : 'tab'}
          onClick={() => setTab('registered')}
          title={isOrg ? 'Somebody holding its page has signed in with their own password' : 'Signed in with their own password'}
        >
          Registered <span className="num faint">{real.filter((r) => r.registered).length}</span>
        </button>
        {testCount > 0 && (
          <button
            role="tab"
            className={tab === 'test' ? 'tab on' : 'tab'}
            onClick={() => setTab('test')}
            title="Records made in the test space, to try the platform out — kept out of the other lists, the counts and the exports"
          >
            Test records <span className="num faint">{testCount}</span>
          </button>
        )}
      </nav>

      <div className="page stack" style={{ gap: 14 }}>
        {from && (
          <div className="callout">
            <Icon name="users" size={15} />
            <div style={{ flex: 1 }}>
              {!audience.data ? (
                'Loading the call’s audience…'
              ) : (
                <>
                  <strong>
                    {only === 'silent'
                      ? 'Nobody can be written to for these.'
                      : 'Everybody this call would be written to.'}
                  </strong>{' '}
                  {only === 'silent'
                    ? 'Neither their own address nor one on anybody holding their page. Add one and they join the send.'
                    : 'Their own address, or the one of whoever holds their page.'}
                  {/* L'audience attrape aussi des personnes : le dire plutôt que
                      de les faire disparaître d'une liste d'organisations. */}
                  {elsewhere > 0 && (
                    <>
                      {' '}
                      <Link to={`/${isOrg ? 'individuals' : 'organisations'}?from=${from}${only ? `&only=${only}` : ''}`}>
                        {elsewhere} {isOrg ? 'on the individuals list' : 'on the organisations list'}
                      </Link>
                      .
                    </>
                  )}
                </>
              )}
            </div>
            <button className="btn sm" onClick={() => setParams({})}>
              Show everybody
            </button>
          </div>
        )}

        {/* L'annuaire se lit dans la grille : ni tuiles de chiffres ni rangée de rôles
            au-dessus — les rôles sont dans la barre latérale, le reste en colonnes. */}
        {view === 'cards' && !isOrg && all.length > 0 && <Tiles tiles={tiles} on={preset} onPick={setPreset} />}

        <div className="row wrap">
          {/* La grille filtre sous chaque colonne : la recherche ne sert plus qu'aux cartes et aux individus. */}
          {view !== 'table' && (
            <SearchBox
              placeholder={isOrg ? 'Search an organisation, a city, a tag…' : 'Search a name, an email, a city…'}
              value={query}
              onChange={setQuery}
            />
          )}
          <span className="faint num" style={{ fontSize: 12.5 }}>
            {rows.length} of {shown.length}
          </span>
          <div className="seg" role="group" aria-label="Display" style={{ marginLeft: 'auto' }}>
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button>
          </div>
          {!isOrg && view === 'cards' && picked.size > 0 && (
            <>
              <div className="spacer" />
              <button className="linkish" style={{ fontSize: 12.5 }} onClick={() => setPicked(new Set())}>
                Clear
              </button>
              <button className="btn primary sm" onClick={() => setInviting(true)}>
                <Icon name="send" size={13} /> Invite {picked.size}
              </button>
            </>
          )}
        </div>

        {/* La grille filtre sous chaque en-tête : la rangée de filtres ne sert qu'aux cartes et aux individus. */}
        {all.length > 0 && view !== 'table' && (
          <ColumnFilters isOrg={isOrg} rows={shown} picks={columnPicks} onChange={setColumnPicks} />
        )}

        {records.error && !data ? (
          <div className="empty">{records.error}</div>
        ) : !data ? (
          /* En cours : jamais « l'annuaire est vide » le temps que la liste arrive. */
          <div className="dir-loading" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        ) : !all.length ? (
          <div className="empty stack" style={{ gap: 10, padding: 40 }}>
            <h3>The directory is empty</h3>
            <p>Two ways to fill it, and they meet in the same place.</p>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <button className="btn primary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={14} /> Add {isOrg ? 'an organisation' : 'a person'} yourself
              </button>
              <button className="btn" onClick={() => setImporting(true)}>
                <Icon name="arrowRight" size={14} /> Import a file
              </button>
            </div>
            <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
              Or send people to <strong>/join</strong>, where they register themselves and describe their
              organisation.
            </p>
          </div>
        ) : !rows.length ? (
          <div className="empty">Nothing matches these filters.</div>
        ) : view === 'cards' ? (
          isOrg ? <OrgCards rows={rows} /> : <PersonCards rows={rows} />
        ) : (
          <Suspense fallback={<div className="dir-loading" aria-busy="true"><span /><span /><span /></div>}>
            <DirectoryGrid
              key={kind}
              kind={kind === 'org' ? 'org' : 'person'}
              rows={rows}
              onPicked={isOrg ? undefined : (list) => setPicked(new Set(list.map((r) => r.id)))}
              pickedActions={
                isOrg
                  ? undefined
                  : (list) => (
                      <button className="btn primary sm" onClick={() => setInviting(true)}>
                        <Icon name="send" size={13} /> Invite {list.length}
                      </button>
                    )
              }
            />
          </Suspense>
        )}
      </div>

      {adding && (
        <RecordModal
          kind={kind}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            records.reload();
          }}
        />
      )}

      {inviting && (
        <InviteManyModal
          people={chosen}
          onClose={() => setInviting(false)}
          onDone={() => {
            setPicked(new Set());
            records.reload();
          }}
        />
      )}

      {importing && (
        <ImportModal
          kind={kind}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            records.reload();
          }}
        />
      )}
    </>
  );
}
