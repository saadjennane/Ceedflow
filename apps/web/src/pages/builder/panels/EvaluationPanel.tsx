import { orderedBlocks, type Block, type EvaluationConfig, type TrackWithPhases } from '@ceed/shared';
import { DateField, SelectField, TagField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { CriteriaEditor, OutcomeEditor } from './shared';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function EvaluationSetup({
  block,
  config,
  patch,
  track,
}: {
  block: Block;
  config: EvaluationConfig;
  patch: (partial: Partial<EvaluationConfig>) => void;
  track: TrackWithPhases;
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

  return (
    <>
      <div className="callout">
        <Icon name="star" size={15} />
        Each evaluator marks every criterion. Marks become a score out of 100 using the weights, and that score earns
        the startup a status — which is what the next block reads to know who it is dealing with.
      </div>

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
          Scoring <strong>{scoped.name}</strong>: the startups come from its sittings, and each sitting is marked by its
          own jury. The evaluator list below is not used.
        </div>
      ) : (
        <TagField
          label="Evaluators"
          values={config.evaluators}
          onChange={(v) => patch({ evaluators: v })}
          help="Who scores. Names for now — they become directory profiles once Community is built."
          placeholder="Add an evaluator"
        />
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

      <div className="public-sep" />
      <CriteriaEditor criteria={config.criteria} onChange={(criteria) => patch({ criteria })} />

      <div className="public-sep" />
      <OutcomeEditor outcomes={config.outcomes} onChange={(outcomes) => patch({ outcomes })} />
    </>
  );
}
