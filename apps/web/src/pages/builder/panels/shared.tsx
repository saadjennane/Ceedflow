import {
  idOf,
  normalisedScore,
  type BlockOutcome,
  type Candidate,
  type EvaluationCriterion,
  type EvaluationScore,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { NumberField, SelectField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Overlays';

export const evaluatorId = (name: string) => `ev_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

export function OutcomeBadge({ outcomes, id }: { outcomes: BlockOutcome[]; id: string | null }) {
  const outcome = outcomes.find((o) => o.id === id);
  if (!outcome) return <span className="faint">—</span>;
  return <span className={outcome.tone === 'neutral' ? 'badge' : `badge ${outcome.tone}`}>{outcome.label}</span>;
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

export function CriteriaEditor({
  criteria,
  onChange,
}: {
  criteria: EvaluationCriterion[];
  onChange: (next: EvaluationCriterion[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const totalWeight = criteria.reduce((n, c) => n + c.weight, 0);

  const set = (id: string, partial: Partial<EvaluationCriterion>) =>
    onChange(criteria.map((c) => (c.id === id ? { ...c, ...partial } : c)));

  return (
    <>
      <div className="row">
        <h3 className="section-title">Criteria</h3>
        <span className="badge num">{criteria.length}</span>
        {totalWeight > 0 && (
          <span className="faint" style={{ fontSize: 12 }}>
            total weight <span className="num">{totalWeight}</span>
          </span>
        )}
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={() => {
            const criterion: EvaluationCriterion = { id: idOf.criterion(), label: '', help: '', weight: 1, max: 10 };
            onChange([...criteria, criterion]);
            setOpenId(criterion.id);
          }}
        >
          <Icon name="plus" size={13} /> Add criterion
        </button>
      </div>

      {!criteria.length && (
        <div className="empty" style={{ padding: 26 }}>
          No criterion yet. Without a grid this block cannot produce a score, and nothing downstream has anything to
          cut on.
        </div>
      )}

      <div className="rows">
        {criteria.map((criterion) => (
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
                onClick={() => onChange(criteria.filter((c) => c.id !== criterion.id))}
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
                  onChange={(v) => set(criterion.id, { label: v })}
                  placeholder="Team"
                />
                <TextField
                  label="What to look for"
                  value={criterion.help}
                  onChange={(v) => set(criterion.id, { help: v })}
                  hint="optional"
                  placeholder="Complementarity, commitment, track record."
                />
                <div className="grid-2">
                  <NumberField
                    label="Weight"
                    value={criterion.weight}
                    onChange={(v) => set(criterion.id, { weight: v })}
                    min={0}
                  />
                  <NumberField
                    label="Marked out of"
                    value={criterion.max}
                    onChange={(v) => set(criterion.id, { max: v })}
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
/* The statuses this block can put on a startup                        */
/* ------------------------------------------------------------------ */

export function OutcomeEditor({
  outcomes,
  onChange,
}: {
  outcomes: BlockOutcome[];
  onChange: (next: BlockOutcome[]) => void;
}) {
  const set = (id: string, partial: Partial<BlockOutcome>) =>
    onChange(outcomes.map((o) => (o.id === id ? { ...o, ...partial } : o)));

  return (
    <>
      <div className="row">
        <h3 className="section-title">Statuses</h3>
        <span className="badge num">{outcomes.length}</span>
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={() =>
            onChange([
              ...outcomes,
              { id: idOf.criterion().replace('crt_', 'out_'), label: '', tone: 'neutral', minScore: null },
            ])
          }
        >
          <Icon name="plus" size={13} /> Add status
        </button>
      </div>

      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        The status a startup gets out of this block. A score at or above the threshold earns that status; the one
        without a threshold is the fallback. You can always change a status by hand afterwards.
      </p>

      <div className="rows">
        {outcomes.map((outcome) => (
          <div className="rowcard" key={outcome.id}>
            <div className="rowcard-body" style={{ borderTop: 0, paddingTop: 12 }}>
              <div className="grid-2">
                <TextField
                  label="Status"
                  value={outcome.label}
                  onChange={(v) => set(outcome.id, { label: v })}
                  placeholder="Retained"
                />
                <SelectField
                  label="Colour"
                  value={outcome.tone}
                  onChange={(v) => set(outcome.id, { tone: v as BlockOutcome['tone'] })}
                  options={[
                    { value: 'ok', label: 'Positive' },
                    { value: 'warn', label: 'Caution' },
                    { value: 'stop', label: 'Negative' },
                    { value: 'neutral', label: 'Neutral' },
                  ]}
                />
              </div>
              <div className="row" style={{ gap: 12 }}>
                <label className="check" style={{ flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={outcome.minScore !== null}
                    onChange={(e) => set(outcome.id, { minScore: e.target.checked ? 70 : null })}
                  />
                  <span>Earned automatically from the score</span>
                </label>
                {outcome.minScore !== null && (
                  <input
                    className="input num"
                    style={{ width: 96 }}
                    type="number"
                    min={0}
                    max={100}
                    value={outcome.minScore}
                    aria-label="Minimum score"
                    onChange={(e) => set(outcome.id, { minScore: Number(e.target.value) })}
                  />
                )}
                <button
                  className="btn ghost icon sm"
                  onClick={() => onChange(outcomes.filter((o) => o.id !== outcome.id))}
                  aria-label="Remove status"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scoring one startup                                                 */
/* ------------------------------------------------------------------ */

export function ScoreEditor({
  blockId,
  sessionId,
  candidate,
  criteria,
  evaluator,
  existing,
  requireComment,
  onSaved,
}: {
  blockId: string;
  sessionId?: string;
  candidate: Candidate;
  criteria: EvaluationCriterion[];
  evaluator: string;
  existing?: EvaluationScore;
  requireComment?: boolean;
  onSaved: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, number>>(existing?.marks ?? {});
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const preview = normalisedScore(marks, criteria);
  const blocked = Boolean(requireComment) && !comment.trim();

  const submit = async (final: boolean) => {
    setSaving(true);
    try {
      await api.post(`/api/blocks/${blockId}/scores`, {
        candidateId: candidate.id,
        evaluatorId: evaluatorId(evaluator),
        evaluatorName: evaluator,
        sessionId: sessionId ?? null,
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
            aria-label={criterion.label}
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
        placeholder={requireComment ? 'Comment (required)' : 'Comment'}
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
        <button
          className="btn primary sm"
          disabled={saving || preview === null || blocked}
          title={blocked ? 'This block asks every evaluator for a comment.' : undefined}
          onClick={() => submit(true)}
        >
          Submit score
        </button>
      </div>
    </div>
  );
}
