/**
 * Reports › Programme : ce que la plateforme sait déjà de l'édition.
 *
 * Counted as it stands — the applications and how the funnel narrowed, the
 * committees, the One to One and whether they were held, the deliverables, the
 * cohort's sheets. Nothing to fill in.
 */
import { type ProgramMetrics } from '@ceed/shared';
import { type ReactNode } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

const pct = (n: number | null) => (n === null ? '—' : `${n} %`);

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rowcard card-pad stack" style={{ gap: 2, minWidth: 150, flex: '1 1 150px' }}>
      <span className="eyebrow">{label}</span>
      <strong className="num" style={{ fontSize: 22 }}>{value}</strong>
      {sub && <span className="faint" style={{ fontSize: 12 }}>{sub}</span>}
    </div>
  );
}

export function ProgramView({ editionId, extra }: { editionId: string; extra?: ReactNode }) {
  const metrics = useAsync(() => api.get<ProgramMetrics>(`/api/editions/${editionId}/metrics`), `metrics:${editionId}`);
  if (metrics.error) return <div className="empty">{metrics.error}</div>;
  if (!metrics.data) return <div className="empty">Loading…</div>;
  const m = metrics.data;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <Stat label="Applications" value={m.applications.total} sub={m.applications.withdrawn ? `${m.applications.withdrawn} withdrawn` : undefined} />
        <Stat label="Cohort" value={m.cohort} sub="selected" />
        <Stat
          label="Cohort sheets"
          value={m.profiles.average === null ? '—' : `${m.profiles.average} %`}
          sub={m.profiles.of ? `filled on average · ${m.profiles.complete}/${m.profiles.of} complete` : undefined}
        />
      </div>

      {m.funnel.map((f) => (
        <section key={f.track} className="card card-pad stack" style={{ gap: 8 }}>
          <div className="eyebrow">Funnel{m.funnel.length > 1 ? ` — ${f.track}` : ''}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {f.steps.map((s) => (
              <Stat key={s.name} label={s.name} value={s.count} sub={s.rate === null ? undefined : `${s.rate} % of the step before`} />
            ))}
          </div>
        </section>
      ))}

      {m.committees.length > 0 && (
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <div className="eyebrow">Committees</div>
          <table className="table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr><th>Committee</th><th className="num">Convoked</th><th className="num">Confirmed</th><th className="num">Declined</th><th className="num">No answer</th><th className="num">Confirmation</th></tr>
            </thead>
            <tbody>
              {m.committees.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td><td className="num">{c.convoked}</td><td className="num">{c.confirmed}</td>
                  <td className="num">{c.declined}</td><td className="num">{c.pending}</td><td className="num">{pct(c.confirmRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>What the startups answered — presence on the day is not recorded.</p>
        </section>
      )}

      {m.oneToOne.length > 0 && (
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <div className="eyebrow">One to One</div>
          <table className="table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr><th>Brick</th><th className="num">Planned</th><th className="num">Held</th><th className="num">Missed</th><th className="num">Cancelled</th><th className="num">Attendance</th><th className="num">Reports</th></tr>
            </thead>
            <tbody>
              {m.oneToOne.map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td><td className="num">{o.planned}</td><td className="num">{o.held}</td><td className="num">{o.noShow}</td>
                  <td className="num">{o.cancelled}</td><td className="num">{pct(o.attendance)}</td>
                  <td className="num">{o.reports}{o.reportRate !== null ? ` · ${o.reportRate} %` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>Attendance: held over held and missed. Reports: sent over held.</p>
        </section>
      )}

      {m.deliverables.length > 0 && (
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <div className="eyebrow">Deliverables</div>
          <table className="table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr><th>List</th><th className="num">Asked</th><th className="num">Everything sent</th><th className="num">Accepted</th></tr>
            </thead>
            <tbody>
              {m.deliverables.map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td><td className="num">{d.asked}</td>
                  <td className="num">{d.sent}{d.sentRate !== null ? ` · ${d.sentRate} %` : ''}</td><td className="num">{d.accepted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {extra}
    </div>
  );
}
