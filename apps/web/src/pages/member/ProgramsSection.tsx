/**
 * Programmes : le catalogue, les siens, et ceux qui prennent des candidatures.
 *
 * Three ways into the same list. "Mine" opens a programme's own page — where
 * one stands, what is asked, what was done; the catalogue and the open calls
 * say what each programme is and whether one can still apply.
 */
import { useState } from 'react';
import { useLang } from '../../lib/lang';
import { formatDate } from '../../lib/format';
import { type AsyncState } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { type MyProgram } from './MemberPage';

type Side = 'all' | 'mine' | 'open';

const STATUS_FR: Record<string, string> = {
  Applied: 'Candidature déposée',
  'In review': 'En cours d’examen',
  Shortlisted: 'Présélectionnée',
  Selected: 'Participante',
  Waitlisted: 'Liste d’attente',
  'Not selected': 'Non retenue',
  Withdrawn: 'Retirée',
};

function Mark({ p }: { p: MyProgram }) {
  return (
    <span
      className="rec-mark"
      style={{ background: p.colour ?? 'var(--blue)', color: '#fff', flexShrink: 0 }}
      aria-hidden="true"
    >
      {p.programName.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ProgramsSection({
  programs,
  pendingByEdition,
  readOnly,
  onOpen,
}: {
  programs: AsyncState<MyProgram[]>;
  pendingByEdition: Map<string, number>;
  readOnly: boolean;
  onOpen: (editionId: string) => void;
}) {
  const { lang } = useLang();
  const fr = lang === 'fr';
  const list = programs.data ?? [];
  const mine = list.filter((p) => p.mine.length > 0);
  const open = list.filter((p) => p.applications === 'live' && p.applyUrl);
  const [side, setSide] = useState<Side>(mine.length ? 'mine' : 'all');
  const [filter, setFilter] = useState<'any' | 'live' | 'done'>('any');

  if (programs.error) return <div className="empty">{programs.error}</div>;
  if (!programs.data) return <div className="empty">{fr ? 'Chargement…' : 'Loading…'}</div>;

  const tabs: { key: Side; label: string; n: number }[] = [
    { key: 'all', label: fr ? 'Tous les programmes' : 'All programmes', n: list.length },
    { key: 'mine', label: fr ? 'Mes programmes' : 'My programmes', n: mine.length },
    { key: 'open', label: fr ? 'Candidatures ouvertes' : 'Open calls', n: open.length },
  ];
  const catalogue = list.filter((p) =>
    filter === 'any' ? true : filter === 'done' ? p.editionStatus === 'Completed' : p.editionStatus !== 'Completed',
  );

  return (
    <div className="stack" style={{ gap: 14 }}>
      <nav className="tabbar" role="tablist" style={{ position: 'static' }}>
        {tabs.map((t) => (
          <button key={t.key} role="tab" className={side === t.key ? 'tab on' : 'tab'} onClick={() => setSide(t.key)}>
            {t.label} <span className="num faint">{t.n}</span>
          </button>
        ))}
      </nav>

      {side === 'all' && (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            {(['any', 'live', 'done'] as const).map((f) => (
              <button key={f} className={filter === f ? 'track on' : 'track'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'any' ? (fr ? 'Tous' : 'All') : f === 'live' ? (fr ? 'En cours' : 'Running') : fr ? 'Clôturés' : 'Completed'}
              </button>
            ))}
          </div>
          {!catalogue.length && <div className="empty">{fr ? 'Aucun programme pour le moment.' : 'No programme yet.'}</div>}
          <div className="rows">
            {catalogue.map((p) => (
              <section key={p.editionId} className="card card-pad row" style={{ gap: 12 }}>
                <Mark p={p} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14.5 }}>{p.programName}</strong>
                  <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
                    {[p.editionName, p.city, p.startsOn ? formatDate(p.startsOn) : null, p.endsOn ? `→ ${formatDate(p.endsOn)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <span className={p.editionStatus === 'Completed' ? 'badge' : p.applications === 'live' ? 'badge ok' : 'badge info'}>
                  {p.editionStatus === 'Completed'
                    ? fr ? 'Clôturé' : 'Completed'
                    : p.applications === 'live'
                      ? fr ? 'Candidatures ouvertes' : 'Open for applications'
                      : fr ? 'En cours' : 'Running'}
                </span>
                {p.mine.length > 0 ? (
                  <button className="btn sm" onClick={() => onOpen(p.editionId)}>
                    {fr ? 'Accéder' : 'Open'} <Icon name="chevronRight" size={13} />
                  </button>
                ) : (
                  p.applyUrl && !readOnly && (
                    <a className="btn sm" href={p.applyUrl}>{fr ? 'Candidater' : 'Apply'}</a>
                  )
                )}
              </section>
            ))}
          </div>
        </>
      )}

      {side === 'mine' && (
        <>
          {!mine.length && (
            <div className="empty">
              <h3>{fr ? 'Aucun programme pour l’instant' : 'No programme yet'}</h3>
              <p>{fr ? 'Les programmes auxquels vous candidatez ou participez apparaîtront ici.' : 'The programmes you apply to or take part in will appear here.'}</p>
            </div>
          )}
          <div className="rows">
            {mine.map((p) =>
              p.mine.map((c) => (
                <button
                  key={c.id}
                  className="card card-pad row"
                  style={{ gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => onOpen(p.editionId)}
                >
                  <Mark p={p} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14.5 }}>{p.programName}</strong>
                    <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
                      {[p.editionName, c.orgName, c.phase ? `${fr ? 'Phase' : 'Phase'} : ${c.phase}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {c.status && (
                    <span className={c.status === 'Selected' ? 'badge ok' : c.status === 'Not selected' || c.status === 'Withdrawn' ? 'badge' : 'badge info'}>
                      {fr ? (STATUS_FR[c.status] ?? c.status) : c.status}
                    </span>
                  )}
                  {(pendingByEdition.get(p.editionId) ?? 0) > 0 && (
                    <span className="badge warn num" title={fr ? 'Actions en attente' : 'Actions waiting'}>
                      {pendingByEdition.get(p.editionId)}
                    </span>
                  )}
                  <Icon name="chevronRight" size={15} />
                </button>
              )),
            )}
          </div>
        </>
      )}

      {side === 'open' && (
        <>
          {!open.length && (
            <div className="empty">{fr ? 'Aucun appel à candidatures ouvert en ce moment.' : 'No call for applications is open at the moment.'}</div>
          )}
          <div className="rows">
            {open.map((p) => (
              <section key={p.editionId} className="card card-pad stack" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 12 }}>
                  <Mark p={p} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14.5 }}>{p.programName}</strong>
                    <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
                      {[p.editionName, p.city, p.closesAt ? `${fr ? 'Avant le' : 'Until'} ${formatDate(p.closesAt)}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>
                {(p.eligibility ?? []).length > 0 && (
                  <div className="stack" style={{ gap: 2 }}>
                    <span className="eyebrow">{fr ? 'Critères d’éligibilité' : 'Eligibility'}</span>
                    {(p.eligibility ?? []).map((e) => (
                      <span key={e} style={{ fontSize: 13 }}>
                        <Icon name="check" size={12} /> {e}
                      </span>
                    ))}
                  </div>
                )}
                {p.mine.length > 0 ? (
                  <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen(p.editionId)}>
                    {fr ? 'Consulter ma candidature' : 'See my application'}
                  </button>
                ) : (
                  !readOnly && (
                    <a className="btn primary sm" style={{ alignSelf: 'flex-start' }} href={p.applyUrl!}>
                      <Icon name="form" size={13} /> {fr ? 'Candidater' : 'Apply'}
                    </a>
                  )
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
