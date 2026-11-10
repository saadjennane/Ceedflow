/**
 * Les listes de l'annuaire, lisibles d'un coup d'œil.
 *
 * A summary in tiles that doubles as a filter, then each row says what matters
 * about the record without opening it — what an organisation does, where it
 * stands in the programmes, its turnover and its sheet; who a person is, what
 * they do for CEED and whether they can sign in. The same rows as cards, for
 * browsing rather than scanning.
 */
import { MATURITY_LEVELS, SECTORS, profileDone, profileOf, type RecordAccount } from '@ceed/shared';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';
import { colourOf, initialsOf } from '../../ui/Showcase';
import { AccountBadge } from './AccountCard';
import { useBrandColour } from '../../ui/brandColour';
import type { RecordRow } from './DirectoryPage';

export interface Tile {
  key: string;
  label: string;
  value: string;
  note: string;
}

export function Tiles({ tiles, on, onPick }: { tiles: Tile[]; on: string; onPick: (key: string) => void }) {
  return (
    <div className="dir-tiles">
      {tiles.map((t) => (
        <button key={t.key} className={t.key === on ? 'dir-tile on' : 'dir-tile'} aria-pressed={t.key === on} onClick={() => onPick(t.key)}>
          <span className="eyebrow">{t.label}</span>
          <b className="num">{t.value}</b>
          <small>{t.note}</small>
        </button>
      ))}
    </div>
  );
}

const word = (list: readonly { key: string; en: string }[], key: string) => list.find((c) => c.key === key)?.en ?? '';

/** Le dernier chiffre d'affaires connu, et sa tendance sur l'exercice d'avant. */
export function revenueOf(r: RecordRow): { amount: number; currency: string; delta: number | null } | null {
  const known = [...r.revenues].filter((x) => !x.unavailable && x.amount !== null).sort((a, b) => b.year - a.year);
  const last = known[0];
  if (!last) return null;
  const prev = known[1];
  const delta = prev && prev.amount ? Math.round(((last.amount! - prev.amount) / Math.abs(prev.amount)) * 100) : null;
  return { amount: last.amount!, currency: last.currency, delta };
}

const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : n >= 1_000 ? `${Math.round(n / 1000)} k` : String(n);

/** Le bandeau d'une carte, à la couleur de l'organisation. */
function Band({ r }: { r: RecordRow }) {
  const c = useBrandColour({ name: r.name, brandColour: r.brandColour, logoUploadId: r.logoUploadId });
  return <span className="dir-band" style={{ background: `linear-gradient(115deg, ${c}, var(--cyan))` }} />;
}

function Mark({ r, size = 36 }: { r: RecordRow; size?: number }) {
  return r.logoUploadId ? (
    <img className="dir-logo" style={{ width: size, height: size }} src={`/api/uploads/${r.logoUploadId}`} alt="" />
  ) : (
    <span className="dir-logo" style={{ width: size, height: size, background: r.brandColour || colourOf(r.name) }}>
      {r.kind === 'org' ? r.name.slice(0, 1).toUpperCase() : initialsOf(r.name)}
    </span>
  );
}

function Programmes({ list }: { list: RecordRow['programmes'] }) {
  if (!list.length) return <span className="faint">—</span>;
  const word = { now: 'Taking part', alumni: 'Alumni', applied: 'Applied' };
  return (
    <span className="dir-pms">
      {list.map((p) => (
        <span key={p.name} className="dir-pm" style={{ background: p.colour }} title={`${p.name} — ${word[p.state]}`}>
          {p.name.slice(0, 1).toUpperCase()}
          <em className={p.state} />
        </span>
      ))}
    </span>
  );
}

function SheetRing({ value }: { value: number }) {
  const colour = value === 100 ? 'var(--ok)' : value >= 60 ? 'var(--blue)' : 'var(--warn)';
  return (
    <span className="dir-ring" style={{ background: `conic-gradient(${colour} ${value}%, var(--wash) 0)` }} title={`Sheet ${value} % complete`}>
      <b className="num">{value}</b>
    </span>
  );
}

function AccountDot({ account }: { account: RecordAccount | null }) {
  const tone = !account ? '' : account.state === 'claimed' ? 'ok' : account.state === 'disabled' ? '' : 'warn';
  return <span className={`dir-dot ${tone}`} title={account ? account.state : 'No account'} />;
}

