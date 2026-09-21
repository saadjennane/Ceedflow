import {
  DEFAULT_MARKED_OUT_OF,
  orderedBlocks,
  type Block,
  type EvaluationConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { DateField, SelectField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { CriteriaEditor, GridPreview, OutcomeEditor } from './shared';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

/** The sections of the Evaluation drawer, in the order they are shown. */
export const EVALUATION_TABS = ['Overview', 'Grid', 'Statuses'] as const;
export type EvaluationTab = (typeof EVALUATION_TABS)[number];

export function EvaluationSetup({
  block,
  config,
  patch,
  track,
  tab = 'Overview',
}: {
  block: Block;
  config: EvaluationConfig;
  patch: (partial: Partial<EvaluationConfig>) => void;
  track: TrackWithPhases;
  tab?: EvaluationTab;
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

  const verdict = config.method === 'verdict';
  const marked = config.criteria.reduce((n, c) => n + (c.children.length || 1), 0);

  if (tab === 'Grid') {
    return verdict ? (
      <>
        <div className="callout">
          <Icon name="list" size={15} />
          <div>
            This panel <strong>votes</strong> rather than marks, so nothing here is scored. What you write is shown
            beside the status picker as what to look at — which is what keeps a verdict from being a shrug.
          </div>
        </div>
        <CriteriaEditor criteria={config.criteria} onChange={(criteria) => patch({ criteria })} unscored />
      </>
    ) : (
      <>
        <CriteriaEditor criteria={config.criteria} onChange={(criteria) => patch({ criteria })} />
        {/* Right under the grid, because what a weight does is only visible
            once something is marked with it. */}
        <GridPreview
          criteria={config.criteria}
          markedOutOf={config.markedOutOf}
          outcomes={config.outcomes}
          scale={config.scale}
        />
      </>
    );
  }

  if (tab === 'Statuses') {
    return (
      <>
        <div className="callout">
          <Icon name="filter" size={15} />
          {verdict
            ? 'The panel votes in these words, and the rule below settles it.'
            : 'What a score earns. The band it reaches is the status it gets.'}
        </div>
        {verdict && (
          <div className="field">
            <label>How the votes settle</label>
            <div className="pick-list">
              <button
                type="button"
                className={config.voteRule === 'majority' ? 'pick on' : 'pick'}
                onClick={() => patch({ voteRule: 'majority' })}
              >
                <Icon name={config.voteRule === 'majority' ? 'check' : 'square'} />
                <div>
                  <strong>A majority</strong>
                  <span>More than half the votes cast — not merely the most, so two out of five never decides.</span>
                </div>
              </button>
              <button
                type="button"
                className={config.voteRule === 'unanimous' ? 'pick on' : 'pick'}
                onClick={() => patch({ voteRule: 'unanimous' })}
              >
                <Icon name={config.voteRule === 'unanimous' ? 'check' : 'square'} />
                <div>
                  <strong>Unanimity</strong>
                  <span>Everybody agrees, or the panel counts as split.</span>
                </div>
              </button>
            </div>
          </div>
        )}
        <OutcomeEditor
          outcomes={config.outcomes}
          onChange={(outcomes) => patch({ outcomes })}
          mode={verdict ? 'verdict' : 'score'}
        />
      </>
    );
  }

  return (
    <>
      <div className="callout">
        <Icon name="star" size={15} />
        {verdict
          ? 'Each evaluator names a status. A majority — or unanimity — settles what the startup comes out with.'
          : 'Each evaluator marks every criterion. Marks become a score out of 100 using the weights, and that score earns the startup a status.'}
      </div>

      <div className="field">
        <label>What an evaluator gives</label>
        <div className="pick-list">
          <button
            type="button"
            className={!verdict ? 'pick on' : 'pick'}
            onClick={() => patch({ method: 'score' })}
          >
            <Icon name={!verdict ? 'check' : 'square'} />
            <div>
              <strong>A score</strong>
              <span>Marks on a grid, weighted into a number out of 100. The next block can cut on it.</span>
            </div>
          </button>
          <button type="button" className={verdict ? 'pick on' : 'pick'} onClick={() => patch({ method: 'verdict' })}>
            <Icon name={verdict ? 'check' : 'square'} />
            <div>
              <strong>A verdict</strong>
              <span>
                The status itself. No numbers — the panel votes in the same words the block produces, and a selection
                after it cuts on those words.
              </span>
            </div>
          </button>
        </div>
      </div>

      {!verdict && (
        <div className="field">
          <label>How a mark is given</label>
          <div className="pick-list">
            <button
              type="button"
              className={config.scale === 'points' ? 'pick on' : 'pick'}
              /* Leaving the stars gives the scale back its own number rather
                 than leaving the five behind, which would read as a choice
                 nobody made. */
              onClick={() =>
                patch({
                  scale: 'points',
                  ...(config.markedOutOf === 5 ? { markedOutOf: DEFAULT_MARKED_OUT_OF } : {}),
                })
              }
            >
              <Icon name={config.scale === 'points' ? 'check' : 'square'} />
              <div>
                <strong>Out of a number</strong>
                <span>One scale for the whole grid — every criterion is marked the same way.</span>
              </div>
            </button>
            <button
              type="button"
              className={config.scale === 'stars' ? 'pick on' : 'pick'}
              /* Stars are five, and the draft has to say so at once: the schema
                 only settles it on save, and the grid is tried before that. */
              onClick={() => patch({ scale: 'stars', markedOutOf: 5 })}
            >
              <Icon name={config.scale === 'stars' ? 'check' : 'square'} />
              <div>
                <strong>Stars</strong>
                <span>One to five, whatever the grid holds. A single criterion marked this way is simply an overall rating.</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* The scale belongs to the grid, not to each line of it: asking again on
          every criterion made the number look like importance, which it never
          was — it is divided out before anything is weighed. */}
      {!verdict && config.scale === 'points' && (
        <div className="field">
          <label htmlFor="marked-out-of">Marked out of</label>
          <div className="suffixed">
            <input
              id="marked-out-of"
              className="input num"
              type="number"
              min={2}
              max={100}
              value={config.markedOutOf}
              onChange={(e) =>
                patch({ markedOutOf: Math.max(2, Math.min(100, Number(e.target.value) || DEFAULT_MARKED_OUT_OF)) })
              }
            />
          </div>
          <div className="help">
            Every criterion is marked on this scale, and the final mark is always out of 100. How much each
            criterion counts is said in the grid, as a percentage.
            {marked > 0 && (
              <>
                {' '}
                <strong>Marks already given keep the number they were given</strong> — moving the scale changes what
                they mean, so change it before the reviewing starts, not during.
              </>
            )}
          </div>
        </div>
      )}

      {verdict && marked > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            The <strong>{marked}</strong> marked {marked === 1 ? 'criterion stays' : 'criteria stay'} in the grid but
            nothing is scored on {marked === 1 ? 'it' : 'them'} any more. Any marks already given are kept — switch
            back and they count again.
          </div>
        </div>
      )}

      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        {config.closesAt
          ? 'After that date reviewers can still read, but file nothing. Your own screen stays open — move the date to reopen theirs.'
          : 'No closing date: reviewers can file for as long as the block exists.'}
      </p>

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
          Scored by <strong>{scoped.name}</strong>. Who reviews and which startups they take is set there — this block
          only says with what grid.
        </div>
      ) : (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>Nothing scores this grid.</strong> Who reviews is a committee's to say, so add one in this phase —
            an event with a date, or asynchronous work spread over days.
          </div>
        </div>
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

    </>
  );
}
