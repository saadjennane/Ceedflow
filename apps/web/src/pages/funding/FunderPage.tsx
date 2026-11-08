/**
 * Un bailleur suivi : ses opportunités par étape, ce que les analyses et le
 * web disent de lui, et ce qu'on fait pour lui. Une organisation de
 * l'annuaire — la même fiche, vue depuis Funding.
 */
import { FUNDING_ORG_ROLE_LABEL, OPEN_STAGES, type FunderView, type FundingOrgRole, type Task } from '@ceed/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, useToast } from '../../ui/Overlays';
import { SavedOpportunityCard } from './FundingPage';
import './funding.css';

export function FunderPage() {
  const { recordId = '' } = useParams();
  const view = useAsync(() => api.get<FunderView>(`/api/funding/funders/${recordId}`), `funder:${recordId}`);
  const tasks = useAsync(() => api.get<Task[]>(`/api/tasks?recordId=${recordId}`), `funder-tasks:${recordId}`);
  const role = useAccount().me?.account.staffRole;
  const canWrite = role === 'admin' || role === 'editor';
  const [untracking, setUntracking] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  if (view.error) return <div className="page"><div className="callout warn">{view.error}</div></div>;
  const f = view.data;
  if (!f) return <div className="page faint">Loading…</div>;
  const open = f.opportunities.filter((o) => OPEN_STAGES.includes(o.stage));
  const closed = f.opportunities.filter((o) => !OPEN_STAGES.includes(o.stage));

  return (
    <>
      <header className="topbar">
        <Link className="btn ghost sm" to="/funding"><Icon name="chevronLeft" size={13} /> Funders</Link>
        <div className="spacer" />
        <Link className="btn ghost sm" to={`/directory/${f.id}`}><Icon name="layers" size={13} /> In Organisations</Link>
        {f.website && <a className="btn ghost sm" href={f.website.startsWith('http') ? f.website : `https://${f.website}`} target="_blank" rel="noreferrer">Website</a>}
        {canWrite && <button className="btn ghost sm" onClick={() => setUntracking(true)}>Stop tracking</button>}
      </header>

      <div className="page stack" style={{ gap: 20, maxWidth: 1000 }}>
        <section className="stack" style={{ gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{f.name}</h2>
          {f.kind && <span className="faint">{f.kind}</span>}
          {f.description && <p style={{ margin: 0, fontSize: 14 }}>{f.description}</p>}
          {f.themes.length > 0 && <div className="fi-tags">{f.themes.map((t) => <span key={t} className="fi-tag">{t}</span>)}</div>}
        </section>

        <section className="fi-section">
          <h3>Opportunities <span className="n">{open.length} open</span></h3>
          {!f.opportunities.length && <div className="empty">No opportunity followed for this funder yet — save some from an analysis.</div>}
          {open.map((o) => <SavedOpportunityCard key={o.id} o={o} canWrite={canWrite} onChanged={() => view.reload()} />)}
          {closed.length > 0 && (
            <>
              <h3 style={{ marginTop: 6 }}>Closed <span className="n">{closed.length}</span></h3>
              {closed.map((o) => <SavedOpportunityCard key={o.id} o={o} canWrite={canWrite} onChanged={() => view.reload()} />)}
            </>
          )}
        </section>

        <section className="fi-section">
          <h3>Tasks <span className="n">{tasks.data?.length ?? 0} open</span></h3>
          {!tasks.data?.length ? (
            <span className="faint" style={{ fontSize: 13 }}>No open task linked to this funder.</span>
          ) : (
            <div className="rows">
              {tasks.data.map((t) => (
                <Link key={t.id} to={`/tasks?task=${t.id}`} className="rowcard card-pad row" style={{ gap: 8, textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ flex: 1 }}>{t.title}</span>
                  <span className="faint" style={{ fontSize: 12 }}>{t.ownerName}{t.dueOn ? ` · ${formatDate(t.dueOn)}` : ''}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="fi-section">
          <h3>Seen in analyses <span className="n">{f.analyses.length}</span></h3>
          <div className="rows">
            {f.analyses.map((a) => (
              <Link key={a.id} to={`/funding/${a.id}`} className="rowcard card-pad row wrap" style={{ gap: 8, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ flex: 1, minWidth: 200 }}>{a.title || 'Untitled document'}</span>
                {a.roles.map((r) => <span key={r} className="badge">{FUNDING_ORG_ROLE_LABEL[r as FundingOrgRole] ?? r}</span>)}
                <span className="faint" style={{ fontSize: 12 }}>{formatDate(a.createdAt)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="fi-section">
          <h3>External Research <span className="n">{f.web.length}</span></h3>
          {!f.web.length ? (
            <span className="faint" style={{ fontSize: 13 }}>Nothing yet — run “Enrich with Web Research” on an analysis where it appears.</span>
          ) : (
            <div className="fi-src">
              <ul>
                {f.web.map((w, i) => (
                  <li key={i}>
                    {w.topic && <span className="faint">{w.topic} · </span>}{w.text}
                    <div>{w.urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12 }}>{u}</a>)}</div>
                    {w.ranAt && <span className="faint" style={{ fontSize: 11.5 }}>Consulted {formatDate(w.ranAt)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {untracking && (
        <ConfirmDialog
          title={`Stop tracking ${f.name}?`}
          body={`It leaves the Funders list. It stays in Organisations, and its ${f.opportunities.length} opportunit${f.opportunities.length === 1 ? 'y stays' : 'ies stay'} in the Opportunities tab.`}
          confirmLabel="Stop tracking"
          onClose={() => setUntracking(false)}
          onConfirm={async () => {
            try {
              await api.del(`/api/funding/funders/${f.id}`);
              navigate('/funding');
            } catch (err) {
              toast((err as Error).message, true);
            }
          }}
        />
      )}
    </>
  );
}
