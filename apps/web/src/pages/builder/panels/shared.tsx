import {
  BRICK_STATUS_LABEL,
  BRICK_STATUS_TONE,
  DEFAULT_MARKED_OUT_OF,
  gridLeaves,
  idOf,
  criterionShares,
  sharesLeft,
  sharesOver,
  normalisedScore,
  proposedOutcome,
  type BlockOutcome,
  type CriterionLeaf,
  type EvaluationMethod,
  type EvaluationScale,
  type Candidate,
  type EvaluationCriterion,
  type EvaluationScore,
  type BrickStatus,
  type BrickWindow,
  type PersonRef,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { SelectField, TextField } from '../../../ui/Field';
import { GridMarks } from '../../../ui/GridMarks';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../../ui/Overlays';

/* ------------------------------------------------------------------ */
/* Open to the outside, or not                                         */
/* ------------------------------------------------------------------ */

/**
 * The switch that decides whether a brick is reachable from outside CEED.
 *
 * A toggle, because the question is binary: is this door passable. Underneath
 * it three positions, because leaving it alone has to mean something different
 * from turning it off — `auto` reads the dates, and touching the toggle says
 * you know better than they do. The way back is offered only once you have
 * overridden, so the ordinary case carries no extra furniture.
 *
 * A brick with nothing in it cannot be turned on: publishing an empty form is
 * never what anybody meant.
 */
export function DoorToggle({
  config,
  patch,
  status,
  label,
  missing,
}: {
  config: BrickWindow;
  patch: (partial: Partial<BrickWindow>) => void;
  status: BrickStatus;
  /** What this door is, for whoever reads the tooltip. */
  label: string;
  /** What it is still waiting for, when it is not ready. */
  missing?: string | null;
}) {
  const live = status === 'live';
  const empty = status === 'not_configured';
  const overridden = config.visibility !== 'auto';

  const today = new Date().toISOString().slice(0, 10);
  const flip = () =>
    patch({
      visibility: live ? 'closed' : 'open',
      visibilitySetAt: today,
      // Stamped once and never cleared: it is what tells "over" from "not yet".
      ...(live || config.openedAt ? {} : { openedAt: today }),
    });

  return (
    <div className="door">
      <div className="door-words">
        <span className={`badge ${BRICK_STATUS_TONE[status]}`}>{BRICK_STATUS_LABEL[status]}</span>
        {/* Offered only when there are dates to go back to. On a brick that has
            none it meant nothing, and cost a click to land somewhere confusing. */}
        {overridden && (config.opensAt || config.closesAt) && (
          <button
            type="button"
            className="linkish"
            title={`Held ${config.visibility}${config.visibilitySetAt ? ` since ${formatDate(config.visibilitySetAt)}` : ''}`}
            onClick={() => patch({ visibility: 'auto', visibilitySetAt: null })}
          >
            Follow the dates
          </button>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={live}
        aria-label={label}
        className={live ? 'toggle on' : 'toggle'}
        disabled={empty}
        title={empty ? (missing ?? 'Not ready yet.') : live ? `Close it — ${label}` : `Open it — ${label}`}
        onClick={flip}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

/** The same switch as a card, for a second door that has no room in the header. */
export function VisibilityControl({
  config,
  patch,
  status,
  what,
  missing,
}: {
  config: BrickWindow;
  patch: (partial: Partial<BrickWindow>) => void;
  status: BrickStatus;
  what: { open: string; closed: string; notOpen: string; empty: string };
  missing?: string | null;
}) {
  const live = status === 'live';
  const empty = status === 'not_configured';
  const overridden = config.visibility !== 'auto';

  return (
    <div className={overridden ? 'callout warn' : 'rowcard card-pad'}>
      <div className="stack" style={{ gap: 7, flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <strong style={{ flex: 1, fontSize: 12.5 }}>
            {empty ? (missing ?? what.empty) : live ? what.open : status === 'scheduled' ? what.notOpen : what.closed}
          </strong>
          <DoorToggle config={config} patch={patch} status={status} label={what.open} missing={missing} />
        </div>
        <div className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {empty
            ? 'A door needs something behind it and a date before it can open.'
            : overridden
              ? /* The date is stamped by the toggle, so it is there whenever a
                   person did this. A config written any other way — an import,
                   a fixture — has none, and "since null" reads as a broken
                   door rather than as a missing date. */
                `${config.visibility === 'open' ? 'Held open' : 'Held closed'}${
                  config.visibilitySetAt ? ` since ${formatDate(config.visibilitySetAt)}` : ''
                }, whatever the dates say.`
              : config.opensAt || config.closesAt
                ? 'Following the dates above.'
                : 'No dates, so nothing opens it on its own — use the toggle.'}
        </div>
      </div>
    </div>
  );
}

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

  /* What is still on the table, said in one line under the field. Without it
     a percentage is typed blind: you set 30 and have no idea whether that
     leaves room or has already overrun. */
  // The share each criterion really carries — rounded once, for display.
  const shares = criterionShares(criteria);
  const left = sharesLeft(criteria);
  const over = sharesOver(criteria);
  const shareHint = over
    ? `${over}% over — they will be scaled back to fit a hundred.`
    : left
      ? left.left === 0
        ? `Nothing left. The ${left.among} criteri${left.among === 1 ? 'on' : 'a'} without a share would count for nothing.`
        : `${Math.round(left.left)}% left, shared between ${left.among} criteri${left.among === 1 ? 'on' : 'a'} — ${Math.round(left.left / left.among)}% each.`
      : 'Every criterion is weighted. Leave one empty and it takes what the others do not claim.';

  const blank = (): EvaluationCriterion => ({
    id: idOf.criterion(),
    label: '',
    help: '',
    // No share: it takes an equal cut of what is left until you say otherwise.
    share: null,
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
                  {criterion.label || (
                    <span className="faint">Untitled — open it and give it a name</span>
                  )}
                </button>
                {section && <span className="badge">section · {criterion.children.length}</span>}
                {!unscored && (
                  <span
                    className={criterion.share === null ? 'badge num' : 'badge num ok'}
                    title={
                      criterion.share === null
                        ? 'An equal cut of what the weighted ones leave'
                        : 'The share you gave it'
                    }
                  >
                    {Math.round(shares.get(criterion.id) ?? 0)}%
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
                  {/* Named for what it is: in a panel that votes, these are
                      headings to read, not criteria to mark. Calling the field
                      Criterion under an "Add a heading" button is what made the
                      name look like something you could not change. */}
                  <TextField
                    label={section ? 'Section' : unscored ? 'Heading' : 'Criterion'}
                    value={criterion.label}
                    onChange={(v) => set(criterion.id, { label: v })}
                    placeholder="Team"
                    autoFocus={!criterion.label}
                  />
                  <TextField
                    label={unscored ? 'What to say about it' : 'What to look for'}
                    value={criterion.help}
                    onChange={(v) => set(criterion.id, { help: v })}
                    hint="optional"
                    placeholder="Complementarity, commitment, track record."
                  />

                  {/* One field where there were two. What it is marked out of
                      is now one decision for the whole grid, on Overview — it
                      never changed importance, it only looked as if it did. */}
                  {!unscored && (
                    <div className="field">
                      <label htmlFor={`share-${criterion.id}`}>How much it counts</label>
                      <div className="row" style={{ gap: 8 }}>
                        <div className="suffixed">
                          <input
                            id={`share-${criterion.id}`}
                            className="input num"
                            type="number"
                            min={0}
                            max={100}
                            placeholder="equal"
                            value={criterion.share ?? ''}
                            onChange={(e) =>
                              set(criterion.id, {
                                share: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))),
                              })
                            }
                          />
                          <span>%</span>
                        </div>
                        {criterion.share !== null && (
                          <button
                            className="btn ghost sm"
                            onClick={() => set(criterion.id, { share: null })}
                            title="Back to an equal cut"
                          >
                            <Icon name="x" size={12} /> Equal
                          </button>
                        )}
                      </div>
                      <div className="help">{shareHint}</div>
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
                          {/* No weight of its own: the sub-criteria of a
                              criterion average into its mark, which is what
                              makes them points to consider rather than a second
                              grid hidden inside the first. */}
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
                          { id: idOf.criterion(), label: '', help: '', share: null, weight: 1, max: 10 },
                        ],
                      })
                    }
                  >
                    <Icon name="plus" size={13} /> Add {unscored ? 'a point under it' : 'a sub-criterion'}
                  </button>
                  {!section && (
                    <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                      {unscored
                        ? 'Adding one turns this into a section: the points sit under this heading when the juror reads it.'
                        : 'Adding one turns this into a section: the marks move onto its children, and their average is this criterion’s mark.'}
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
  markedOutOf,
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
  /** The grid's one scale. Every criterion is marked on it. */
  markedOutOf?: number;
  onSaved: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, number>>(existing?.marks ?? {});
  const [verdict, setVerdict] = useState(existing?.verdict ?? '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const toast = useToast();

  const voting = method === 'verdict';
  const leaves = gridLeaves(criteria, markedOutOf);
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
      {/* Whose marks these are, said the same way whether the panel has one
          juror or five. It used to be a dropdown when there was a choice and a
          bold name when there was not, so entering somebody else's paper sheet
          on a one-juror panel read like entering your own. */}
      <div className="entered-as">
        <span className="eyebrow">Marks for {candidate.orgName}, entered as</span>
        <span className="juror">
          <span className="juror-mark">
            {evaluator.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join('')}
          </span>
          {evaluator.name}
        </span>
        {evaluators && evaluators.length > 1 && onEvaluator && (
          <select
            className="status-select"
            value={evaluator.id}
            aria-label="Whose marks these are"
            onChange={(e) => onEvaluator(e.target.value)}
          >
            {evaluators.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
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
        <GridMarks
          criteria={criteria}
          markedOutOf={markedOutOf ?? DEFAULT_MARKED_OUT_OF}
          scale={scale ?? 'points'}
          marks={marks}
          onChange={setMarks}
        />
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
        {/* Only offered once there is something on the record to clear: on an
            empty sheet it would promise an act with nothing to act on. */}
        {existing && (
          <button
            className="btn ghost sm"
            style={{ color: 'var(--stop)' }}
            disabled={saving}
            onClick={() => setConfirmReset(true)}
          >
            <Icon name="trash" size={13} /> Reset
          </button>
        )}
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

      {/* The warning names what goes and what it costs. A reset is not the
          same act as taking a juror off a panel: that one keeps the marks on
          record and stops counting them, because a jury gave them. This one is
          for a sheet that should never have existed — marks typed against the
          wrong name — so it leaves nothing behind. */}
      {confirmReset && existing && (
        <ConfirmDialog
          title={`Clear ${evaluator.name}'s sheet on ${candidate.orgName}?`}
          body={`Their marks${existing.comment ? ' and their comment' : ''} are deleted, not set aside — nothing of this sheet is kept, and the average is recomputed without it straight away. The sheet can be filled in again from nothing. Use this for marks entered against the wrong name; to take a juror off the panel while keeping what they said, do that on the panel instead.`}
          confirmLabel="Clear the sheet"
          destructive
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            setConfirmReset(false);
            setSaving(true);
            try {
              await api.del(`/api/blocks/${blockId}/scores/${candidate.id}/${evaluator.id}`);
              setMarks({});
              setVerdict('');
              setComment('');
              toast('Sheet cleared.');
              onSaved();
            } catch (err) {
              toast((err as Error).message, true);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}


/** One to five, kept a plain radio group so a keyboard reaches it. */

/* ------------------------------------------------------------------ */
/* Trying a grid out                                                   */
/* ------------------------------------------------------------------ */

/**
 * The sheet a juror will fill in, here, with nothing behind it.
 *
 * A grid is a set of numbers until somebody marks something with it: what 30%
 * on Team actually does to a score, and which status a result would earn, are
 * only visible once marks are in. This puts marks in without writing anything
 * down — no candidate, no evaluator, no row. Change a weight above and the
 * number here moves, which is the whole point of having it on the same screen.
 */
export function GridPreview({
  criteria,
  markedOutOf,
  outcomes,
  scale,
}: {
  criteria: EvaluationCriterion[];
  markedOutOf: number;
  outcomes: BlockOutcome[];
  scale: EvaluationScale;
}) {
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);

  const leaves = gridLeaves(criteria, markedOutOf);
  const score = normalisedScore(marks, leaves);
  const proposed = outcomes.find((o) => o.id === proposedOutcome(score, outcomes));
  const missing = leaves.filter((l) => typeof marks[l.id] !== 'number').length;

  if (!leaves.length) return null;

  return (
    <>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        <Icon name="star" size={13} /> Try this grid
      </button>

      {/* A screen of its own, and a window rather than a route: the grid you
          are trying is the one you are editing, which has not been saved yet.
          A page of its own would read the saved version and test the wrong
          thing. Closing it puts you back in the setup where you were. */}
      {open && (
        <Modal
          wide
          title="Try this grid"
          subtitle="Mark it as a juror would. Nothing here is saved — no candidate, no evaluator, no row."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button
                className="btn ghost"
                disabled={!Object.keys(marks).length}
                onClick={() => setMarks({})}
              >
                <Icon name="x" size={13} /> Clear the marks
              </button>
              <div className="spacer" />
              <span style={{ fontSize: 13 }}>
                Weighted score <strong className="num">{score ?? '—'}</strong> / 100
              </span>
              {proposed && (
                <span className={proposed.tone === 'neutral' ? 'badge' : `badge ${proposed.tone}`}>
                  Would be proposed {proposed.label}
                </span>
              )}
              <button className="btn primary" onClick={() => setOpen(false)}>
                Back to the setup
              </button>
            </>
          }
        >
          <div className="stack" style={{ gap: 12 }}>
            <GridMarks
              criteria={criteria}
              markedOutOf={markedOutOf}
              scale={scale}
              marks={marks}
              onChange={setMarks}
            />

            {missing > 0 && (
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                {/* Said out loud: a partial sheet scores on what was marked,
                    which is how a juror's draft behaves too. */}
                {missing} of {leaves.length} not marked — the score is on what is.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
