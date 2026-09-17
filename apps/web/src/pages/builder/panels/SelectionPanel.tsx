import { orderedBlocks, type Block, type SelectionConfig, type TrackWithPhases } from '@ceed/shared';
import { NumberField, SelectField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function SelectionSetup({
  block,
  config,
  patch,
  track,
}: {
  block: Block;
  config: SelectionConfig;
  patch: (partial: Partial<SelectionConfig>) => void;
  track: TrackWithPhases;
}) {
  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === block.id);
  // A committee scores too, so the jury's marks can drive the cut.
  const upstreamScoring = ordered
    .slice(0, index === -1 ? undefined : index)
    .filter((b) => b.type === 'evaluation' || b.type === 'committee');
  const otherCohort = ordered.find(
    (b) => b.type === 'selection' && b.id !== block.id && (b.config as SelectionConfig).outputKind === 'cohort',
  );

  return (
    <>
      <div className="callout">
        <Icon name="filter" size={15} />
        A selection cuts the funnel. Everyone who passes moves on to the blocks after it; everyone who does not stops
        here. Publishing writes the result onto each candidate.
      </div>

      <div className="field">
        <label>What this selection produces</label>
        <div className="pick-list">
          <button
            type="button"
            className={config.outputKind === 'shortlist' ? 'pick on' : 'pick'}
            onClick={() => patch({ outputKind: 'shortlist', passLabel: 'Shortlisted' })}
          >
            <Icon name={config.outputKind === 'shortlist' ? 'check' : 'square'} />
            <div>
              <strong>A shortlist</strong>
              <span>The funnel stays open. Those who pass carry on to the next block.</span>
            </div>
          </button>
          <button
            type="button"
            className={config.outputKind === 'cohort' ? 'pick on' : 'pick'}
            onClick={() => patch({ outputKind: 'cohort', passLabel: 'Selected' })}
          >
            <Icon name={config.outputKind === 'cohort' ? 'check' : 'square'} />
            <div>
              <strong>The cohort</strong>
              <span>This is the last cut. Those who pass are the startups of the edition.</span>
            </div>
          </button>
        </div>
      </div>

      {config.outputKind === 'cohort' && otherCohort && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <strong>{otherCohort.name}</strong> already forms the cohort in this track. Two cohort-forming selections will
          fight over the same candidates — make one of them a shortlist.
        </div>
      )}

      <div className="public-sep" />

      <SelectField
        label="Score comes from"
        value={config.sourceBlockId ?? ''}
        onChange={(v) => patch({ sourceBlockId: v || null })}
        placeholder={
          upstreamScoring.length
            ? `Nearest scoring block before this one (${upstreamScoring[upstreamScoring.length - 1].name})`
            : 'Nothing upstream scores yet'
        }
        options={upstreamScoring.map((b) => ({
          value: b.id,
          label: `${b.name} · ${b.type === 'committee' ? 'committee' : 'evaluation'}`,
        }))}
        help="An evaluation or a selection committee placed before this block — both produce a score out of 100."
      />

      <SelectField
        label="How the cut is made"
        value={config.method}
        onChange={(v) => patch({ method: v as SelectionConfig['method'] })}
        options={[
          { value: 'threshold', label: 'Everyone at or above a score' },
          { value: 'top_n', label: 'The best N by score' },
          { value: 'manual', label: 'Decided by hand' },
        ]}
      />

      {config.method === 'threshold' && (
        <NumberField
          label="Passing score"
          value={config.threshold}
          onChange={(v) => patch({ threshold: v })}
          min={0}
          max={100}
          help="Out of 100, on the weighted score of the evaluation above."
        />
      )}
      {config.method === 'top_n' && (
        <NumberField label="How many pass" value={config.topN} onChange={(v) => patch({ topN: v })} min={1} />
      )}
      {config.method === 'manual' && (
        <div className="callout">
          <Icon name="alert" size={15} />
          Nobody passes until you mark them in the Decision tab. Useful after a committee, where the jury's call is not
          a formula.
        </div>
      )}

      <div className="grid-2">
        <TextField label="Label for those who pass" value={config.passLabel} onChange={(v) => patch({ passLabel: v })} />
        <TextField label="Label for those who do not" value={config.failLabel} onChange={(v) => patch({ failLabel: v })} />
      </div>

      {!upstreamScoring.length && config.method !== 'manual' && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          Nothing before this block produces a score, so this rule can never pass anyone. Either put an evaluation or a
          committee upstream, or set the cut to <strong>decided by hand</strong> — which is what you want if this
          selection is made from the list itself.
        </div>
      )}
    </>
  );
}
