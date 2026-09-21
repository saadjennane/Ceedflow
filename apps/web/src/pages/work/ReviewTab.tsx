import {
  funnelMoments,
  rankAtWork,
  type Block,
  type BlockOutcome,
  type Candidate,
  type EvaluationConfig,
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
  /** One scale for the whole grid. */
  markedOutOf: number;
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
  passCount: number;
  failCount: number;
}

/** One line of the merged table: what was measured, and what was decided. */
/** The columns you can order the table by. */
type SortKey = 'orgName' | 'score' | 'status' | 'decision';

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
  /* A moment is judged by the brick that measures — the evaluation — because
     that is what startups wait on. Reading order breaks the ties, so the funnel
     still reads left to right. */
  const openOn =
    moments.length > 0
      ? moments.reduce((best, m) => {
          const rank = (x: typeof m) => rankAtWork(x.evaluation ?? x.selection!);
          return rank(m) < rank(best) ? m : best;
        })
      : null;
  const moment =
    moments.find((m) => m.id === currentId || m.evaluation?.id === currentId) ?? openOn ?? null;

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
            <Icon name="settings" size={13} />{' '}
            {moment.selection
              ? (moment.evaluation.config as EvaluationConfig).method === 'verdict'
                ? 'What to look at'
                : 'Grid'
              : 'Setup'}
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

/**
 * Who is behind. The count beside the tab says how many startups are covered,
 * which never tells you whose reviews are missing — this does, one figure per
 * person on the panel.
 */
function Progress({ section }: { section: { evaluators: PersonRef[]; lines: Line[] } }) {
  const total = section.lines.length;
  return (
    <span className="faint row wrap" style={{ fontSize: 12, gap: 8 }}>
      {section.evaluators.map((person, i) => {
        const done = section.lines.filter((line) =>
          line.scoring?.scores.some((s) => s.evaluatorId === person.id && s.submittedAt),
        ).length;
        return (
          <span key={person.id} style={{ color: done === total ? 'var(--ok)' : undefined }}>
            {i > 0 && <span className="faint">· </span>}
            {person.name} <span className="num">{done}</span>
            <span className="num">/{total}</span>
          </span>
        );
      })}
    </span>
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
  /* Best first, because that is the question this screen answers. Clicking a
     header picks another, and clicking it again turns it round. */
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 });
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

  /* The table has always been ordered by score, best first — it simply never
     said so, and there was no way to ask for anything else. The score stays the
     default, because that is what you open this screen to read. */
  const scoreOf = (l: Line) => l.scoring?.consensus ?? l.decision?.score ?? null;
  const statusOf = (l: Line) =>
    outcomes.find((o) => o.id === (l.scoring?.outcomeId ?? l.decision?.outcomeId))?.label ?? '';

  /** Null where there is nothing yet — which is not the same as a low value. */
  const cellOf = (l: Line, key: SortKey): string | number | null => {
    if (key === 'orgName') return l.candidate.orgName;
    if (key === 'status') return statusOf(l) || null;
    if (key === 'decision') return l.decision ? (l.decision.outcome === 'pass' ? 1 : 0) : null;
    return scoreOf(l);
  };

  const ordered = (rows: Line[]) =>
    [...rows].sort((a, b) => {
      const av = cellOf(a, sort.key);
      const bv = cellOf(b, sort.key);
      const byName = a.candidate.orgName.localeCompare(b.candidate.orgName);
      /* A startup nobody has judged sinks to the bottom whichever way the
         column points. Treating "no score" as the lowest score put them at the
         top the moment you asked for the weakest first, which is the one place
         they have nothing to say. */
      if (av === null || bv === null) {
        if (av === null && bv === null) return byName;
        return av === null ? 1 : -1;
      }
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return (cmp * sort.dir) || byName;
    });

  const lines = ordered([...byCandidate.values()]);

  /** A header that says which way the table is ordered, and changes it. */
  const sortable = (key: SortKey, label: string, align?: 'right', style?: React.CSSProperties) => (
    <th style={{ ...style, textAlign: align, cursor: 'pointer' }}>
      <button
        className="th-sort"
        style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }))}
        aria-label={`Order by ${label.toLowerCase()}`}
      >
        {label}
        {sort.key === key && <Icon name={sort.dir === 1 ? 'chevronUp' : 'chevronDown'} size={11} />}
      </button>
    </th>
  );
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
    lines: ordered(group.rows.map((r) => byCandidate.get(r.candidate.id)!).filter(Boolean)),
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
  // The rule in the words the jury used, rather than a number nobody set here.
  const passing = (cfg?.passOutcomeIds ?? [])
    .map((id) => outcomes.find((o) => o.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  const passLabel = cfg?.passLabel ?? 'Passed';
  const failLabel = cfg?.failLabel ?? 'Not selected';

  return (
    <>
      <p className="blurb faint" style={{ margin: 0, fontSize: 12.5 }}>
        {evaluation && selection ? (
          <>
            On the left, what <strong>{evaluation.name}</strong> measured. On the right, what{' '}
            <strong>{selection.name}</strong> made of it —{' '}
            {passing.length ? passing.join(' and ') + ' move on' : 'nothing moves on yet'}.
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
              <strong>Announced {cfg?.publishedAt ? `on ${formatDate(cfg.publishedAt)}` : ''}.</strong> The blocks
              downstream follow the rule as it stands, not this snapshot — announcing again records where things have
              got to, and writes each candidate's status afresh.
            </div>
          </div>
        ) : (
          <div className="callout">
            <Icon name="alert" size={15} />
            <div>
              <strong>Nothing announced yet.</strong> The blocks downstream already work from the rule below —
              announcing is what records the decision and writes each candidate's status.
            </div>
          </div>
        ))}

      {decision?.published && outOfLine > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>
              {outOfLine} row{outOfLine === 1 ? '' : 's'} moved since you announced.
            </strong>{' '}
            A late score, or a startup added since. The blocks downstream already follow the new reading — announce
            again to bring the record and the candidates' own statuses up to date.
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
            {decision.published ? `Announce again (${outOfLine})` : 'Announce'}
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
                  <Progress section={section} />
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
                    {sortable('orgName', 'Candidate')}
                    {/* A juror's own column is not sortable: their marks are one
                        panel's reading, not an order the table is kept in. */}
                    {section.evaluators.map((person) => (
                      <th key={person.id} style={{ textAlign: 'right' }}>
                        {person.name.split(' ')[0]}
                      </th>
                    ))}
                    {scoring && sortable('score', voting ? 'Votes' : 'Score', 'right')}
                    {evaluation &&
                      sortable('status', 'Status', undefined, {
                        borderLeft: selection ? '1px solid var(--line-strong)' : undefined,
                      })}
                    {selection && sortable('decision', 'Decision')}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {section.lines.map((line) => {
                    const me =
                      section.evaluators.find((e) => e.id === as[section.key]) ?? section.evaluators[0] ?? null;
                    const open = openId === line.candidate.id;
                    return (
                      <Fragment key={line.candidate.id}>
                        <tr>
                          <td className="name">
                            {line.candidate.orgName}
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

                          {section.evaluators.map((person, i) => {
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
                                markedOutOf={scoring?.markedOutOf}
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
