import {
  criterionMark,
  criterionShares,
  type EvaluationCriterion,
  type EvaluationScale,
} from '@ceed/shared';
import { Icon } from './Icon';

/**
 * A grid as the person marking it sees it.
 *
 * The shape on screen is the shape of the rule: a criterion carries a share of
 * the final mark, and its sub-criteria are points to consider under it, which
 * average into the criterion's own mark. Flattened to its leaves — as both
 * screens used to do — seventeen questions each worth six percent say nothing
 * about the six things actually being judged, and the mark a criterion earned
 * is nowhere to be seen.
 *
 * Written once and used by the juror's screen and by the setup's preview,
 * because those two drifting apart is what hid this for weeks.
 */
export function GridMarks({
  criteria,
  markedOutOf,
  scale,
  marks,
  onChange,
}: {
  criteria: EvaluationCriterion[];
  markedOutOf: number;
  scale: EvaluationScale;
  marks: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const shares = criterionShares(criteria);
  // Stars are always out of five; a number takes the scale the grid was set to.
  const outOf = scale === 'stars' ? 5 : markedOutOf;

  const setMark = (id: string, value: number | null) => {
    const next = { ...marks };
    if (value === null) delete next[id];
    else next[id] = value;
    onChange(next);
  };

  return (
    <div className="grid-marks">
      {criteria.map((criterion) => {
        const share = Math.round(shares.get(criterion.id) ?? 0);
        const mark = criterionMark(criterion, marks);
        const label = criterion.label || 'Untitled';

        return (
          <section className="criterion" key={criterion.id}>
            <div className="criterion-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="criterion-name">{criterion.label || <span className="faint">Untitled</span>}</div>
                {criterion.help && <div className="faint criterion-help">{criterion.help}</div>}
              </div>

              <span className="badge">{share}% of the final mark</span>

              {criterion.children.length > 0 ? (
                /* The number that actually counts. An unmarked heading shows a
                   dash rather than a zero: nothing has been said about it yet. */
                <span className={mark === null ? 'criterion-mark faint' : 'criterion-mark'}>
                  <strong className="num">{mark === null ? '—' : round(mark)}</strong>
                  <span className="faint"> / {outOf}</span>
                </span>
              ) : (
                <MarkInput
                  id={criterion.id}
                  label={label}
                  scale={scale}
                  outOf={outOf}
                  value={marks[criterion.id]}
                  onChange={setMark}
                />
              )}
            </div>

            {criterion.children.length > 0 && (
              <div className="criterion-children">
                {criterion.children.map((child) => (
                  <div className="row" key={child.id} style={{ gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="child-name">{child.label || <span className="faint">Untitled</span>}</div>
                      {child.help && <div className="faint criterion-help">{child.help}</div>}
                    </div>
                    <MarkInput
                      id={child.id}
                      label={child.label || 'Mark'}
                      scale={scale}
                      outOf={outOf}
                      value={marks[child.id]}
                      onChange={setMark}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** One decimal, and no trailing .0 on a whole mark. */
const round = (n: number) => Math.round(n * 10) / 10;

function MarkInput({
  id,
  label,
  scale,
  outOf,
  value,
  onChange,
}: {
  id: string;
  label: string;
  scale: EvaluationScale;
  outOf: number;
  value: number | undefined;
  onChange: (id: string, value: number | null) => void;
}) {
  if (scale === 'stars') {
    return (
      <div className="stars" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= (value ?? 0) ? 'star on' : 'star'}
            aria-label={`${n} out of 5`}
            // Clicking the star you are on takes the mark back off.
            onClick={() => onChange(id, n === value ? null : n)}
          >
            <Icon name="star" size={26} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <input
      className="input num"
      style={{ width: 96 }}
      type="number"
      min={0}
      max={outOf}
      placeholder={`0–${outOf}`}
      value={value ?? ''}
      aria-label={label}
      onChange={(e) =>
        onChange(id, e.target.value === '' ? null : Math.max(0, Math.min(outOf, Number(e.target.value))))
      }
    />
  );
}
