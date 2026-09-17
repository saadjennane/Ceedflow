import {
  OWNERSHIP_STATES,
  OWNERSHIP_TONE,
  rolesFor,
  type DirectoryRecord,
  type Ownership,
  type RecordKind,
} from '@ceed/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { ImportModal } from './ImportModal';
import { RecordModal } from './RecordModal';

/** A record as the list endpoint returns it: with how many affiliations it has. */
export interface RecordRow extends DirectoryRecord {
  contacts: number;
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
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const all = records.data ?? [];
  const isOrg = kind === 'org';

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!role || (role === '__none' ? !r.roles.length : r.roles.includes(role))) &&
        (!ownership || r.ownership === ownership) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          r.city.toLowerCase().includes(needle) ||
          r.tags.join(' ').toLowerCase().includes(needle)),
    );
  }, [all, role, ownership, query]);

  const countOf = (r: string) => all.filter((x) => (r === '__none' ? !x.roles.length : x.roles.includes(r))).length;
  const orphans = isOrg ? all.filter((r) => !r.contacts).length : 0;

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
          <div className="search">
            <Icon name="search" size={14} />
            <input
              placeholder={isOrg ? 'Search an organisation, a city, a tag…' : 'Search a name, an email, a city…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="status-select"
            value={ownership ?? ''}
            onChange={(e) => setOwnership((e.target.value || null) as Ownership | null)}
          >
            <option value="">Any page state</option>
            {OWNERSHIP_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="faint num" style={{ fontSize: 12.5 }}>
            {rows.length} of {all.length}
          </span>
        </div>

        {orphans > 0 && (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div>
              <strong>
                {orphans} organisation{orphans === 1 ? '' : 's'} with nobody attached.
              </strong>{' '}
              An organisation is held by at least one person — without a contact there is nobody to invite to claim the
              page.
            </div>
          </div>
        )}

        {records.error ? (
          <div className="empty">{records.error}</div>
        ) : !all.length ? (
          <div className="empty">
            <h3>Nothing in the directory yet</h3>
            <p>
              Import a file, add {isOrg ? 'an organisation' : 'a person'} by hand, or let an organisation open its own
              page.
            </p>
          </div>
        ) : !rows.length ? (
          <div className="empty">Nothing matches these filters.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>City</th>
                  <th>{isOrg ? 'Contacts' : 'Organisations'}</th>
                  <th>Page</th>
                  <th>Came from</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="name">
                      <Link to={`/directory/${r.id}`} className="rec-name">
                        <span className="rec-mark">{initials(r.name)}</span>
                        <span>
                          {r.name}
                          {r.email && (
                            <span className="faint" style={{ display: 'block', fontWeight: 400, fontSize: 12 }}>
                              {r.email}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
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
                    <td className="muted">{r.city || <span className="faint">—</span>}</td>
                    <td>
                      {r.contacts ? (
                        <span className="num muted">{r.contacts}</span>
                      ) : isOrg ? (
                        <span className="badge warn">None</span>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${OWNERSHIP_TONE[r.ownership]}`}>{r.ownership}</span>
                    </td>
                    <td className="faint" style={{ fontSize: 12 }}>
                      {r.origin === 'import' ? 'File' : r.origin === 'signup' ? 'Signed up' : 'By hand'}
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
