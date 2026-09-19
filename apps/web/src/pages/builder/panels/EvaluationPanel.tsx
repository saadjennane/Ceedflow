import { orderedBlocks, type Block, type EvaluationConfig, type TrackWithPhases } from '@ceed/shared';
import { DateField, SelectField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { CriteriaEditor, OutcomeEditor } from './shared';

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
      <CriteriaEditor criteria={config.criteria} onChange={(criteria) => patch({ criteria })} />
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
              onClick={() => patch({ scale: 'points' })}
            >
              <Icon name={config.scale === 'points' ? 'check' : 'square'} />
              <div>
                <strong>Out of a number</strong>
                <span>Each criterion carries its own maximum.</span>
              </div>
            </button>
            <button
              type="button"
              className={config.scale === 'stars' ? 'pick on' : 'pick'}
              onClick={() => patch({ scale: 'stars' })}
            >
              <Icon name={config.scale === 'stars' ? 'check' : 'square'} />
              <div>
                <strong>Stars</strong>
                <span>One to five. A single criterion marked this way is simply an overall rating.</span>
              </div>
            </button>
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