function Trend({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  return <span className={delta >= 0 ? 'dir-up' : 'dir-down'}>{delta >= 0 ? '▲ +' : '▼ '}{Math.abs(delta)} %</span>;
}

/* ------------------------------------------------------------------ */
/* Organisations                                                        */
/* ------------------------------------------------------------------ */

export function OrgTable({ rows }: { rows: RecordRow[] }) {
  return (
    <div className="table-wrap">
      <table className="data dir-table">
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Sector</th>
            <th>City</th>
            <th>Programmes</th>
            <th className="right">Revenue</th>
            <th className="right">Team</th>
            <th>Sheet</th>
            <th>Contact</th>
            <th>Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = profileOf(r);
            const rev = revenueOf(r);
            const holder = r.holders[0];
            return (
              <tr key={r.id}>
                <td>
                  <Link to={`/directory/${r.id}`} className="dir-who">
                    <Mark r={r} />
                    <span className="dir-min">
                      <b>{r.name}</b>
                      {r.testOwner && <span className="badge warn" style={{ marginLeft: 6 }}>TEST</span>}
                      <span className="faint dir-clip">{p.pitch || r.email || ''}</span>
                    </span>
                  </Link>
                </td>
                <td>
                  {p.sector ? <span className="badge">{word(SECTORS, p.sector) || p.sector}</span> : <span className="faint">—</span>}
                  {p.maturity && <div className="faint" style={{ fontSize: 12 }}>{word(MATURITY_LEVELS, p.maturity)}</div>}
                </td>
                <td className="muted" style={{ fontSize: 12.5 }}>{r.city || <span className="faint">—</span>}</td>
                <td><Programmes list={r.programmes} /></td>
                <td className="right num" style={{ whiteSpace: 'nowrap' }}>
                  {rev ? (
                    <>
                      <b>{short(rev.amount)}</b> <span className="faint" style={{ fontSize: 11 }}>{rev.currency}</span>
                      <div style={{ fontSize: 11.5 }}><Trend delta={rev.delta} /></div>
                    </>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
                <td className="right num">{p.teamSize ?? <span className="faint">—</span>}</td>
                <td><SheetRing value={profileDone(p)} /></td>
                <td style={{ fontSize: 12.5 }}>
                  {holder ? (
                    <span className="dir-contact" title={[holder.email, ...holder.phones].filter(Boolean).join(' · ')}>
                      <span className="dir-av" style={{ background: colourOf(holder.name) }}>{initialsOf(holder.name)}</span>
                      <Link to={`/directory/${holder.id}`}>{holder.name}</Link>
                      <AccountDot account={r.account} />
                      {r.holders.length > 1 && <span className="faint"> +{r.holders.length - 1}</span>}
                    </span>
                  ) : (
                    <span className="badge warn">None</span>
                  )}
                </td>
                <td className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {r.lastActivity ? formatDate(r.lastActivity.slice(0, 10)) : formatDate(r.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OrgCards({ rows }: { rows: RecordRow[] }) {
  return (
    <div className="dir-grid">
      {rows.map((r) => {
        const p = profileOf(r);
        const rev = revenueOf(r);
        const needs = p.needs.filter((n) => n.active);
        const holder = r.holders[0];
        return (
          <Link key={r.id} to={`/directory/${r.id}`} className="dir-card">
            <Band r={r} />
            <span className="dir-card-body">
              <span className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span className="dir-card-logo"><Mark r={r} size={50} /></span>
                <SheetRing value={profileDone(p)} />
              </span>
              <span>
                <b className="dir-card-name">{r.name}</b>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {[word(SECTORS, p.sector), word(MATURITY_LEVELS, p.maturity), r.city].filter(Boolean).join(' · ')}
                </span>
              </span>
              {p.pitch && <span className="dir-pitch">{p.pitch}</span>}
              {needs.length > 0 && (
                <span className="row wrap" style={{ gap: 4 }}>
                  {needs.slice(0, 3).map((n) => (
                    <span key={n.need} className="badge info">{n.need}</span>
                  ))}
                </span>
              )}
              <span className="dir-figs">
                <span><span className="eyebrow">Revenue</span><b className="num">{rev ? short(rev.amount) : '—'}</b>{rev && <Trend delta={rev.delta} />}</span>
                <span><span className="eyebrow">Team</span><b className="num">{p.teamSize ?? '—'}</b></span>
                <span><span className="eyebrow">Programmes</span><Programmes list={r.programmes} /></span>
              </span>
              <span className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                {holder ? (
                  <span className="dir-contact">
                    <span className="dir-av" style={{ background: colourOf(holder.name) }}>{initialsOf(holder.name)}</span>
                    {holder.name}
                    <AccountDot account={r.account} />
                  </span>
                ) : (
                  <span className="faint">No contact</span>
                )}
                <span className="faint" style={{ fontSize: 12 }}>
                  {r.lastActivity ? formatDate(r.lastActivity.slice(0, 10)) : ''}
                </span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Individuals                                                          */
/* ------------------------------------------------------------------ */

/** Ses rôles, avec ce qu'ils représentent quand on le sait. */
function Roles({ r }: { r: RecordRow }) {
  const count = (role: string) =>
    role === 'Mentor' && r.sessions ? `${r.sessions} session${r.sessions > 1 ? 's' : ''}` : role === 'Jury' && r.panels ? `${r.panels} panel${r.panels > 1 ? 's' : ''}` : '';
  if (!r.roles.length) return <span className="faint">—</span>;
  return (
    <span className="row wrap" style={{ gap: 4 }}>
      {r.roles.map((role) => (
        <span key={role} className={role === 'Mentor' ? 'badge info' : role === 'Jury' ? 'badge warn' : 'badge'}>
          {role}
          {count(role) ? ` · ${count(role)}` : ''}
        </span>
      ))}
    </span>
  );
}

const titleOf = (r: RecordRow) => {
  const job = r.jobTitle || r.orgs[0]?.role || '';
  const org = r.orgs[0]?.name ?? '';
  return [job, org].filter(Boolean).join(' @ ');
};

export function PersonTable({
  rows,
  picked,
  onToggle,
  allShown,
  onToggleAll,
}: {
  rows: RecordRow[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  allShown: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data dir-table">
        <thead>
          <tr>
            <th style={{ width: 34 }}>
              <input type="checkbox" aria-label="Pick everybody shown" checked={allShown} onChange={onToggleAll} />
            </th>
            <th>Name</th>
            <th>Roles</th>
            <th>Programmes</th>
            <th>City</th>
            <th>Contact</th>
            <th>Account</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={picked.has(r.id) ? 'picked' : undefined}>
              <td>
                <input type="checkbox" aria-label={`Pick ${r.name}`} checked={picked.has(r.id)} onChange={() => onToggle(r.id)} />
              </td>
              <td>
                <Link to={`/directory/${r.id}`} className="dir-who">
                  <Mark r={r} size={36} />
                  <span className="dir-min">
                    <b>{r.name}</b>
                    {r.testOwner && <span className="badge warn" style={{ marginLeft: 6 }}>TEST</span>}
                    <span className="faint dir-clip">{titleOf(r)}</span>
                  </span>
                </Link>
              </td>
              <td><Roles r={r} /></td>
              <td><Programmes list={r.programmes} /></td>
              <td className="muted" style={{ fontSize: 12.5 }}>{r.city || <span className="faint">—</span>}</td>
              <td className="muted" style={{ fontSize: 12.5 }}>
                {r.emails[0] && <span style={{ display: 'block' }}>{r.emails[0]}</span>}
                {r.phones[0] && <span className="num" style={{ display: 'block' }}>{r.phones[0]}</span>}
                {!r.emails[0] && !r.phones[0] && <span className="faint">—</span>}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <AccountBadge account={r.account} />
                {r.account && (
                  <span className="faint" style={{ display: 'block', fontSize: 11.5 }}>
                    {r.account.lastSeenAt ? `seen ${formatDate(r.account.lastSeenAt)}` : `opened ${formatDate(r.account.createdAt)}`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PersonCards({ rows }: { rows: RecordRow[] }) {
  return (
    <div className="dir-grid">
      {rows.map((r) => (
        <Link key={r.id} to={`/directory/${r.id}`} className="dir-card person">
          <span className="dir-card-body" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 18 }}>
            <span className="dir-face"><Mark r={r} size={64} /></span>
            <b className="dir-card-name">{r.name}</b>
            <span className="faint" style={{ fontSize: 12.5 }}>{titleOf(r) || '—'}</span>
            <Roles r={r} />
            {r.evaluations > 0 && <span className="faint" style={{ fontSize: 12 }}>{r.evaluations} evaluations given</span>}
            <span className="row" style={{ justifyContent: 'space-between', width: '100%', borderTop: '1px solid var(--line)', paddingTop: 10, fontSize: 12.5 }}>
              <span className="row" style={{ gap: 6 }}>
                <AccountDot account={r.account} />
                {r.account ? (r.account.state === 'claimed' ? 'Active account' : r.account.state === 'disabled' ? 'Disabled' : 'Invited') : 'No account'}
              </span>
              <span className="faint">{r.city}</span>
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
