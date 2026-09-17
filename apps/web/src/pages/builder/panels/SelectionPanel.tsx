import {
  orderedBlocks,
  type Block,
  type Candidate,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { NumberField, SelectField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, useToast } from '../../../ui/Overlays';
import { useAsync } from '../../../lib/useAsync';

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
          Nothing before this block produces a score, so no candidate has one and none will pass automatically. Add an
          evaluation or a committee upstream, or switch to deciding by hand.
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Decision                                                            */
/* ------------------------------------------------------------------ */

interface SelectionRow {
  candidate: Candidate;
  score: number | null;
  computed: 'pass' | 'fail';
  outcome: 'pass' | 'fail';
  overridden: boolean;
}

interface SelectionView {
  config: SelectionConfig;
  published: boolean;
  rows: SelectionRow[];
  passCount: number;
  failCount: number;
}

export function SelectionDecision({ block, onChanged }: { block: Block; onChanged: () => void }) {
  const view = useAsync(() => api.get<SelectionView>(`/api/blocks/${block.id}/selection`), block.id);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { rows, passCount, failCount, published, config } = view.data;
  const isCohort = config.outputKind === 'cohort';

  if (!rows.length) {
    return (
      <div className="empty">
        <h3>Nobody has reached this selection</h3>
        <p>Candidates arrive here once they pass the selection before it — or as soon as they apply, if this is the first cut.</p>
      </div>
    );
  }

  const setOutcome = async (candidateId: string, outcome: 'pass' | 'fail') => {
    setBusy(true);
    try {
      view.set(await api.post<SelectionView>(`/api/blocks/${block.id}/selection/outcome`, { candidateId, outcome }));
      if (published) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      view.set(await api.post<SelectionView>(`/api/blocks/${block.id}/selection/publish`));
      onChanged();
      toast(isCohort ? 'Cohort published.' : 'Shortlist published.');
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      view.set(await api.post<SelectionView>(`/api/blocks/${block.id}/selection/unpublish`));
      onChanged();
      toast('Selection withdrawn. Candidate statuses stay as they were.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="funnel">
        <div className="funnel-step">
          <div className="eyebrow">Reviewed</div>
          <div className="n">{rows.length}</div>
        </div>
        <div className="funnel-arrow">
          <Icon name="arrowRight" size={16} />
        </div>
        <div className="funnel-step" style={{ borderColor: 'var(--ok)' }}>
          <div className="eyebrow">{config.passLabel}</div>
          <div className="n" style={{ color: 'var(--ok)' }}>
            {passCount}
          </div>
        </div>
        <div className="funnel-step">
          <div className="eyebrow">{config.failLabel}</div>
          <div className="n faint">{failCount}</div>
        </div>
      </div>

      {published ? (
        <div className="callout ok">
          <Icon name="check" size={15} />
          <div style={{ flex: 1 }}>
            <strong>Published {config.publishedAt ? `on ${formatDate(config.publishedAt)}` : ''}.</strong>{' '}
            {isCohort
              ? 'These startups are the cohort of the edition.'
              : 'Those who passed carry on to the blocks after this one.'}{' '}
            Changing a decision below updates that candidate straight away — that is how a withdrawal or a repêchage is
            handled.
          </div>
        </div>
      ) : (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          Not published. Nothing below has reached the candidates yet, and no block downstream sees this result.
        </div>
      )}

      <div className="row">
        <div className="spacer" />
        {published ? (
          <button className="btn" disabled={busy} onClick={unpublish}>
            Withdraw publication
          </button>
        ) : (
          <button className="btn primary" disabled={busy} onClick={() => setConfirmPublish(true)}>
            <Icon name="check" size={14} /> Publish {isCohort ? 'the cohort' : 'the shortlist'}
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="data score-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th style={{ textAlign: 'right' }}>Score</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.candidate.id}>
                <td className="name">
                  {row.candidate.orgName}
                  {row.overridden && (
                    <span className="badge info" style={{ marginLeft: 7 }} title="Changed from what the rule produced">
                      Changed by hand
                    </span>
                  )}
                </td>
                <td className="score" style={{ textAlign: 'right' }}>
                  {row.score ?? '—'}
                </td>
                <td style={{ width: 210 }}>
                  <div className="seg" role="group">
                    <button
                      className={row.outcome === 'pass' ? 'on' : ''}
                      disabled={busy}
                      onClick={() => setOutcome(row.candidate.id, 'pass')}
                    >
                      {config.passLabel}
                    </button>
                    <button
                      className={row.outcome === 'fail' ? 'on' : ''}
                      disabled={busy}
                      onClick={() => setOutcome(row.candidate.id, 'fail')}
                    >
                      {config.failLabel}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmPublish && (
        <ConfirmDialog
          title={isCohort ? 'Publish the cohort?' : 'Publish the shortlist?'}
          body={`${passCount} candidate${passCount === 1 ? '' : 's'} marked ${config.passLabel.toLowerCase()}, ${failCount} marked ${config.failLabel.toLowerCase()}. Each candidate's status is updated, and the blocks after this one start from the ones who passed. You can withdraw the publication afterwards.`}
          confirmLabel="Publish"
          onClose={() => setConfirmPublish(false)}
          onConfirm={publish}
        />
      )}
    </>
  );
}
