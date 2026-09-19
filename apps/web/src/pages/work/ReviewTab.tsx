import {
  funnelMoments,
  type Block,
  type BlockOutcome,
  type Candidate,
  type EvaluationCriterion,
  tallyVotes,
  type EvaluationMethod,
  type EvaluationScale,
  type EvaluationScore,
  type PersonRef,
  type VoteRule,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { Fragment, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, useToast } from '../../ui/Overlays';
import { ScoreEditor } from '../builder/panels/shared';

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
  /** People from the directory, resolved by the view. */
  evaluators: PersonRef[];
  rows: ScoringRow[];
}

interface ScoringPayload {
  criteria: EvaluationCriterion[];
  method: EvaluationMethod;
  scale: EvaluationScale;
  voteRule: VoteRule;
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
  pending: boolean;
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
  evaluators: PersonRef[];
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
  const moment =
    moments.find((m) => m.id === currentId || m.evaluation?.id === currentId) ?? moments[0] ?? null;

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
  /** A panel that votes shows what each member said, not a number. */
  const voting = scoring?.method === 'verdict';

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

  const byScore = (a: Line, b: Line) =>
    (b.scoring?.consensus ?? b.decision?.score ?? -1) - (a.scoring?.consensus ?? a.decision?.score ?? -1) ||
    a.candidate.orgName.localeCompare(b.candidate.orgName);

  const lines = [...byCandidate.values()].sort(byScore);
  /** No panel means nobody applies the grid — that is a committee's to say. */
  const noPanel = Boolean(evaluation) && (scoring?.groups.length ?? 0) === 0;

  /**
   * One table per sitting, each showing only the jury that sat on it. Pooling
   * them would give every row a column of dashes for the panels it never saw.
   */
  const sections: { key: string; name: string; heldOn: string | null; evaluators: PersonRef[]; lines: Line[] }[] = (
    scoring?.groups ?? []
  ).map((group) => ({
    key: group.sessionId ?? 'all',
    name: group.name,
    heldOn: group.heldOn,
    evaluators: group.evaluators,
    lines: group.rows.map((r) => byCandidate.get(r.candidate.id)!).filter(Boolean).sort(byScore),
  }));

  // Anyone on the selection's list that no sitting scored still has to be decided.
  const scored = new Set(sections.flatMap((s) => s.lines.map((l) => l.candidate.id)));
  const unscored = lines.filter((l) => !scored.has(l.candidate.id));
  if (unscored.length) {
    sections.push({
      key: 'unscored',
      name: sections.length ? 'Not scored' : '',
      heldOn: null,
      evaluators: [],
      lines: unscored,
    });
  }

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

  const publish = async () => {
    if (!selection) return;
    setBusy(true);
    try {
      await api.post(`/api/blocks/${selection.id}/selection/publish`);
      reload();
      toast('Published.');
    } finally {
      setBusy(false);
    }
  };

