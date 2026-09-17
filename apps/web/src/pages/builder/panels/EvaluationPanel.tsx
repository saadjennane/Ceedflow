import {
  orderedBlocks,
  type Block,
  type BlockOutcome,
  type Candidate,
  type EvaluationConfig,
  type EvaluationCriterion,
  type EvaluationScore,
  type TrackWithPhases,
} from '@ceed/shared';
import { Fragment, useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { DateField, SelectField, TagField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Overlays';
import { CriteriaEditor, OutcomeEditor, ScoreEditor, evaluatorId } from './shared';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function EvaluationSetup({
  block,
  config,
  patch,
  track,
}: {
  block: Block;
  config: EvaluationConfig;
  patch: (partial: Partial<EvaluationConfig>) => void;
  track: TrackWithPhases;
}) {
  const committees = orderedBlocks(track).filter((b) => b.type === 'committee');
  const phase = track.phases.find((p) => p.blocks.some((b) => b.id === block.id));
  const inPhase = phase?.blocks.find((b) => b.type === 'committee') ?? null;
  const scoped =
    config.scopeBlockId === 'standalone'
      ? null
      : config.scopeBlockId
        ? (committees.find((b) => b.id === config.scopeBlockId) ?? null)
        : inPhase;

  return (
    <>
      <div className="callout">
        <Icon name="star" size={15} />
        Each evaluator marks every criterion. Marks become a score out of 100 using the weights, and that score earns
        the startup a status — which is what the next block reads to know who it is dealing with.
      </div>

      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>

      <h3 className="section-title">What it scores</h3>
      <SelectField
        label="Scope"
        value={config.scopeBlockId ?? ''}
        onChange={(v) => patch({ scopeBlockId: v === '' ? null : v })}
        options={[
          {
            value: '',
            label: inPhase ? `Automatic — ${inPhase.name}, in this phase` : 'Automatic — nothing in this phase',
          },
          ...committees.map((b) => ({ value: b.id, label: `${b.name} · committee` })),
          { value: 'standalone', label: 'On its own — everyone who reaches this block' },
        ]}
        help="An evaluation dropped into a committee's phase scores that committee, sitting by sitting. Pin it elsewhere if you need to."
      />

      {scoped ? (
        <div className="callout ok">
          <Icon name="gavel" size={15} />
          Scoring <strong>{scoped.name}</strong>: the startups come from its sittings, and each sitting is marked by its
          own jury. The evaluator list below is not used.
        </div>
      ) : (
        <TagField
          label="Evaluators"
          values={config.evaluators}
          onChange={(v) => patch({ evaluators: v })}
          help="Who scores. Names for now — they become directory profiles once Community is built."
          placeholder="Add an evaluator"
        />
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={config.requireComment}
          onChange={(e) => patch({ requireComment: e.target.checked })}
        />
        <span>
          Ask every evaluator for a written comment
          <div className="faint" style={{ fontSize: 12 }}>A score cannot be submitted without one.</div>
        </span>
      </label>

      <div className="public-sep" />
      <CriteriaEditor criteria={config.criteria} onChange={(criteria) => patch({ criteria })} />

      <div className="public-sep" />
      <OutcomeEditor outcomes={config.outcomes} onChange={(outcomes) => patch({ outcomes })} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scoring — the action                                                */
/* ------------------------------------------------------------------ */

interface ScoringRow {
  candidate: Candidate;
  scores: (EvaluationScore & { normalised: number | null })[];
  consensus: number | null;
  submitted: number;
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
export function EvaluationScoring({
  block,
  dirty,
  onChanged,
}: {
  block: Block;
  dirty: boolean;
  onChanged: () => void;
}) {
  const view = useAsync(() => api.get<ScoringPayload>(`/api/blocks/${block.id}/evaluation`), block.id);
  const [as, setAs] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { criteria, outcomes, groups, scope, requireComment } = view.data;
  const allRows = groups.flatMap((g) => g.rows);
  const pending = allRows.filter((r) => r.consensus !== null && r.outcomeId !== r.proposedOutcomeId && !r.overridden);

  if (!criteria.length) {
    return (
      <div className="empty">
        <h3>No criteria yet</h3>
        <p>Add a grid in Setup, save the block, and the scoring appears here.</p>
      </div>
    );
  }

  const applyAll = async () => {
    setBusy(true);
    try {
      const { written } = await api.post<{ written: number }>(`/api/blocks/${block.id}/outcomes/apply`);
      view.reload();
      onChanged();
      toast(written ? `${written} status${written === 1 ? '' : 'es'} written.` : 'Nothing to write.');
    } finally {
      setBusy(false);
    }
  };

  const setOutcome = async (candidateId: string, outcomeId: string) => {
    await api.post(`/api/blocks/${block.id}/outcomes`, { candidateId, outcomeId });
    view.reload();
    onChanged();
  };

  return (
    <>
      {dirty && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          You have unsaved changes in Setup. Scores and statuses here are saved immediately and separately.
        </div>
      )}

      {scope && (
        <div className="callout">
          <Icon name="gavel" size={15} />
          Scoring the sittings of <strong>{scope.name}</strong>. Each panel is marked by its own jury.
        </div>
      )}

      <div className="row wrap">
        <span className="badge num">{allRows.length} candidates</span>
        <span className="badge">
          <span className="num">{allRows.filter((r) => r.consensus !== null).length}</span> scored
        </span>
        <span className="badge">
          <span className="num">{allRows.filter((r) => r.outcomeId).length}</span> with a status
        </span>
        <div className="spacer" />
        <button className="btn primary sm" disabled={busy || !pending.length} onClick={applyAll}>
          <Icon name="check" size={13} /> Apply statuses{pending.length ? ` (${pending.length})` : ''}
        </button>
      </div>

      {!allRows.length && (
        <div className="empty">
          <h3>Nobody to score yet</h3>
          <p>
            {scope
              ? 'Seat startups on a sitting of the committee and they appear here.'
              : 'Candidates arrive here once they pass the selection before this block.'}
          </p>
        </div>
      )}

      {groups.map((group) => {
        const key = group.sessionId ?? 'all';
        const me = as[key] || group.evaluators[0] || '';
        if (!group.rows.length && scope) {
          return (
            <section key={key} className="card card-pad">
              <div className="row">
                <strong style={{ fontFamily: 'var(--display)', fontSize: 13.5 }}>{group.name}</strong>
                <span className="faint" style={{ fontSize: 12 }}>
                  nobody seated
                </span>
              </div>
            </section>
          );
        }
        return (
          <section key={key} className="stack" style={{ gap: 8 }}>
            {(group.name || group.evaluators.length > 0) && (
              <div className="row wrap">
                {group.name && (
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 13.5 }}>{group.name}</strong>
                )}
                {group.heldOn && <span className="faint" style={{ fontSize: 12 }}>{formatDate(group.heldOn)}</span>}
                <span className="badge num">{group.rows.length}</span>
                <div className="spacer" />
                {group.evaluators.length > 0 ? (
                  <label className="row" style={{ gap: 7, fontSize: 12.5 }}>
                    <span className="faint">Scoring as</span>
                    <select
                      className="status-select"
                      value={me}
                      onChange={(e) => setAs((s) => ({ ...s, [key]: e.target.value }))}
                    >
                      {group.evaluators.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="badge warn">No jury on this sitting</span>
                )}
              </div>
            )}

            <div className="table-wrap">
              <table className="data score-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    {group.evaluators.map((name) => (
                      <th key={name} style={{ textAlign: 'right' }}>
                        {name.split(' ')[0]}
                      </th>
                    ))}
                    <th style={{ textAlign: 'right' }}>Score</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => {
                    const open = openId === `${key}:${row.candidate.id}`;
                    return (
                      <Fragment key={row.candidate.id}>
                        <tr>
                          <td className="name">{row.candidate.orgName}</td>
                          {group.evaluators.map((name) => {
                            const score = row.scores.find((s) => s.evaluatorId === evaluatorId(name));
                            return (
                              <td key={name} className="score muted" style={{ textAlign: 'right' }}>
                                {score?.submittedAt ? score.normalised : '—'}
                              </td>
                            );
                          })}
                          <td className="score" style={{ textAlign: 'right' }}>
                            {row.consensus ?? '—'}
                          </td>
                          <td>
                            <select
                              className="status-select"
                              value={row.outcomeId ?? ''}
                              onChange={(e) => setOutcome(row.candidate.id, e.target.value)}
                              disabled={!outcomes.length}
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
                            {row.overridden && (
                              <span className="badge info" style={{ marginLeft: 6 }} title="Moved away from the score">
                                By hand
                              </span>
                            )}
                          </td>
                          <td style={{ width: 96 }}>
                            <div className="row" style={{ gap: 7 }}>
                              <div className="bar" style={{ flex: 1 }}>
                                <i style={{ width: `${row.consensus ?? 0}%` }} />
                              </div>
                              <button
                                className="btn ghost icon sm"
                                onClick={() => setOpenId(open ? null : `${key}:${row.candidate.id}`)}
                                aria-label={open ? 'Close' : 'Score'}
                                disabled={!me}
                                title={me ? `Score as ${me}` : 'No jury on this sitting'}
                              >
                                <Icon name={open ? 'chevronDown' : 'edit'} size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={group.evaluators.length + 4} style={{ background: 'var(--wash)' }}>
                              <ScoreEditor
                                blockId={block.id}
                                sessionId={group.sessionId ?? undefined}
                                candidate={row.candidate}
                                criteria={criteria}
                                evaluator={me}
                                requireComment={requireComment}
                                existing={row.scores.find((s) => s.evaluatorId === evaluatorId(me))}
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
        );
      })}

      {outcomes.length > 0 && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Statuses in play: {outcomes.map((o) => o.label).join(', ')}. A status set by hand is never overwritten when
          you apply them again.
        </p>
      )}
    </>
  );
}
