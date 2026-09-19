import {
  gridLeaves,
  idOf,
  leafShare,
  normalisedScore,
  type BlockOutcome,
  type CriterionLeaf,
  type EvaluationMethod,
  type EvaluationScale,
  type Candidate,
  type EvaluationCriterion,
  type EvaluationScore,
  type PersonRef,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { NumberField, SelectField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Overlays';

export function OutcomeBadge({ outcomes, id }: { outcomes: BlockOutcome[]; id: string | null }) {
  const outcome = outcomes.find((o) => o.id === id);
  if (!outcome) return <span className="faint">—</span>;
  return <span className={outcome.tone === 'neutral' ? 'badge' : `badge ${outcome.tone}`}>{outcome.label}</span>;
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

/**
 * The grid. A criterion is marked directly, or it is a **section** whose
 * children are — one level only, and the share each leaf really carries is
 * shown rather than left to be worked out.
 */
export function CriteriaEditor({
  criteria,
  onChange,
  unscored,
}: {
  criteria: EvaluationCriterion[];
  onChange: (next: EvaluationCriterion[]) => void;
  /** A panel that votes keeps the grid as guidance, so weights mean nothing. */
  unscored?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const set = (id: string, partial: Partial<EvaluationCriterion>) =>
    onChange(criteria.map((c) => (c.id === id ? { ...c, ...partial } : c)));

  const setChild = (parentId: string, childId: string, partial: Partial<CriterionLeaf>) =>
    set(parentId, {
      children: (criteria.find((c) => c.id === parentId)?.children ?? []).map((child) =>
        child.id === childId ? { ...child, ...partial } : child,
      ),
    });

  const blank = (): EvaluationCriterion => ({
    id: idOf.criterion(),
    label: '',
    help: '',
    weight: 1,
    max: 10,
    children: [],
  });

  return (
    <>
      <div className="row">
        <h3 className="section-title">{unscored ? 'What to look at' : 'Criteria'}</h3>
        <span className="badge num">{criteria.length}</span>
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={() => {
            const criterion = blank();
            onChange([...criteria, criterion]);
            setOpenId(criterion.id);
          }}
        >
          <Icon name="plus" size={13} /> Add {unscored ? 'a heading' : 'criterion'}
        </button>
      </div>

      {!criteria.length && (
        <div className="empty" style={{ padding: 26 }}>
          {unscored
            ? 'Nothing yet. What you write here is shown beside the status picker.'
            : 'No criterion yet. Without a grid this block cannot produce a score, and nothing downstream has anything to cut on.'}
        </div>
      )}

      <div className="rows">
        {criteria.map((criterion) => {
          const section = criterion.children.length > 0;
          const open = openId === criterion.id;
          return (
            <div key={criterion.id} className="rowcard">
              <div className="rowcard-head">
                <button className="rowcard-title" onClick={() => setOpenId(open ? null : criterion.id)}>
                  {criterion.label || <span className="faint">Untitled</span>}
                </button>
                {section ? (
                  <span className="badge">section · {criterion.children.length}</span>
                ) : (
                  !unscored && (
                    <span className="mini">
                      out of <span className="num">{criterion.max}</span>
                    </span>
                  )
                )}
                {!unscored && (
                  <span className="badge num" title="Share of the final score">
                    {section
                      ? criterion.children.reduce((n, c) => n + leafShare(criteria, c.id), 0)
                      : leafShare(criteria, criterion.id)}
                    %
                  </span>
                )}
                <button
                  className="btn ghost icon sm"
                  onClick={() => setOpenId(open ? null : criterion.id)}
                  aria-label="Edit"
                >
                  <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
                </button>
                <button
                  className="btn ghost icon sm"
                  onClick={() => onChange(criteria.filter((c) => c.id !== criterion.id))}
                  aria-label="Remove"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>

              {open && (
                <div className="rowcard-body">
                  <TextField
                    label={section ? 'Section' : 'Criterion'}
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

                  {!unscored && (
                    <div className="grid-2">
                      <NumberField
                        label={section ? 'Weight of the section' : 'Weight'}
                        value={criterion.weight}
                        onChange={(v) => set(criterion.id, { weight: v })}
                        min={0}
                      />
                      {!section && (
                        <NumberField
                          label="Marked out of"
                          value={criterion.max}
                          onChange={(v) => set(criterion.id, { max: v })}
                          min={1}
                        />
                      )}
                    </div>
                  )}

                  {section && (
                    <div className="rows" style={{ marginTop: 4 }}>
                      {criterion.children.map((child) => (
                        <div className="rowcard sub-row" key={child.id}>
                          <input
                            className="input"
                            value={child.label}
                            placeholder="Complementarity"
                            onChange={(e) => setChild(criterion.id, child.id, { label: e.target.value })}
                          />
                          {!unscored && (
                            <>
                              <input
                                className="input num"
                                style={{ width: 66 }}
                                type="number"
                                min={0}
                                value={child.weight}
                                aria-label="Weight"
                                onChange={(e) => setChild(criterion.id, child.id, { weight: Number(e.target.value) })}
                              />
                              <span className="badge num" title="Share of the final score">
                                {leafShare(criteria, child.id)}%
                              </span>
                            </>
                          )}
                          <button
                            className="btn ghost icon sm"
                            aria-label="Remove"
                            onClick={() =>
                              set(criterion.id, { children: criterion.children.filter((c) => c.id !== child.id) })
                            }
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="btn sm"
                    onClick={() =>
                      set(criterion.id, {
                        children: [
                          ...criterion.children,
                          { id: idOf.criterion(), label: '', help: '', weight: 1, max: criterion.max },
                        ],
                      })
                    }
                  >
                    <Icon name="plus" size={13} /> Add a sub-criterion
                  </button>
                  {!section && (
                    <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                      Adding one turns this into a section: the marks move onto its children and this line shares its
                      weight between them.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
  mode = 'score',
}: {
  outcomes: BlockOutcome[];
  onChange: (next: BlockOutcome[]) => void;
  /** A verdict has no bands: one status answers for a panel that did not agree. */
  mode?: 'score' | 'verdict';
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
              {
                id: idOf.criterion().replace('crt_', 'out_'),
                label: '',
                tone: 'neutral',
                minScore: null,
                whenSplit: false,
              },
            ])
          }
        >
          <Icon name="plus" size={13} /> Add status
        </button>
      </div>

      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        {mode === 'verdict'
          ? 'The panel votes in these words. Mark the one that answers when it does not agree — that is what a waitlist is for, and it must not be the rejection.'
          : 'The status a startup gets out of this block. A score at or above the threshold earns that status; the one without a threshold is the fallback.'}{' '}
        You can always change a status by hand afterwards.
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
                {mode === 'verdict' ? (
                  <label className="check" style={{ flex: 1 }}>
                    <input
                      type="radio"
                      name="when-split"
                      checked={outcome.whenSplit}
                      onChange={() =>
                        onChange(outcomes.map((o) => ({ ...o, whenSplit: o.id === outcome.id })))
                      }
                    />
                    <span>When the panel does not agree</span>
                  </label>
                ) : (
                  <>
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
                  </>
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
  method = 'score',
  scale = 'points',
  outcomes = [],
  evaluator,
  evaluators,
  onEvaluator,
  existing,
  requireComment,
  onSaved,
}: {
  blockId: string;
  sessionId?: string;
  candidate: Candidate;
  criteria: EvaluationCriterion[];
  /** A grid to mark, or a status to name. */
  method?: EvaluationMethod;
  scale?: EvaluationScale;
  outcomes?: BlockOutcome[];
  /** The person whose marks these are, from the directory. */
  evaluator: PersonRef;
  /** Until evaluators log in, the team enters on their behalf. */
  evaluators?: PersonRef[];
  onEvaluator?: (id: string) => void;
  existing?: EvaluationScore;
  requireComment?: boolean;
  onSaved: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, number>>(existing?.marks ?? {});
  const [verdict, setVerdict] = useState(existing?.verdict ?? '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const voting = method === 'verdict';
  const leaves = gridLeaves(criteria);
  const preview = normalisedScore(marks, leaves);
  const blocked = (Boolean(requireComment) && !comment.trim()) || (voting && !verdict);

  const submit = async (final: boolean) => {
    setSaving(true);
    try {
      await api.post(`/api/blocks/${blockId}/scores`, {
        candidateId: candidate.id,
        evaluatorId: evaluator.id,
        evaluatorName: evaluator.name,
        sessionId: sessionId ?? null,
        marks,
        verdict,
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
      <div className="row" style={{ gap: 8 }}>
        <span className="eyebrow">Marks for {candidate.orgName}, entered as</span>
        {evaluators && evaluators.length > 1 && onEvaluator ? (
          <select className="status-select" value={evaluator.id} onChange={(e) => onEvaluator(e.target.value)}>
            {evaluators.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        ) : (
          <strong style={{ fontSize: 12.5 }}>{evaluator.name}</strong>
        )}
      </div>
      {voting ? (
        <>
          {/* The grid is not scored here, but it is what the vote is about. */}
          {criteria.length > 0 && (
            <div className="rows">
              {criteria.map((criterion) => (
                <div className="rowcard" style={{ padding: '8px 11px' }} key={criterion.id}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{criterion.label}</div>
                  {criterion.help && <div className="faint" style={{ fontSize: 12 }}>{criterion.help}</div>}
                  {criterion.children.length > 0 && (
                    <div className="faint" style={{ fontSize: 12 }}>
                      {criterion.children.map((c) => c.label).filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="field">
            <label>Your verdict</label>
            <div className="work-pick">
              {outcomes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={verdict === o.id ? 'track on' : 'track'}
                  onClick={() => setVerdict(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        leaves.map((leaf) => (
          <div key={leaf.id} className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{leaf.label}</div>
              {leaf.help && <div className="faint" style={{ fontSize: 12 }}>{leaf.help}</div>}
            </div>
            {scale === 'stars' ? (
              <Stars
                value={marks[leaf.id] ?? 0}
                onChange={(n) =>
                  setMarks((m) => {
                    const next = { ...m };
                    if (n === 0) delete next[leaf.id];
                    else next[leaf.id] = n;
                    return next;
                  })
                }
              />
            ) : (
              <input
                className="input num"
                style={{ width: 88 }}
                type="number"
                min={0}
                max={leaf.max}
                value={marks[leaf.id] ?? ''}
                placeholder={`0–${leaf.max}`}
                aria-label={leaf.label}
                onChange={(e) =>
                  setMarks((m) => {
                    const next = { ...m };
                    if (e.target.value === '') delete next[leaf.id];
                    else next[leaf.id] = Math.max(0, Math.min(leaf.max, Number(e.target.value)));
                    return next;
                  })
                }
              />
            )}
          </div>
        ))
      )}
      <textarea
        className="textarea"
        rows={2}
        placeholder={requireComment ? 'Comment (required)' : 'Comment'}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="row">
        <span className="faint" style={{ fontSize: 12.5 }}>
          {voting ? (
            verdict ? (
              <>
                Your verdict: <strong>{outcomes.find((o) => o.id === verdict)?.label}</strong>
              </>
            ) : (
              'Pick a verdict to submit.'
            )
          ) : (
            <>
              Weighted score <strong className="num">{preview ?? '—'}</strong> / 100
            </>
          )}
        </span>
        <div className="spacer" />
        <button className="btn sm" disabled={saving} onClick={() => submit(false)}>
          Save draft
        </button>
        <button
          className="btn primary sm"
          disabled={saving || (!voting && preview === null) || blocked}
          title={blocked ? 'This block asks every evaluator for a comment.' : undefined}
          onClick={() => submit(true)}
        >
          Submit score
        </button>
      </div>
    </div>
  );
}


/** One to five, kept a plain radio group so a keyboard reaches it. */
function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="stars" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? 'star on' : 'star'}
          aria-label={`${n} out of 5`}
          aria-pressed={n === value}
          onClick={() => onChange(n === value ? 0 : n)}
        >
          <Icon name="star" size={17} />
        </button>
      ))}
      <span className="faint num" style={{ fontSize: 12, marginLeft: 4, width: 26 }}>
        {value || '—'}
      </span>
    </div>
  );
}
