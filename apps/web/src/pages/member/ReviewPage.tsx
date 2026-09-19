import {
  normalisedScore,
  type BlockOutcome,
  type Candidate,
  type CriterionLeaf,
  type EvaluationCriterion,
  type EvaluationMethod,
  type EvaluationScale,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';
import '../../ui/builder.css';
import '../../ui/directory.css';

export interface ReviewItem {
  candidate: Candidate;
  answers: { label: string; value: unknown; type: string }[];
  mine: { marks: Record<string, number>; verdict: string; comment: string; submittedAt: string | null } | null;
  score: number | null;
}

export interface ReviewPanel {
  sessionId: string;
  sessionName: string;
  heldOn: string | null;
  format: string;
  programName: string;
  editionName: string;
  editionId: string;
  committeeName: string;
  evaluation: {
    blockId: string;
    name: string;
    method: EvaluationMethod;
    scale: EvaluationScale;
    criteria: EvaluationCriterion[];
    leaves: CriterionLeaf[];
    outcomes: BlockOutcome[];
    requireComment: boolean;
  } | null;
  items: ReviewItem[];
  done: number;
}

/**
 * Reviewing, as the person doing it. You see the startups a committee put you
 * on and your own marks — never anybody else's, which is the point of a panel
 * scoring independently.
 */
export function ReviewPage() {
  const { sessionId = '' } = useParams();
  const panel = useAsync(() => api.get<ReviewPanel>(`/api/me/reviews/${sessionId}`), sessionId);
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (panel.error?.includes('Sign in')) navigate('/login?next=' + encodeURIComponent(`/review/${sessionId}`));
  }, [panel.error, navigate, sessionId]);

  if (panel.loading) return <div className="member-shell" />;
  if (panel.error || !panel.data) {
    return (
      <div className="member-shell">
        <div className="member-body">
          <div className="empty">{panel.error ?? 'Not found.'}</div>
        </div>
      </div>
    );
  }

  const data = panel.data;
  const open = data.items.find((i) => i.candidate.id === openId) ?? null;

  return (
    <div className="member-shell">
      <div className="member-bar">
        <Link className="btn ghost sm" to="/me">
          <Icon name="chevronLeft" size={13} /> My space
        </Link>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{data.sessionName}</strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {data.programName} · {data.editionName}
            {data.heldOn && data.format === 'event' ? ` · ${formatDate(data.heldOn)}` : ''}
          </span>
        </span>
        <span className="badge num">
          {data.done}/{data.items.length}
        </span>
      </div>

      <div className="member-body stack" style={{ gap: 14 }}>
        {!data.evaluation ? (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            Nothing scores this panel yet. The team has to add an evaluation before you can review.
          </div>
        ) : open ? (
          <ReviewOne
            panel={data}
            item={open}
            onBack={() => setOpenId(null)}
            onSaved={(next) => {
              panel.set(next);
              setOpenId(null);
            }}
          />
        ) : (
          <>
            <div className="callout">
              <Icon name="star" size={15} />
              <div>
                {data.evaluation.method === 'verdict'
                  ? 'For each startup, read what it sent and name your verdict.'
                  : 'For each startup, read what it sent and mark the grid.'}{' '}
                What you write is yours — the others on this panel do not see it, and you do not see theirs.
              </div>
            </div>

            <div className="rows">
              {data.items.map((item) => (
                <button className="rowcard link-row" key={item.candidate.id} onClick={() => setOpenId(item.candidate.id)}>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{item.candidate.orgName}</span>
                    <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                      {item.candidate.contactName}
                    </span>
                  </span>
                  {item.mine?.submittedAt ? (
                    <Result panel={data} item={item} />
                  ) : item.mine ? (
                    <span className="badge warn">Draft</span>
                  ) : (
                    <span className="badge">Not started</span>
                  )}
                  <Icon name="chevronRight" size={14} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Result({ panel, item }: { panel: ReviewPanel; item: ReviewItem }) {
  if (panel.evaluation?.method === 'verdict') {
    const outcome = panel.evaluation.outcomes.find((o) => o.id === item.mine?.verdict);
    return outcome ? (
      <span className={outcome.tone === 'neutral' ? 'badge' : `badge ${outcome.tone}`}>{outcome.label}</span>
    ) : (
      <span className="badge ok">Done</span>
    );
  }
  return <span className="badge ok num">{item.score ?? '—'}</span>;
}

/* ------------------------------------------------------------------ */

function ReviewOne({
  panel,
  item,
  onBack,
  onSaved,
}: {
  panel: ReviewPanel;
  item: ReviewItem;
  onBack: () => void;
  onSaved: (next: ReviewPanel) => void;
}) {
  const grid = panel.evaluation!;
  const [marks, setMarks] = useState<Record<string, number>>(item.mine?.marks ?? {});
  const [verdict, setVerdict] = useState(item.mine?.verdict ?? '');
  const [comment, setComment] = useState(item.mine?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const voting = grid.method === 'verdict';
  const preview = normalisedScore(marks, grid.leaves);
  const blocked =
    (grid.requireComment && !comment.trim()) || (voting ? !verdict : preview === null);

  const send = async (submit: boolean) => {
    setSaving(true);
    try {
      const next = await api.post<ReviewPanel>(`/api/me/reviews/${panel.sessionId}/scores`, {
        candidateId: item.candidate.id,
        marks,
        verdict,
        comment,
        submit,
      });
      toast(submit ? `Sent for ${item.candidate.orgName}.` : 'Draft saved.');
      if (submit) onSaved(next);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : (err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="row">
        <button className="btn ghost sm" onClick={onBack}>
          <Icon name="chevronLeft" size={13} /> All startups
        </button>
        <div className="spacer" />
        {item.mine?.submittedAt && <span className="badge ok">Sent {formatDate(item.mine.submittedAt)}</span>}
      </div>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 17 }}>{item.candidate.orgName}</h2>
        {item.answers.map((answer) => (
          <div key={answer.label}>
            <div className="eyebrow">{answer.label}</div>
            <Answer value={answer.value} type={answer.type} />
          </div>
        ))}
        {!item.answers.length && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>No application on file.</p>}
      </section>

      <section className="card card-pad stack" style={{ gap: 12 }}>
        <h3 style={{ fontSize: 15 }}>{voting ? 'Your verdict' : 'Your marks'}</h3>

        {voting ? (
          <>
            {grid.criteria.length > 0 && (
              <div className="rows">
                {grid.criteria.map((c) => (
                  <div className="rowcard" style={{ padding: '8px 11px' }} key={c.id}>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{c.label}</div>
                    {c.help && <div className="faint" style={{ fontSize: 12 }}>{c.help}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="work-pick">
              {grid.outcomes.map((o) => (
                <button
                  key={o.id}
                  className={verdict === o.id ? 'track on' : 'track'}
                  onClick={() => setVerdict(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          grid.leaves.map((leaf) => (
            <div className="row" key={leaf.id} style={{ gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{leaf.label}</div>
                {leaf.help && <div className="faint" style={{ fontSize: 12 }}>{leaf.help}</div>}
              </div>
              {grid.scale === 'stars' ? (
                <div className="stars" role="group" aria-label={leaf.label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className={n <= (marks[leaf.id] ?? 0) ? 'star on' : 'star'}
                      aria-label={`${n} out of 5`}
                      onClick={() =>
                        setMarks((m) => {
                          const next = { ...m };
                          if (n === m[leaf.id]) delete next[leaf.id];
                          else next[leaf.id] = n;
                          return next;
                        })
                      }
                    >
                      <Icon name="star" size={18} />
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  className="input num"
                  style={{ width: 92 }}
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

        <div className="field">
          <label>
            Comment{grid.requireComment && <span style={{ color: 'var(--stop)' }}> *</span>}
          </label>
          <textarea
            className="textarea"
            rows={3}
            value={comment}
            placeholder="What convinced you, and what did not."
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <div className="row">
          <span className="faint" style={{ fontSize: 12.5 }}>
            {voting ? (
              verdict ? (
                <>
                  Your verdict: <strong>{grid.outcomes.find((o) => o.id === verdict)?.label}</strong>
                </>
              ) : (
                'Pick a verdict to send.'
              )
            ) : (
              <>
                Weighted score <strong className="num">{preview ?? '—'}</strong> / 100
              </>
            )}
          </span>
          <div className="spacer" />
          <button className="btn" disabled={saving} onClick={() => send(false)}>
            Save draft
          </button>
          <button className="btn primary" disabled={saving || blocked} onClick={() => send(true)}>
            {item.mine?.submittedAt ? 'Update' : 'Send'}
          </button>
        </div>
      </section>
    </>
  );
}

function Answer({ value, type }: { value: unknown; type: string }) {
  if (type === 'file' && value && typeof value === 'object' && 'uploadId' in value) {
    const file = value as { uploadId: string; filename: string };
    return (
      <a className="btn sm" href={`/api/uploads/${file.uploadId}`} target="_blank" rel="noreferrer">
        <Icon name="file" size={13} /> {file.filename}
      </a>
    );
  }
  return (
    <p style={{ margin: '2px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>
      {Array.isArray(value) ? value.join(', ') : String(value)}
    </p>
  );
}
