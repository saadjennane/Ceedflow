import { profileDone, profileOf, rolesFor, type DirectoryRecord, type RecordAccount, type RecordKind } from '@ceed/shared';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { ImportModal } from './ImportModal';
import { InviteManyModal } from './InviteManyModal';
import { RecordModal } from './RecordModal';
import { OrgCards, OrgTable, PersonCards, PersonTable, Tiles, type Tile } from './DirectoryViews';

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

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function DirectoryPage({ kind }: { kind: RecordKind }) {
  const records = useAsync(() => api.get<RecordRow[]>(`/api/records?kind=${kind}`), kind);
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
  const [role, setRole] = useState<string | null>(null);
  /* Avec ou sans compte : la question qu'on se pose en préparant une invitation
     — qui a déjà une porte, et à qui il reste à en ouvrir une. Une organisation
     n'a pas de compte, c'est celui de qui la tient. */
  const [hasAccount, setHasAccount] = useState<'all' | 'with' | 'without'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  /* Picking people to invite. Organisations never sign in, so the column only
     exists on the individuals list. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  /* Les fiches de l'espace de test restent hors de vue, des comptes et des
     exports, tant qu'on ne demande pas à les voir. */
  const [withTest, setWithTest] = useState(false);
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
  const loaded = records.data ?? [];
  const testCount = loaded.filter((r) => r.testOwner).length;
  const all = withTest ? loaded : loaded.filter((r) => !r.testOwner);
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
    const needle = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!fromAudience || fromAudience.has(r.id)) &&
        (hasAccount === 'all' || (hasAccount === 'with' ? Boolean(r.account) : !r.account)) &&
        presetOf(preset, r) &&
        (!role || (role === '__none' ? !r.roles.length : r.roles.includes(role))) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          r.city.toLowerCase().includes(needle) ||
          r.tags.join(' ').toLowerCase().includes(needle)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, role, query, audience.data, only, hasAccount, preset]);

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

  /* Comptés sur ce que la page montre : « All 4 » au-dessus d'une seule ligne
     parce qu'on arrive d'une audience de quatre est un compteur qui parle
     d'autre chose que de ce qu'on a sous les yeux. */
  const countOf = (r: string) => shown.filter((x) => (r === '__none' ? !x.roles.length : x.roles.includes(r))).length;

  const toggle = (id: string) =>
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /* Select-all means what is on screen, not what is in the directory: the
     filters above are how somebody narrows to the people they mean, and a box
     that quietly took the other three hundred would be a trap. */
  const allShown = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const chosen = all.filter((r) => picked.has(r.id));

  return (
    <>
      <header className="topbar">
        <h1>{isOrg ? 'Organisations' : 'Individuals'}</h1>
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

        {all.length > 0 && <Tiles tiles={tiles} on={preset} onPick={setPreset} />}

        <div className="row wrap">
          <div className="work-pick">
            <button className={!role ? 'track on' : 'track'} onClick={() => setRole(null)}>
              All <span className="num">{shown.length}</span>
            </button>
            {rolesFor(kind).map((r) => (
              <button key={r} className={role === r ? 'track on' : 'track'} onClick={() => setRole(r)}>
                {r} <span className="num">{countOf(r)}</span>
              </button>
            ))}
            {!isOrg && (
              <button
                className={role === '__none' ? 'track on' : 'track'}
                onClick={() => setRole('__none')}
                title="People known through an organisation rather than a role"
              >
                Contacts <span className="num">{countOf('__none')}</span>
              </button>
            )}
          </div>

          {/* Qui peut déjà entrer, et à qui il reste à ouvrir. Sur les individus
              seulement : une organisation ne signe jamais, c'est la personne qui
              tient sa page qui a la clé. */}
          {!isOrg && (
            <div className="work-pick">
              {(
                [
                  ['all', 'Any account'],
                  ['with', 'With an account'],
                  ['without', 'Without'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={hasAccount === value ? 'track on' : 'track'}
                  onClick={() => setHasAccount(value)}
                >
                  {label}{' '}
                  {value !== 'all' && (
                    <span className="num">
                      {shown.filter((r) => (value === 'with' ? Boolean(r.account) : !r.account)).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="row wrap">
          {testCount > 0 && (
            <button className={withTest ? 'track on' : 'track'} onClick={() => setWithTest((v) => !v)}>
              Test records <span className="num">{testCount}</span>
            </button>
          )}
          <SearchBox
            placeholder={isOrg ? 'Search an organisation, a city, a tag…' : 'Search a name, an email, a city…'}
            value={query}
            onChange={setQuery}
          />
          <span className="faint num" style={{ fontSize: 12.5 }}>
            {rows.length} of {shown.length}
          </span>
          <div className="seg" role="group" aria-label="Display" style={{ marginLeft: 'auto' }}>
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button>
          </div>
          {!isOrg && picked.size > 0 && (
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

        {records.error ? (
          <div className="empty">{records.error}</div>
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
        ) : isOrg ? (
          <OrgTable rows={rows} />
        ) : (
          <PersonTable
            rows={rows}
            picked={picked}
            onToggle={toggle}
            allShown={allShown}
            onToggleAll={() =>
              setPicked((was) => {
                const next = new Set(was);
                if (allShown) rows.forEach((r) => next.delete(r.id));
                else rows.forEach((r) => next.add(r.id));
                return next;
              })
            }
          />
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
