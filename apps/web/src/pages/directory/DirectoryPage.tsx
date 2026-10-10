import { ORIGIN_LABEL, rolesFor, type DirectoryRecord, type RecordAccount, type RecordKind } from '@ceed/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { AccountBadge } from './AccountCard';
import { ImportModal } from './ImportModal';
import { InviteManyModal } from './InviteManyModal';
import { RecordModal } from './RecordModal';

/** A record as the list endpoint returns it: with how many affiliations it has. */
export interface RecordRow extends DirectoryRecord {
  contacts: number;
  /** Null for an organisation, and for anybody who has no way in yet. */
  account: RecordAccount | null;
  /** Les organisations qu'une personne tient. Vide pour une organisation. */
  orgs: { id: string; name: string; role: string }[];
  /** Les programmes finis où elle était encore en lice à la clôture. */
  alumni: number;
  /** Ceux qui tournent et où elle l'est encore. */
  current: string[];
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
  const [role, setRole] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  /* Picking people to invite. Organisations never sign in, so the column only
     exists on the individuals list. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  const all = records.data ?? [];
  const isOrg = kind === 'org';

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!role || (role === '__none' ? !r.roles.length : r.roles.includes(role))) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          r.city.toLowerCase().includes(needle) ||
          r.tags.join(' ').toLowerCase().includes(needle)),
    );
  }, [all, role, query]);

  const countOf = (r: string) => all.filter((x) => (r === '__none' ? !x.roles.length : x.roles.includes(r))).length;

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
        <div className="row wrap">
          <div className="work-pick">
            <button className={!role ? 'track on' : 'track'} onClick={() => setRole(null)}>
              All <span className="num">{all.length}</span>
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
        </div>

        <div className="row wrap">
          <SearchBox
            placeholder={isOrg ? 'Search an organisation, a city, a tag…' : 'Search a name, an email, a city…'}
            value={query}
            onChange={setQuery}
          />
          <span className="faint num" style={{ fontSize: 12.5 }}>
            {rows.length} of {all.length}
          </span>
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
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {!isOrg && (
                    <th style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        aria-label="Pick everybody shown"
                        checked={allShown}
                        onChange={() =>
                          setPicked((was) => {
                            const next = new Set(was);
                            if (allShown) rows.forEach((r) => next.delete(r.id));
                            else rows.forEach((r) => next.add(r.id));
                            return next;
                          })
                        }
                      />
                    </th>
                  )}
                  <th>Name</th>
                  {!isOrg && <th>Phone</th>}
                  {!isOrg && <th>Email</th>}
                  <th>Roles</th>
                  <th>{isOrg ? 'City' : 'Where'}</th>
                  <th>{isOrg ? 'Contacts' : 'Company'}</th>
                  {!isOrg && (
                    <th title="Programmes that are over and where they were still in at the close, and the one running now">
                      Programmes
                    </th>
                  )}
                  {!isOrg && <th>Account</th>}
                  <th>Came from</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {!isOrg && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Pick ${r.name}`}
                          checked={picked.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                    )}
                    <td className="name">
                      <Link to={`/directory/${r.id}`} className="rec-name">
                        {/* La photo là où était la marque, à la même taille :
                            une ligne sans photo ne décale donc pas les autres. */}
                        {r.logoUploadId ? (
                          <img className="rec-photo" src={`/api/uploads/${r.logoUploadId}`} alt="" />
                        ) : (
                          <span className="rec-mark">{initials(r.name)}</span>
                        )}
                        <span>
                          {r.name}
                          {isOrg && r.email && (
                            <span className="faint" style={{ display: 'block', fontWeight: 400, fontSize: 12 }}>
                              {r.email}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>

                    {!isOrg && (
                      <td className="muted num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {r.phones[0] ?? <span className="faint">—</span>}
                        {/* Les autres sont sur la fiche : une colonne qui les
                            empile ferait des lignes de trois hauteurs. */}
                        {r.phones.length > 1 && (
                          <span className="faint" title={r.phones.slice(1).join(' · ')}> +{r.phones.length - 1}</span>
                        )}
                      </td>
                    )}
                    {!isOrg && (
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {r.email || <span className="faint">—</span>}
                      </td>
                    )}
                    <td>
                      {r.roles.length ? (
                        r.roles.map((x) => (
                          <span className="badge" key={x} style={{ marginRight: 5 }}>
                            {x}
                          </span>
                        ))
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    {/* Le pays seul ne dit pas où : « Morocco » sur une ligne
                        sans ville se lit comme un renseignement, et n'en est
                        pas un — le pays est à Morocco par défaut pour tout le
                        monde. */}
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {r.city ? (
                        [r.city, isOrg ? null : r.country].filter(Boolean).join(', ')
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>

                    {isOrg ? (
                      <td>
                        {r.contacts ? (
                          <span className="num muted">{r.contacts}</span>
                        ) : (
                          <span className="badge warn">None</span>
                        )}
                      </td>
                    ) : (
                      /* Où il travaille, et ce qu'il y fait : la fonction de sa
                         fiche, sinon le rôle du lien — « Founder » faute de
                         mieux vaut mieux que rien du tout. */
                      <td style={{ fontSize: 12.5 }}>
                        {r.orgs.length ? (
                          <>
                            <Link to={`/directory/${r.orgs[0]!.id}`}>{r.orgs[0]!.name}</Link>
                            {r.orgs.length > 1 && (
                              <span className="faint" title={r.orgs.slice(1).map((o) => o.name).join(' · ')}>
                                {' '}+{r.orgs.length - 1}
                              </span>
                            )}
                            {(r.jobTitle || r.orgs[0]!.role) && (
                              <span className="faint" style={{ display: 'block' }}>
                                {r.jobTitle || r.orgs[0]!.role}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="faint">{r.jobTitle || '—'}</span>
                        )}
                      </td>
                    )}

                    {!isOrg && (
                      <td style={{ fontSize: 12.5 }}>
                        {r.alumni > 0 && (
                          <span className="badge" title="Programmes that are over and where they were still in">
                            {r.alumni} done
                          </span>
                        )}
                        {r.current.map((name) => (
                          <span className="badge ok" key={name} style={{ marginLeft: r.alumni ? 5 : 0 }}>
                            {name}
                          </span>
                        ))}
                        {!r.alumni && !r.current.length && <span className="faint">—</span>}
                      </td>
                    )}
                    {!isOrg && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <AccountBadge account={r.account} />
                        {/* La date qui compte : la dernière fois qu'on les a
                            vus, sinon le jour où le compte a été ouvert. Un
                            compte jamais utilisé se lit alors d'un coup d'œil. */}
                        {r.account && (
                          <span className="faint" style={{ display: 'block', fontSize: 11.5 }}>
                            {r.account.lastSeenAt
                              ? `seen ${formatDate(r.account.lastSeenAt)}`
                              : `opened ${formatDate(r.account.createdAt)}`}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="faint" style={{ fontSize: 12 }} title={ORIGIN_LABEL[r.origin]}>
                      {/* Qui, quand on le sait ; par quelle porte sinon. Les
                          fiches d'avant ce champ n'ont que la porte, et c'est
                          déjà ce qu'elles disaient. */}
                      {r.createdByName || (r.origin === 'import' ? 'File' : r.origin === 'signup' ? 'Registered' : 'By hand')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
