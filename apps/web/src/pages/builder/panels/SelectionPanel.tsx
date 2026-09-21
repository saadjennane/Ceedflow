import {
  orderedBlocks,
  selectionSource,
  DEFAULT_OUTCOMES,
  type Block,
  type EvaluationConfig,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { SelectField, TextField } from '../../../ui/Field';
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
  /** Only a block that hands out statuses can feed a funnel. */
  const upstream = ordered.slice(0, index === -1 ? undefined : index).filter((b) => b.type === 'evaluation');

  // The same rule the server applies, so the panel never promises another one.
  const source = selectionSource(track, { ...block, config } as Block);
  const outcomes = source ? ((source.config as EvaluationConfig).outcomes ?? DEFAULT_OUTCOMES) : [];

  const otherCohort = ordered.find(
    (b) => b.type === 'selection' && b.id !== block.id && (b.config as SelectionConfig).outputKind === 'cohort',
  );

  const toggle = (id: string) =>
    patch({
      passOutcomeIds: config.passOutcomeIds.includes(id)
        ? config.passOutcomeIds.filter((x) => x !== id)
        : [...config.passOutcomeIds, id],
    });

  return (
    <>
      <div className="callout">
        <Icon name="filter" size={15} />
        <div>
          A selection is the funnel between two phases. It takes the statuses given upstream and decides which of them
          carry on. It invents no rule of its own — to change what a score is worth, change the band in{' '}
          <strong>{source?.name ?? 'the evaluation'}</strong>.
        </div>
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
              <span>The funnel stays open. Those who pass carry on to the next phase.</span>
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
          <div>
            <strong>{otherCohort.name}</strong> already forms the cohort in this track. Two cohort-forming selections
            will fight over the same candidates — make one of them a shortlist.
          </div>
        </div>
      )}

      <div className="public-sep" />

      <SelectField
        label="Statuses come from"
        value={config.fromBlockId ?? ''}
        onChange={(v) => patch({ fromBlockId: v || null, passOutcomeIds: [] })}
        placeholder={
          upstream.length
            ? `Nearest evaluation before this one (${upstream[upstream.length - 1].name})`
            : 'Nothing upstream hands out a status yet'
        }
        options={upstream.map((b) => ({ value: b.id, label: b.name }))}
        help="An evaluation placed before this block. A committee is reached through the evaluation that scores it."
      />

      <div className="field">
        <label>Which statuses move on</label>
        {outcomes.length ? (
          <div className="pick-list">
            {outcomes.map((o) => (
              <button
                type="button"
                key={o.id}
                className={config.passOutcomeIds.includes(o.id) ? 'pick on' : 'pick'}
                onClick={() => toggle(o.id)}
              >
                <Icon name={config.passOutcomeIds.includes(o.id) ? 'check' : 'square'} />
                <div>
                  <strong>{o.label}</strong>
                  <span>
                    {o.minScore === null
                      ? 'The fallback — everyone no other band caught.'
                      : `Earned from ${o.minScore} out of 100.`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ padding: 18 }}>
            {source ? 'That block hands out no status yet.' : 'Nothing before this block hands out a status.'}
          </div>
        )}
        <div className="hint">
          Take the waitlist too when you need to fill more places. Nothing caps the number that passes — a startup you
          want in or out whatever its status is settled row by row in Review.
        </div>
      </div>

      {!config.passOutcomeIds.length && outcomes.length > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>No status moves on, so this selection passes nobody until you pick one — or say so row by row.</div>
        </div>
      )}

      <div className="grid-2">
        <TextField label="Label for those who pass" value={config.passLabel} onChange={(v) => patch({ passLabel: v })} />
        <TextField
          label="Label for those who do not"
          value={config.failLabel}
          onChange={(v) => patch({ failLabel: v })}
        />
      </div>
    </>
  );
}
