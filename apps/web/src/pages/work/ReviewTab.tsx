import {
  funnelMoments,
  type Block,
  type BlockOutcome,
  type Candidate,
  type EvaluationCriterion,
  type EvaluationScore,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { Fragment, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, useToast } from '../../ui/Overlays';
import { ScoreEditor, evaluatorId } from '../builder/panels/shared';

/* ------------------------------------------------------------------ */
/* What the two endpoints return                                       */
/* ------------------------------------------------------------------ */

interface ScoringRow {
  candidate: Candidate;
  scores: (EvaluationScore & { normalised: number | null })[];
  consensus: number | null;
  outcomeId: string | null;
  proposedOutcomeId: string | null;
  overridden: boolean;
}

interface ScoringGroup {
  sessionId: string | null;
  name: string;
  heldOn: string | null;
  evaluators: string[];
  rows: ScoringRow[];
}

interface ScoringPayload {
  criteria: EvaluationCriterion[];
  requireComment: boolean;
  outcomes: BlockOutcome[];
  scope: { blockId: string; name: string } | null;
  groups: ScoringGroup[];
}

interface DecisionRow {
  candidate: Candidate;
  score: number | null;
  outcomeId: string | null;
  arrival: 'funnel' | 'manual' | 'status';
  computed: 'pass' | 'fail';
  outcome: 'pass' | 'fail';
  overridden: boolean;
  stale: boolean;
}

interface DecisionPayload {
  config: SelectionConfig;
  published: boolean;
  rows: DecisionRow[];
  pool: { candidate: Candidate; score: number | null; outcomeId: string | null }[];
  passCount: number;
  failCount: number;
}

/** One line of the merged table: what was measured, and what was decided. */
interface Line {
  candidate: Candidate;
  scoring: ScoringRow | null;
  decision: DecisionRow | null;
  sessionId: string | null;
  evaluators: string[];
}

/* ------------------------------------------------------------------ */

export function ReviewTab({
  track,
  currentId,
  onSelect,
  onOpenSetup,
  onChanged,
}: {
  track: TrackWithPhases;
  currentId: string | null;
  onSelect: (id: string) => void;
  onOpenSetup: (id: string) => void;
  onChanged: () => void;
}) {
  const moments = funnelMoments(track);
  const moment = moments.find((m) => m.id === currentId) ?? moments[0] ?? null;

  if (!moment) {
    return (
      <div className="empty">
        <h3>Nothing to review yet</h3>
        <p>Add an evaluation or a selection in the builder and its moment of the funnel appears here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="work-head">
        {moments.length > 1 ? (
          <div className="work-pick">
            {moments.map((m) => (
              <button key={m.id} className={m.id === moment.id ? 'track on' : 'track'} onClick={() => onSelect(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="work-title">{moment.label}</h2>
        )}
        <div className="spacer" />
        {moment.evaluation && (
          <button className="btn sm" onClick={() => onOpenSetup(moment.evaluation!.id)}>
            <Icon name="settings" size={13} /> {moment.selection ? 'Grid' : 'Setup'}
          </button>
        )}
        {moment.selection && (
          <button className="btn sm" onClick={() => onOpenSetup(moment.selection!.id)}>
            <Icon name="settings" size={13} /> {moment.evaluation ? 'Rule' : 'Setup'}
          </button>
        )}
      </div>

      <Moment
        key={moment.id}
        evaluation={moment.evaluation}
        selection={moment.selection}
        onChanged={onChanged}
      />
    </>
  );
}

function Moment({
  evaluation,
  selection,
  onChanged,
}: {
  evaluation: Block | null;
  selection: Block | null;
  onChanged: () => void;
}) {
  const key = `${evaluation?.id ?? ''}:${selection?.id ?? ''}`;
  const view = useAsync(
    async () => ({
      scoring: evaluation ? await api.get<ScoringPayload>(`/api/blocks/${evaluation.id}/evaluation`) : null,
      decision: selection ? await api.get<DecisionPayload>(`/api/blocks/${selection.id}/selection`) : null,
    }),
    key,
  );
  const [as, setAs] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { scoring, decision } = view.data;
  const criteria = scoring?.criteria ?? [];
  const outcomes = scoring?.outcomes ?? [];

  // The two sides list the same people; the join is what makes one table.
  const byCandidate = new Map<string, Line>();
  for (const group of scoring?.groups ?? []) {
    for (const row of group.rows) {
      byCandidate.set(row.candidate.id, {
        candidate: row.candidate,
        scoring: row,
        decision: null,
        sessionId: group.sessionId,
        evaluators: group.evaluators,
      });
    }
  }
  for (const row of decision?.rows ?? []) {
    const line = byCandidate.get(row.candidate.id);
    if (line) line.decision = row;
    else
      byCandidate.set(row.candidate.id, {
        candidate: row.candidate,
        scoring: null,
        decision: row,
        sessionId: null,
        evaluators: [],
      });
  }

  const lines = [...byCandidate.values()].sort(
    (a, b) =>
      (b.scoring?.consensus ?? b.decision?.score ?? -1) - (a.scoring?.consensus ?? a.decision?.score ?? -1) ||
      a.candidate.orgName.localeCompare(b.candidate.orgName),
  );

  // Every group's jury, in order, so the per-evaluator columns are stable.
  const evaluators = [...new Set((scoring?.groups ?? []).flatMap((g) => g.evaluators))];
  const pendingStatus = lines.filter(
    (l) => l.scoring && l.scoring.consensus !== null && !l.scoring.overridden && l.scoring.outcomeId !== l.scoring.proposedOutcomeId,
  ).length;

  const reload = () => {
    view.reload();
    onChanged();
  };

  const setStatus = async (candidateId: string, outcomeId: string) => {
    if (!evaluation) return;
    await api.post(`/api/blocks/${evaluation.id}/outcomes`, { candidateId, outcomeId });
    reload();
  };

  const setDecision = async (candidateId: string, outcome: 'pass' | 'fail') => {
    if (!selection) return;
    setBusy(true);
    try {
      await api.post(`/api/blocks/${selection.id}/selection/outcome`, { candidateId, outcome });
      reload();
    } finally {
      setBusy(false);
    }
  };

  const applyAll = async () => {
    if (!evaluation) return;
    setBusy(true);
    try {
      const { written } = await api.post<{ written: number }>(`/api/blocks/${evaluation.id}/outcomes/apply`);
      reload();
      toast(written ? `${written} status${written === 1 ? '' : 'es'} written.` : 'Nothing to write.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async (on: boolean) => {
    if (!selection) return;
    setBusy(true);
    try {
      await api.post(`/api/blocks/${selection.id}/selection/${on ? 'publish' : 'unpublish'}`);
      reload();
      toast(on ? 'Published.' : 'Publication withdrawn. Decisions made by hand are kept.');
    } finally {
      setBusy(false);
    }
  };

  const cfg = decision?.config;
  const passLabel = cfg?.passLabel ?? 'Passed';
  const failLabel = cfg?.failLabel ?? 'Not selected';

  return (
    <>
      <p className="blurb faint" style={{ margin: 0, fontSize: 12.5 }}>
        {evaluation && selection ? (
          <>
            On the left, what <strong>{evaluation.name}</strong> measured. On the right, what{' '}
            <strong>{selection.name}</strong> made of it —{' '}
            {cfg?.method === 'threshold'
              ? `score ≥ ${cfg.threshold}`
              : cfg?.method === 'top_n'
                ? `top ${cfg.topN}`
                : 'decided by hand'}
            .
          </>
        ) : evaluation ? (
          <>Nothing cuts on this evaluation yet — it measures and gives a status, and stops there.</>
        ) : (
          <>Nothing measures for this selection, so the cut is yours to make row by row.</>
        )}
      </p>

      {decision && (
        <div className="funnel">
          <div className="funnel-step">
            <div className="eyebrow">Reviewed</div>
            <div className="n">{decision.rows.length}</div>
          </div>
          <div className="funnel-arrow">
            <Icon name="arrowRight" size={16} />
          </div>
          <div className="funnel-step" style={{ borderColor: 'var(--ok)' }}>
            <div className="eyebrow">{passLabel}</div>
            <div className="n" style={{ color: 'var(--ok)' }}>
              {decision.passCount}
            </div>
          </div>
          <div className="funnel-step">
            <div className="eyebrow">{failLabel}</div>
            <div className="n faint">{decision.failCount}</div>
          </div>
        </div>
      )}

      {decision &&
        (decision.published ? (
          <div className="callout ok">
            <Icon name="check" size={15} />
            <div style={{ flex: 1 }}>
              <strong>Published {cfg?.publishedAt ? `on ${formatDate(cfg.publishedAt)}` : ''}.</strong> Changing a
              decision below updates that candidate straight away — that is how a withdrawal or a repêchage is handled.
            </div>
          </div>
        ) : (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            Not published. Nothing below has reached the candidates yet, and no block downstream sees this result.
          </div>
        ))}

      {lines.some((l) => l.decision?.stale) && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          The scores have moved since this was published. The rows marked <em>Rule moved on</em> keep the decision that
          was announced.
        </div>
      )}

      <div className="row wrap">
        <span className="badge num">{lines.length} candidates</span>
        {scoring && (
          <span className="badge">
            <span className="num">{lines.filter((l) => l.scoring?.consensus !== null && l.scoring).length}</span> scored
          </span>
        )}
        {evaluators.length > 1 && (
          <label className="row" style={{ gap: 7, fontSize: 12.5 }}>
            <span className="faint">Scoring as</span>
            <select
              className="status-select"
              value={as.all || evaluators[0]}
              onChange={(e) => setAs({ all: e.target.value })}
            >
              {evaluators.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="spacer" />
        {evaluation && (
          <button className="btn sm" disabled={busy || !pendingStatus} onClick={applyAll}>
            <Icon name="check" size={13} /> Apply statuses{pendingStatus ? ` (${pendingStatus})` : ''}
          </button>
        )}
        {decision &&
          (decision.published ? (
            <button className="btn" disabled={busy} onClick={() => publish(false)}>
              Withdraw publication
            </button>
          ) : (
            <button className="btn primary" disabled={busy || !lines.length} onClick={() => setConfirmPublish(true)}>
              <Icon name="check" size={14} /> Publish
            </button>
          ))}
      </div>

      {!lines.length ? (
        <div className="empty">
          <h3>Nobody has reached this step</h3>
          <p>Candidates arrive once they pass the selection before it.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data score-table">
            <thead>
              {evaluation && selection && (
                <tr>
                  <th style={{ borderBottom: 0 }} />
                  <th
                    colSpan={evaluators.length + 1}
                    style={{ borderBottom: 0, textAlign: 'center', color: 'var(--blue)' }}
                  >
                    {evaluation.name}
                  </th>
                  <th
                    colSpan={2}
                    style={{
                      borderBottom: 0,
                      textAlign: 'center',
                      color: 'var(--blue)',
                      borderLeft: '1px solid var(--line-strong)',
                    }}
                  >
                    {selection.name}
                  </th>
                  <th style={{ borderBottom: 0 }} />
                </tr>
              )}
              <tr>
                <th>Candidate</th>
                {evaluators.map((name) => (
                  <th key={name} style={{ textAlign: 'right' }}>
                    {name.split(' ')[0]}
                  </th>
                ))}
                {scoring && <th style={{ textAlign: 'right' }}>Score</th>}
                {evaluation && (
                  <th style={{ borderLeft: selection ? '1px solid var(--line-strong)' : undefined }}>Status</th>
                )}
                {selection && <th>Decision</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const me = as.all || line.evaluators[0] || evaluators[0] || '';
                const open = openId === line.candidate.id;
                const arrival = line.decision?.arrival;
                return (
                  <Fragment key={line.candidate.id}>
                    <tr>
                      <td className="name">
                        {line.candidate.orgName}
                        {arrival === 'manual' && (
                          <span className="badge info" style={{ marginLeft: 7 }} title="Put on this list by the team">
                            Added by hand
                          </span>
                        )}
                        {arrival === 'status' && (
                          <span className="badge info" style={{ marginLeft: 7 }} title="On this list because of its status">
                            By status
                          </span>
                        )}
                        {line.decision?.overridden && (
                          <span className="badge" style={{ marginLeft: 7 }} title="Moved away from what the rule produced">
                            Changed by hand
                          </span>
                        )}
                        {line.decision?.stale && (
                          <span className="badge warn" style={{ marginLeft: 7 }}>
                            Rule moved on
                          </span>
                        )}
                      </td>

                      {evaluators.map((name) => {
                        const score = line.scoring?.scores.find((s) => s.evaluatorId === evaluatorId(name));
                        return (
                          <td key={name} className="score muted" style={{ textAlign: 'right' }}>
                            {score?.submittedAt ? score.normalised : '—'}
                          </td>
                        );
                      })}

                      {scoring && (
                        <td className="score" style={{ textAlign: 'right' }}>
                          {line.scoring?.consensus ?? '—'}
                        </td>
                      )}

                      {evaluation && (
                        <td style={{ borderLeft: selection ? '1px solid var(--line-strong)' : undefined }}>
                          <select
                            className="status-select"
                            value={line.scoring?.outcomeId ?? ''}
                            disabled={!line.scoring || !outcomes.length}
                            onChange={(e) => setStatus(line.candidate.id, e.target.value)}
                          >
                            <option value="" disabled>
                              —
                            </option>
                            {outcomes.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}

                      {selection && (
                        <td style={{ width: 200 }}>
                          {line.decision ? (
                            <div className="seg" role="group">
                              <button
                                className={line.decision.outcome === 'pass' ? 'on' : ''}
                                disabled={busy}
                                onClick={() => setDecision(line.candidate.id, 'pass')}
                              >
                                {passLabel}
                              </button>
                              <button
                                className={line.decision.outcome === 'fail' ? 'on' : ''}
                                disabled={busy}
                                onClick={() => setDecision(line.candidate.id, 'fail')}
                              >
                                {failLabel}
                              </button>
                            </div>
                          ) : (
                            <span className="faint">not on this list</span>
                          )}
                        </td>
                      )}

                      <td style={{ width: 84 }}>
                        {line.scoring && criteria.length > 0 && (
                          <div className="row" style={{ gap: 7 }}>
                            <div className="bar" style={{ flex: 1 }}>
                              <i style={{ width: `${line.scoring.consensus ?? 0}%` }} />
                            </div>
                            <button
                              className="btn ghost icon sm"
                              disabled={!me}
                              title={me ? `Score as ${me}` : 'No evaluator on this block'}
                              aria-label="Score"
                              onClick={() => setOpenId(open ? null : line.candidate.id)}
                            >
                              <Icon name={open ? 'chevronDown' : 'edit'} size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {open && evaluation && (
                      <tr>
                        <td colSpan={evaluators.length + 5} style={{ background: 'var(--wash)' }}>
                          <ScoreEditor
                            blockId={evaluation.id}
                            sessionId={line.sessionId ?? undefined}
                            candidate={line.candidate}
                            criteria={criteria}
                            evaluator={me}
                            requireComment={scoring?.requireComment}
                            existing={line.scoring?.scores.find((s) => s.evaluatorId === evaluatorId(me))}
                            onSaved={() => {
                              setOpenId(null);
                              view.reload();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        A decision can always be changed by hand, whatever the rule says. One that differs is marked, and withdrawing
        the publication keeps it while releasing the rest.
      </p>

      {confirmPublish && cfg && (
        <ConfirmDialog
          title={cfg.outputKind === 'cohort' ? 'Publish the cohort?' : 'Publish the shortlist?'}
          body={
            decision && decision.passCount === 0
              ? `This rejects all ${decision.failCount} of them — nobody passes. Every candidate's status is set to ${failLabel.toLowerCase()}.`
              : `${decision?.passCount} marked ${passLabel.toLowerCase()}, ${decision?.failCount} marked ${failLabel.toLowerCase()}. Each candidate's status is updated, and the blocks after this one start from the ones who passed.`
          }
          destructive={decision?.passCount === 0}
          confirmLabel="Publish"
          onClose={() => setConfirmPublish(false)}
          onConfirm={() => publish(true)}
        />
      )}
    </>
  );
}