  // What publishing again would change: rows the rule has moved past, and rows
  // that joined the list after the last publication.
  const outOfLine = (decision?.rows ?? []).filter((r) => r.stale || r.pending).length;

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
              decision below updates that candidate straight away, and changes who the blocks downstream see — that is
              how a withdrawal or a repêchage is handled.
            </div>
          </div>
        ) : (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            Not published. Nothing below has reached the candidates yet, and no block downstream sees this result.
          </div>
        ))}

      {decision?.published && outOfLine > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>
              {outOfLine} row{outOfLine === 1 ? '' : 's'} out of line with the rule.
            </strong>{' '}
            A late score, or a startup added since. What was announced still stands until you publish again — which
            applies the rule afresh and keeps every call you made by hand.
          </div>
        </div>
      )}

      <div className="row wrap">
        <span className="badge num">{lines.length} candidates</span>
        {scoring && (
          <span className="badge">
            <span className="num">{lines.filter((l) => l.scoring?.consensus !== null && l.scoring).length}</span> scored
          </span>
        )}
        <div className="spacer" />
        {/* Nothing to press in the steady state: publishing is for the first
            announcement, and for catching up when the rule has moved since. */}
        {decision && (!decision.published || outOfLine > 0) && (
          <button
            className="btn primary"
            disabled={busy || !lines.length}
            onClick={() => setConfirmPublish(true)}
          >
            <Icon name="check" size={14} />
            {decision.published ? `Publish again (${outOfLine})` : 'Publish'}
          </button>
        )}
      </div>

      {noPanel ? (
        <div className="empty">
          <h3>Nobody scores {evaluation!.name}</h3>
          <p>
            Who reviews is a committee&apos;s to say — an event with a date, or work spread over days. Add one in this
            phase and its panels appear here.
          </p>
        </div>
      ) : !lines.length ? (
        <div className="empty">
          <h3>Nobody has reached this step</h3>
          <p>Candidates arrive once they pass the selection before it.</p>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="stack" style={{ gap: 8 }}>
            {section.name && (
              <div className="row wrap">
                <strong style={{ fontFamily: 'var(--display)', fontSize: 13.5 }}>{section.name}</strong>
                {section.heldOn && (
                  <span className="faint" style={{ fontSize: 12 }}>
                    {formatDate(section.heldOn)}
                  </span>
                )}
                <span className="badge num">{section.lines.length}</span>
                {section.evaluators.length > 0 ? (
                  <span className="faint" style={{ fontSize: 12 }}>
                    scored by {section.evaluators.map((e) => e.name).join(', ')}
                  </span>
                ) : (
                  <span className="badge warn">No jury scored these</span>
                )}
              </div>
            )}

            <div className="table-wrap">
              <table className="data score-table">
                <thead>
                  {evaluation && selection && (
                    <tr>
                      <th style={{ borderBottom: 0 }} />
                      <th
                        colSpan={section.evaluators.length + 1}
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
                    {section.evaluators.map((person) => (
                      <th key={person.id} style={{ textAlign: 'right' }}>
                        {person.name.split(' ')[0]}
                      </th>
                    ))}
                    {scoring && <th style={{ textAlign: 'right' }}>{voting ? 'Votes' : 'Score'}</th>}
                    {evaluation && (
                      <th style={{ borderLeft: selection ? '1px solid var(--line-strong)' : undefined }}>Status</th>
                    )}
                    {selection && <th>Decision</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {section.lines.map((line) => {
                    const me =
                      section.evaluators.find((e) => e.id === as[section.key]) ?? section.evaluators[0] ?? null;
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
                              <span
                                className="badge info"
                                style={{ marginLeft: 7 }}
                                title="On this list because of the status it carries"
                              >
                                By status
                              </span>
                            )}
                            {line.decision?.stale && (
                              <span className="badge warn" style={{ marginLeft: 7 }} title="The rule now says otherwise">
                                Rule moved on
                              </span>
                            )}
                            {line.decision?.pending && (
                              <span
                                className="badge warn"
                                style={{ marginLeft: 7 }}
                                title="Joined the list after the last publication"
                              >
                                Not announced
                              </span>
                            )}
                          </td>

                          {section.evaluators.map((person) => {
                            const score = line.scoring?.scores.find((s) => s.evaluatorId === person.id);
                            const voted = score?.submittedAt ? outcomes.find((o) => o.id === score.verdict) : null;
                            return (
                              <td key={person.id} className="score muted" style={{ textAlign: 'right' }}>
                                {voting ? (
                                  voted ? (
                                    <span className={voted.tone === 'neutral' ? 'badge' : `badge ${voted.tone}`}>
                                      {voted.label}
                                    </span>
                                  ) : (
                                    '—'
                                  )
                                ) : score?.submittedAt ? (
                                  score.normalised
                                ) : (
                                  '—'
                                )}
                              </td>
                            );
                          })}

                          {scoring && (
                            <td className="score" style={{ textAlign: 'right' }}>
                              {voting ? (
                                (() => {
                                  const tally = tallyVotes(
                                    (line.scoring?.scores ?? [])
                                      .filter((s) => s.submittedAt)
                                      .map((s) => s.verdict),
                                    outcomes,
                                    scoring.voteRule,
                                  );
                                  if (!tally.cast) return <span className="faint">no vote</span>;
                                  return (
                                    <span
                                      className="faint num"
                                      title={
                                        tally.split
                                          ? `The panel did not agree — ${scoring.voteRule === 'unanimous' ? 'unanimity' : 'a majority'} was needed`
                                          : undefined
                                      }
                                    >
                                      {tally.votes}/{tally.cast}
                                      {tally.split ? ' · split' : ''}
                                    </span>
                                  );
                                })()
                              ) : (
                                (line.scoring?.consensus ?? '—')
                              )}
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
                                  title={me ? 'Enter marks' : 'No jury on this sitting'}
                                  aria-label="Score"
                                  onClick={() => setOpenId(open ? null : line.candidate.id)}
                                >
                                  <Icon name={open ? 'chevronDown' : 'edit'} size={13} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {open && evaluation && me && (
                          <tr>
                            <td colSpan={section.evaluators.length + 5} style={{ background: 'var(--wash)' }}>
                              <ScoreEditor
                                key={me?.id}
                                blockId={evaluation.id}
                                sessionId={line.sessionId ?? undefined}
                                candidate={line.candidate}
                                criteria={criteria}
                                evaluator={me!}
                                method={scoring?.method}
                                scale={scoring?.scale}
                                outcomes={outcomes}
                                evaluators={section.evaluators}
                                onEvaluator={(id) => setAs((a) => ({ ...a, [section.key]: id }))}
                                requireComment={scoring?.requireComment}
                                existing={line.scoring?.scores.find((s) => s.evaluatorId === me!.id)}
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
          </section>
        ))
      )}

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        A status follows from the score on its own; choose another and it sticks. A decision can always be changed by
        hand, whatever the rule says — the candidate's status and every block downstream follow immediately, with no
        second step.
      </p>

      {confirmPublish && cfg && (
        <ConfirmDialog
          title={
            decision?.published
              ? 'Publish again?'
              : cfg.outputKind === 'cohort'
                ? 'Publish the cohort?'
                : 'Publish the shortlist?'
          }
          body={
            decision?.published
              ? `${outOfLine} row${outOfLine === 1 ? '' : 's'} take what the rule says now; the ones you changed by hand keep your call. Every candidate's status is rewritten.`
              : decision && decision.passCount === 0
              ? `This rejects all ${decision.failCount} of them — nobody passes. Every candidate's status is set to ${failLabel.toLowerCase()}.`
              : `${decision?.passCount} marked ${passLabel.toLowerCase()}, ${decision?.failCount} marked ${failLabel.toLowerCase()}. Each candidate's status is updated, and the blocks after this one start from the ones who passed.`
          }
          destructive={decision?.passCount === 0}
          confirmLabel={decision?.published ? 'Publish again' : 'Publish'}
          onClose={() => setConfirmPublish(false)}
          onConfirm={publish}
        />
      )}
    </>
  );
}
