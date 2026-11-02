/**
 * Reports : les KPI de la cohorte, moment par moment.
 *
 * One indicator at a time, as a table — a startup per row, a moment per
 * column, and how far each one has come since its baseline. Under it, the
 * cohort: its total and its average at each moment. The moments are sent from
 * here; what they ask and when is set in the Setup, which opens like a brick's.
 */
import {
  evolution,
  type EditionDetail,
  type FormField,
  type KpiMoment,
  type ReportingView,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { download, toWorkbook, type Cell } from '../../lib/xlsx';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';
import { ReportingSetup } from './ReportingSetup';

const numberOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const shown = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return String((v as { filename?: string }).filename ?? 'File');
  if (typeof v === 'number') return v.toLocaleString('fr-FR');
  return String(v);
};

export function ReportsTab({ edition }: { edition: EditionDetail }) {
  const view = useAsync(() => api.get<ReportingView>(`/api/editions/${edition.id}/reporting`), `reporting:${edition.id}`);
  const [setup, setSetup] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;
  const data = view.data;
  const indicators = [...data.programIndicators, ...data.editionIndicators];
  const indicator = indicators.find((f) => f.id === picked) ?? indicators.find((f) => f.type === 'number') ?? indicators[0] ?? null;
  const numeric = indicator?.type === 'number';
  const response = (momentId: string, candidateId: string) =>
    data.responses.find((r) => r.momentId === momentId && r.candidateId === candidateId) ?? null;
  const sentValue = (m: KpiMoment, candidateId: string, f: FormField) => {
    const r = response(m.id, candidateId);
    return r?.submittedAt ? r.answers[f.id] : undefined;
  };

  const launch = async (m: KpiMoment, reminder: boolean) => {
    setBusy(m.id);
    try {
      const { sent } = await api.post<{ sent: number }>(`/api/editions/${edition.id}/reporting/moments/${m.id}/launch`, { reminder });
      toast(reminder ? `Reminded ${sent}.` : `Sent to ${sent} startup${sent === 1 ? '' : 's'}.`);
      view.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const exportAll = () => {
    const head: Cell[] = ['Startup', ...indicators.flatMap((f) => data.moments.map((m) => `${f.label} — ${m.name}`))];
    const rows: Cell[][] = data.cohort.map((c) => [
      c.orgName,
      ...indicators.flatMap((f) =>
        data.moments.map((m) => {
          const v = sentValue(m, c.candidateId, f);
          return f.type === 'number' ? numberOf(v) : shown(v) || null;
        }),
      ),
    ]);
    download(toWorkbook([{ name: 'KPIs', rows: [head, ...rows] }]), `${edition.program.name} ${edition.name} — KPIs.xlsx`);
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>The cohort’s KPIs</h2>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
            {data.cohort.length} startup{data.cohort.length === 1 ? '' : 's'} in the cohort (selected) · measured at each moment
            of the programme.
          </p>
        </div>
        {indicators.length > 0 && (
          <button className="btn sm" onClick={exportAll}>
            <Icon name="file" size={13} /> Export
          </button>
        )}
        <button className="btn primary sm" onClick={() => setSetup(true)}>
          <Icon name="settings" size={13} /> Setup
        </button>
      </div>

      {!indicators.length && (
        <div className="callout">
          <Icon name="board" size={15} />
          <div>
            No indicator yet. Open the <strong>Setup</strong> to choose them — linked to the startup sheet (headcount,
            turnover…) or the programme’s own — and to date the moments they are measured.
          </div>
        </div>
      )}

      {/* Les moments : envoyés d'ici, et qui a répondu. */}
      <div className="row wrap" style={{ gap: 8 }}>
        {data.moments.map((m) => {
          const answered = data.cohort.filter((c) => response(m.id, c.candidateId)?.submittedAt).length;
          const late = m.closesOn && m.closesOn < new Date().toISOString().slice(0, 10);
          return (
            <div key={m.id} className="rowcard card-pad stack" style={{ gap: 4, minWidth: 200, flex: '1 1 200px' }}>
              <strong style={{ fontSize: 13 }}>{m.name}</strong>
              <span className="faint" style={{ fontSize: 12 }}>
                {m.opensOn ? formatDate(m.opensOn) : 'No date'}
                {m.closesOn ? ` → ${formatDate(m.closesOn)}` : ''}
              </span>
              {m.launchedAt ? (
                <span className={answered === data.cohort.length ? 'badge ok' : late ? 'badge stop' : 'badge warn'} style={{ alignSelf: 'flex-start' }}>
                  {answered}/{data.cohort.length} answered
                </span>
              ) : (
                <span className="badge" style={{ alignSelf: 'flex-start' }}>Not sent</span>
              )}
              <div className="row" style={{ gap: 6, marginTop: 2 }}>
                {!m.launchedAt ? (
                  <button
                    className="btn sm"
                    disabled={busy === m.id || !indicators.length || !data.cohort.length}
                    title={m.closesOn ? 'Write to the cohort, and put it in their space' : 'Give it a deadline in the Setup first'}
                    onClick={() => launch(m, false)}
                  >
                    <Icon name="send" size={12} /> Send
                  </button>
                ) : (
                  answered < data.cohort.length && (
                    <button className="btn ghost sm" disabled={busy === m.id} onClick={() => launch(m, true)}>
                      <Icon name="send" size={12} /> Remind {data.cohort.length - answered}
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {indicator && (
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="faint" style={{ fontSize: 12.5 }}>Indicator</label>
            <select className="input" style={{ width: 'auto', minWidth: 240 }} value={indicator.id} onChange={(e) => setPicked(e.target.value)}>
              {indicators.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label || 'Untitled'}
                  {f.fromProfile ? ' · from the sheet' : ''}
                </option>
              ))}
            </select>
          </div>

          {numeric && <CohortCurve data={data} indicator={indicator} sentValue={sentValue} />}

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Startup</th>
                  {data.moments.map((m) => (
                    <th key={m.id} className="num">{m.name}</th>
                  ))}
                  {numeric && <th className="num">Evolution</th>}
                </tr>
              </thead>
              <tbody>
                {data.cohort.map((c) => {
                  const values = data.moments.map((m) => sentValue(m, c.candidateId, indicator));
                  const ev = numeric ? evolution(values.map(numberOf)) : null;
                  return (
                    <tr key={c.candidateId}>
                      <td>{c.orgName}</td>
                      {data.moments.map((m, i) => {
                        const r = response(m.id, c.candidateId);
                        return (
                          <td key={m.id} className="num">
                            {r?.submittedAt ? (
                              shown(values[i]) || <span className="faint">—</span>
                            ) : m.launchedAt ? (
                              <span className="faint">{r ? 'draft' : 'waiting'}</span>
                            ) : (
                              <span className="faint">·</span>
                            )}
                          </td>
                        );
                      })}
                      {numeric && (
                        <td className="num">
                          {ev ? (
                            <span style={{ color: ev.delta > 0 ? 'var(--ok)' : ev.delta < 0 ? 'var(--stop)' : undefined }}>
                              {ev.delta > 0 ? '+' : ''}
                              {ev.delta.toLocaleString('fr-FR')}
                              {ev.pct !== null ? ` (${ev.pct > 0 ? '+' : ''}${Math.round(ev.pct)} %)` : ''}
                            </span>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {numeric && (
                  <>
                    <tr style={{ fontWeight: 600 }}>
                      <td>Cohort — total</td>
                      {data.moments.map((m) => {
                        const ns = data.cohort.map((c) => numberOf(sentValue(m, c.candidateId, indicator))).filter((n): n is number => n !== null);
                        return <td key={m.id} className="num">{ns.length ? ns.reduce((a, b) => a + b, 0).toLocaleString('fr-FR') : '—'}</td>;
                      })}
                      <td />
                    </tr>
                    <tr>
                      <td>Cohort — average</td>
                      {data.moments.map((m) => {
                        const ns = data.cohort.map((c) => numberOf(sentValue(m, c.candidateId, indicator))).filter((n): n is number => n !== null);
                        return (
                          <td key={m.id} className="num">
                            {ns.length ? (ns.reduce((a, b) => a + b, 0) / ns.length).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'}
                            {ns.length > 0 && <span className="faint"> · {ns.length}</span>}
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          {!data.cohort.length && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              No startup is selected in this edition yet — the cohort is the startups with the status Selected.
            </p>
          )}
        </section>
      )}

      {setup && (
        <ReportingSetup
          edition={edition}
          view={data}
          onClose={() => setSetup(false)}
          onChanged={(next) => view.set(next)}
        />
      )}
    </div>
  );
}

/** La moyenne de la cohorte, moment après moment. */
function CohortCurve({
  data,
  indicator,
  sentValue,
}: {
  data: ReportingView;
  indicator: FormField;
  sentValue: (m: KpiMoment, candidateId: string, f: FormField) => unknown;
}) {
  const points = data.moments
    .map((m) => {
      const ns = data.cohort.map((c) => numberOf(sentValue(m, c.candidateId, indicator))).filter((n): n is number => n !== null);
      return { m, avg: ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null };
    })
    .filter((p): p is { m: KpiMoment; avg: number } => p.avg !== null);
  if (points.length < 2) return null;
  const W = 560;
  const H = 150;
  const pad = { l: 10, r: 10, t: 20, b: 22 };
  const ys = points.map((p) => p.avg);
  const min = Math.min(0, ...ys);
  const max = Math.max(...ys);
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (max === min ? (H - pad.t - pad.b) / 2 : (1 - (v - min) / (max - min)) * (H - pad.t - pad.b));
  return (
    <div>
      <div className="eyebrow">Cohort average</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }} role="img" aria-label="Cohort average">
        <polyline points={points.map((p, i) => `${x(i)},${y(p.avg)}`).join(' ')} fill="none" stroke="var(--accent, #2F5BFF)" strokeWidth="2" />
        {points.map((p, i) => (
          <g key={p.m.id}>
            <circle cx={x(i)} cy={y(p.avg)} r="3.5" fill="var(--accent, #2F5BFF)" />
            <text x={x(i)} y={y(p.avg) - 7} fontSize="10" textAnchor="middle" fill="currentColor">
              {p.avg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
            </text>
            <text x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="currentColor" opacity="0.6">
              {p.m.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

