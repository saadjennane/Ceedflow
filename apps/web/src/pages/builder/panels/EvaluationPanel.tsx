import type {
  Block,
  BlockOutcome,
  Candidate,
  EvaluationConfig,
  EvaluationCriterion,
  EvaluationScore,
} from '@ceed/shared';
import { Fragment, useState } from 'react';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/useAsync';
import { DateField, TagField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Overlays';
import { CriteriaEditor, OutcomeBadge, OutcomeEditor, ScoreEditor, evaluatorId } from './shared';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function EvaluationSetup({
  config,
  patch,
}: {
  config: EvaluationConfig;
  patch: (partial: Partial<EvaluationConfig>) => void;
}) {
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

      <TagField
        label="Evaluators"
        values={config.evaluators}
        onChange={(v) => patch({ evaluators: v })}
        help="Who scores. Names for now — they become directory profiles once Community is built."
        placeholder="Add an evaluator"
      />

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

interface ScoringPayload {
  criteria: EvaluationCriterion[];
  evaluators: string[];
  requireComment: boolean;
  outcomes: BlockOutcome[];
  rows: ScoringRow[];
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
  const [as, setAs] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { criteria, evaluators, outcomes, rows, requireComment } = view.data;
  const me = as || evaluators[0] || '';
  const pending = rows.filter((r) => r.consensus !== null && r.outcomeId !== r.proposedOutcomeId && !r.overridden);

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

      <div className="row wrap">
        <span className="badge num">{rows.length} candidates</span>
        <span className="badge">
          <span className="num">{rows.filter((r) => r.consensus !== null).length}</span> scored
        </span>
        <span className="badge">
          <span className="num">{rows.filter((r) => r.outcomeId).length}</span> with a status
        </span>
        <div className="spacer" />
        {evaluators.length > 0 && (
          <label className="row" style={{ gap: 7, fontSize: 12.5 }}>
            <span className="faint">Scoring as</span>
            <select className="status-select" value={me} onChange={(e) => setAs(e.target.value)}>
              {evaluators.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn primary sm" disabled={busy || !pending.length} onClick={applyAll}>
          <Icon name="check" size={13} /> Apply statuses{pending.length ? ` (${pending.length})` : ''}
        </button>
      </div>

      {!evaluators.length && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          No evaluator listed. Add evaluators in Setup to record scores against a name.
        </div>
      )}

      <div className="table-wrap">
        <table className="data score-table">
          <thead>
            <tr>
              <th>Candidate</th>
              {evaluators.map((name) => (
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
            {rows.map((row) => {
              const open = openId === row.candidate.id;
              return (
                <Fragment key={row.candidate.id}>
                  <tr>
                    <td className="name">{row.candidate.orgName}</td>
                    {evaluators.map((name) => {
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
                          onClick={() => setOpenId(open ? null : row.candidate.id)}
                          aria-label={open ? 'Close' : 'Score'}
                          disabled={!me}
                        >
                          <Icon name={open ? 'chevronDown' : 'edit'} size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={evaluators.length + 4} style={{ background: 'var(--wash)' }}>
                        <ScoreEditor
                          blockId={block.id}
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

      {outcomes.length > 0 && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Statuses in play: {outcomes.map((o) => o.label).join(', ')}.{' '}
          <OutcomeBadge outcomes={outcomes} id={outcomes[0]?.id ?? null} /> is what a committee downstream can pull from.
        </p>
      )}
    </>
  );
}
