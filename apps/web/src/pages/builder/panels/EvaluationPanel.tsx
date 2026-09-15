import {
  idOf,
  normalisedScore,
  type Block,
  type Candidate,
  type EvaluationConfig,
  type EvaluationCriterion,
  type EvaluationScore,
} from '@ceed/shared';
import { Fragment, useState } from 'react';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/useAsync';
import { DateField, NumberField, TagField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Overlays';

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
  const [openId, setOpenId] = useState<string | null>(null);
  const totalWeight = config.criteria.reduce((n, c) => n + c.weight, 0);

  const setCriterion = (id: string, partial: Partial<EvaluationCriterion>) =>
    patch({ criteria: config.criteria.map((c) => (c.id === id ? { ...c, ...partial } : c)) });

  const add = () => {
    const criterion: EvaluationCriterion = { id: idOf.criterion(), label: '', help: '', weight: 1, max: 10 };
    patch({ criteria: [...config.criteria, criterion] });
    setOpenId(criterion.id);
  };

  return (
    <>
      <div className="callout">
        <Icon name="star" size={15} />
        Each evaluator marks every criterion. Marks are turned into a score out of 100 using the weights below, and a
        candidate's score is the average across evaluators who have submitted.
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
        <span>Ask each evaluator for a written comment</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={config.revealPeers} onChange={(e) => patch({ revealPeers: e.target.checked })} />
        <span>
          Let evaluators see each other's scores
          <div className="faint" style={{ fontSize: 12 }}>Only once they have submitted their own.</div>
        </span>
      </label>

      <div className="public-sep" />

      <div className="row">
        <h3 className="section-title">Criteria</h3>
        <span className="badge num">{config.criteria.length}</span>
        {totalWeight > 0 && <span className="faint" style={{ fontSize: 12 }}>total weight <span className="num">{totalWeight}</span></span>}
        <div className="spacer" />
        <button className="btn sm" onClick={add}>
          <Icon name="plus" size={13} /> Add criterion
        </button>
      </div>

      {!config.criteria.length && (
        <div className="empty" style={{ padding: 26 }}>
          No criterion yet. Without criteria this block cannot produce a score, and a selection downstream will have
          nothing to cut on.
        </div>
      )}

      <div className="rows">
        {config.criteria.map((criterion) => (
          <div key={criterion.id} className="rowcard">
            <div className="rowcard-head">
              <button className="rowcard-title" onClick={() => setOpenId(openId === criterion.id ? null : criterion.id)}>
                {criterion.label || <span className="faint">Untitled criterion</span>}
              </button>
              <span className="mini">
                weight <span className="num">{criterion.weight}</span> · out of <span className="num">{criterion.max}</span>
              </span>
              {totalWeight > 0 && (
                <span className="badge num" title="Share of the final score">
                  {Math.round((criterion.weight / totalWeight) * 100)}%
                </span>
              )}
              <button
                className="btn ghost icon sm"
                onClick={() => setOpenId(openId === criterion.id ? null : criterion.id)}
                aria-label="Edit criterion"
              >
                <Icon name={openId === criterion.id ? 'chevronDown' : 'chevronRight'} size={14} />
              </button>
              <button
                className="btn ghost icon sm"
                onClick={() => patch({ criteria: config.criteria.filter((c) => c.id !== criterion.id) })}
                aria-label="Remove criterion"
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
            {openId === criterion.id && (
              <div className="rowcard-body">
                <TextField
                  label="Criterion"
                  value={criterion.label}
                  onChange={(v) => setCriterion(criterion.id, { label: v })}
                  placeholder="Team"
                />
                <TextField
                  label="What to look for"
                  value={criterion.help}
                  onChange={(v) => setCriterion(criterion.id, { help: v })}
                  hint="optional"
                  placeholder="Complementarity, commitment, track record."
                />
                <div className="grid-2">
                  <NumberField
                    label="Weight"
                    value={criterion.weight}
                    onChange={(v) => setCriterion(criterion.id, { weight: v })}
                    min={0}
                  />
                  <NumberField
                    label="Marked out of"
                    value={criterion.max}
                    onChange={(v) => setCriterion(criterion.id, { max: v })}
                    min={1}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

interface ScoringRow {
  candidate: Candidate;
  scores: (EvaluationScore & { normalised: number | null })[];
  consensus: number | null;
  submitted: number;
}

interface ScoringPayload {
  criteria: EvaluationCriterion[];
  evaluators: string[];
  rows: ScoringRow[];
}

const evaluatorId = (name: string) => `ev_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

export function EvaluationScoring({ block, dirty }: { block: Block; dirty: boolean }) {
  const view = useAsync(() => api.get<ScoringPayload>(`/api/blocks/${block.id}/evaluation`), block.id);
  const [as, setAs] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { criteria, evaluators, rows } = view.data;
  const me = as || evaluators[0] || '';

  if (!criteria.length) {
    return (
      <div className="empty">
        <h3>No criteria yet</h3>
        <p>Add criteria in Setup, save the block, and the scoring grid appears here.</p>
      </div>
    );
  }

  return (
    <>
      {dirty && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          You have unsaved changes in Setup. Scores here are saved separately and immediately.
        </div>
      )}

      <div className="row wrap">
        <span className="badge num">{rows.length} candidates</span>
        <span className="badge">
          <span className="num">{rows.filter((r) => r.consensus !== null).length}</span> scored
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
                      <td colSpan={evaluators.length + 3} style={{ background: 'var(--wash)' }}>
                        <ScoreEditor
                          blockId={block.id}
                          candidate={row.candidate}
                          criteria={criteria}
                          evaluator={me}
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
    </>
  );
}

function ScoreEditor({
  blockId,
  candidate,
  criteria,
  evaluator,
  existing,
  onSaved,
}: {
  blockId: string;
  candidate: Candidate;
  criteria: EvaluationCriterion[];
  evaluator: string;
  existing?: EvaluationScore;
  onSaved: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, number>>(existing?.marks ?? {});
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const preview = normalisedScore(marks, criteria);

  const submit = async (final: boolean) => {
    setSaving(true);
    try {
      await api.post(`/api/blocks/${blockId}/scores`, {
        candidateId: candidate.id,
        evaluatorId: evaluatorId(evaluator),
        evaluatorName: evaluator,
        marks,
        comment,
        submit: final,
      });
      toast(final ? `Score submitted for ${candidate.orgName}.` : 'Draft saved.');
      onSaved();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack" style={{ padding: '6px 0 10px' }}>
      <div className="eyebrow">
        {evaluator} scoring {candidate.orgName}
      </div>
      {criteria.map((criterion) => (
        <div key={criterion.id} className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{criterion.label}</div>
            {criterion.help && <div className="faint" style={{ fontSize: 12 }}>{criterion.help}</div>}
          </div>
          <input
            className="input num"
            style={{ width: 88 }}
            type="number"
            min={0}
            max={criterion.max}
            value={marks[criterion.id] ?? ''}
            placeholder={`0–${criterion.max}`}
            onChange={(e) =>
              setMarks((m) => {
                const next = { ...m };
                if (e.target.value === '') delete next[criterion.id];
                else next[criterion.id] = Math.max(0, Math.min(criterion.max, Number(e.target.value)));
                return next;
              })
            }
          />
        </div>
      ))}
      <textarea
        className="textarea"
        rows={2}
        placeholder="Comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="row">
        <span className="faint" style={{ fontSize: 12.5 }}>
          Weighted score <strong className="num">{preview ?? '—'}</strong> / 100
        </span>
        <div className="spacer" />
        <button className="btn sm" disabled={saving} onClick={() => submit(false)}>
          Save draft
        </button>
        <button className="btn primary sm" disabled={saving || preview === null} onClick={() => submit(true)}>
          Submit score
        </button>
      </div>
    </div>
  );
}
