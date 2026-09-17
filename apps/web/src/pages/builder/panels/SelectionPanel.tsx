import {
  orderedBlocks,
  type Block,
  type BlockOutcome,
  type Candidate,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { NumberField, SelectField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../../ui/Overlays';
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
/* Decision — the action                                               */
/* ------------------------------------------------------------------ */

type Arrival = 'funnel' | 'manual' | 'status';

interface SelectionRow {
  candidate: Candidate;
  score: number | null;
  outcomeId: string | null;
  arrival: Arrival;
  computed: 'pass' | 'fail';
  outcome: 'pass' | 'fail';
  overridden: boolean;
}

interface PoolRow {
  candidate: Candidate;
  score: number | null;
  outcomeId: string | null;
}

interface StatusSource {
  blockId: string;
  name: string;
  type: string;
  outcomes: BlockOutcome[];
}

interface SelectionView {
  config: SelectionConfig;
  sourceBlockId: string | null;
  sourceName: string | null;
  sourceOutcomes: BlockOutcome[];
  statusSources: StatusSource[];
  includeFromBlockId: string | null;
  published: boolean;
  rows: SelectionRow[];
  pool: PoolRow[];
  passCount: number;
  failCount: number;
}

const ARRIVAL_BADGE: Record<Arrival, { label: string; title: string } | null> = {
  funnel: null,
  manual: { label: 'Added by hand', title: 'Put on this list by the team, not by the funnel' },
  status: { label: 'By status', title: 'On this list because of the status it carries' },
};

export function SelectionDecision({ block, onChanged }: { block: Block; onChanged: () => void }) {
  const view = useAsync(() => api.get<SelectionView>(`/api/blocks/${block.id}/selection`), block.id);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { rows, pool, passCount, failCount, published, config, sourceOutcomes } = view.data;
  const { statusSources, includeFromBlockId } = view.data;
  const recruiting = statusSources.find((b) => b.blockId === includeFromBlockId) ?? null;
  const isCohort = config.outputKind === 'cohort';
  const outcomeLabel = (id: string | null) => sourceOutcomes.find((o) => o.id === id);

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

  const remove = async (candidateId: string, name: string) => {
    setBusy(true);
    try {
      view.set(await api.post<SelectionView>(`/api/blocks/${block.id}/selection/remove`, { candidateId }));
      if (published) onChanged();
      toast(`${name} taken off the list.`);
    } finally {
      setBusy(false);
    }
  };

  const addedCount = rows.filter((r) => r.arrival !== 'funnel').length;

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

      <div className="row wrap">
        {addedCount > 0 && (
          <span className="badge info num">
            {addedCount} not from the funnel
          </span>
        )}
        {config.includeOutcomeIds.length > 0 && recruiting && (
          <span className="badge">
            Pulling{' '}
            {config.includeOutcomeIds
              .map((id) => recruiting.outcomes.find((o) => o.id === id)?.label ?? id)
              .join(', ')}{' '}
            from {recruiting.name}
          </span>
        )}
        <div className="spacer" />
        <button className="btn sm" disabled={busy} onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add startups
        </button>
        {published ? (
          <button className="btn" disabled={busy} onClick={unpublish}>
            Withdraw publication
          </button>
        ) : (
          <button className="btn primary" disabled={busy || !rows.length} onClick={() => setConfirmPublish(true)}>
            <Icon name="check" size={14} /> Publish {isCohort ? 'the cohort' : 'the shortlist'}
          </button>
        )}
      </div>

      {!rows.length ? (
        <div className="empty">
          <h3>Nobody has reached this selection</h3>
          <p>
            Candidates arrive here once they pass the selection before it — or as soon as they apply, if this is the
            first cut. You can also put startups on the list yourself.
          </p>
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add startups
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data score-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th style={{ textAlign: 'right' }}>Score</th>
                {sourceOutcomes.length > 0 && <th>Status</th>}
                <th>Decision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = ARRIVAL_BADGE[row.arrival];
                const status = outcomeLabel(row.outcomeId);
                return (
                  <tr key={row.candidate.id}>
                    <td className="name">
                      {row.candidate.orgName}
                      {badge && (
                        <span className="badge info" style={{ marginLeft: 7 }} title={badge.title}>
                          {badge.label}
                        </span>
                      )}
                      {row.overridden && (
                        <span className="badge" style={{ marginLeft: 7 }} title="Changed from what the rule produced">
                          Changed by hand
                        </span>
                      )}
                    </td>
                    <td className="score" style={{ textAlign: 'right' }}>
                      {row.score ?? '—'}
                    </td>
                    {sourceOutcomes.length > 0 && (
                      <td>
                        {status ? (
                          <span className={status.tone === 'neutral' ? 'badge' : `badge ${status.tone}`}>
                            {status.label}
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                    )}
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
                    <td style={{ textAlign: 'right' }}>
                      {row.arrival === 'manual' && (
                        <button
                          className="btn ghost icon sm"
                          disabled={busy}
                          title="Take off this list"
                          aria-label="Take off this list"
                          onClick={() => remove(row.candidate.id, row.candidate.orgName)}
                        >
                          <Icon name="x" size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddToSelectionModal
          pool={pool}
          statusSources={statusSources}
          recruitingId={includeFromBlockId}
          config={config}
          onClose={() => setAdding(false)}
          onAdd={async (payload) => {
            view.set(await api.post<SelectionView>(`/api/blocks/${block.id}/selection/add`, payload));
            if (published) onChanged();
            toast('List updated.');
          }}
        />
      )}

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

/* ------------------------------------------------------------------ */

function AddToSelectionModal({
  pool,
  statusSources,
  recruitingId,
  config,
  onClose,
  onAdd,
}: {
  pool: PoolRow[];
  statusSources: StatusSource[];
  recruitingId: string | null;
  config: SelectionConfig;
  onClose: () => void;
  onAdd: (payload: {
    candidateIds?: string[];
    fromOutcomeIds?: string[];
    fromBlockId?: string | null;
    outcome?: 'pass' | 'fail';
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'pool' | 'status'>('pool');
  const [chosen, setChosen] = useState<string[]>([]);
  const [fromBlockId, setFromBlockId] = useState<string>(recruitingId ?? statusSources[statusSources.length - 1]?.blockId ?? '');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [landing, setLanding] = useState<'pass' | 'fail' | 'rule'>('pass');
  const [saving, setSaving] = useState(false);

  const from = statusSources.find((b) => b.blockId === fromBlockId) ?? null;
  const sourceOutcomes = from?.outcomes ?? [];
  // Only the block currently recruiting has statuses already pulled in.
  const alreadyPulled = (id: string) => fromBlockId === recruitingId && config.includeOutcomeIds.includes(id);
  const wouldCome = pool.filter((p) => p.outcomeId && statuses.includes(p.outcomeId)).length;
  const ready = mode === 'pool' ? chosen.length > 0 : statuses.length > 0;

  return (
    <Modal
      title="Add startups to this selection"
      subtitle="For a repêchage, a wildcard, or anyone the score rule alone would leave out."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!ready || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onAdd({
                  candidateIds: mode === 'pool' ? chosen : undefined,
                  fromOutcomeIds: mode === 'status' ? statuses : undefined,
                  fromBlockId: mode === 'status' ? fromBlockId : undefined,
                  outcome: landing === 'rule' ? undefined : landing,
                });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Adding…' : mode === 'pool' ? `Add ${chosen.length || ''}` : `Add ${wouldCome || ''}`}
          </button>
        </>
      }
    >
      <div className="seg" role="group" style={{ alignSelf: 'flex-start' }}>
        <button className={mode === 'pool' ? 'on' : ''} onClick={() => setMode('pool')}>
          Pick startups
        </button>
        <button className={mode === 'status' ? 'on' : ''} onClick={() => setMode('status')} disabled={!statusSources.length}>
          By status
        </button>
      </div>

      {mode === 'pool' ? (
        !pool.length ? (
          <div className="empty" style={{ padding: 26 }}>
            Every startup in this track is already on the list.
          </div>
        ) : (
          <div className="rows">
            {pool.map(({ candidate, score, outcomeId }) => {
              const status = sourceOutcomes.find((o) => o.id === outcomeId);
              return (
                <label className="check rowcard" style={{ padding: '9px 11px' }} key={candidate.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(candidate.id)}
                    onChange={(e) =>
                      setChosen((c) => (e.target.checked ? [...c, candidate.id] : c.filter((id) => id !== candidate.id)))
                    }
                  />
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>{candidate.orgName}</strong>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {candidate.status}
                    </div>
                  </span>
                  {status && (
                    <span className={status.tone === 'neutral' ? 'badge' : `badge ${status.tone}`}>{status.label}</span>
                  )}
                  <span className="num faint" style={{ fontSize: 12.5 }}>
                    {score ?? '—'}
                  </span>
                </label>
              );
            })}
          </div>
        )
      ) : !statusSources.length ? (
        <div className="empty" style={{ padding: 26 }}>
          Nothing upstream hands out statuses, so there is none to pull from.
        </div>
      ) : (
        <>
          <SelectField
            label="Statuses given by"
            value={fromBlockId}
            onChange={(v) => {
              setFromBlockId(v);
              setStatuses([]);
            }}
            options={statusSources.map((b) => ({
              value: b.blockId,
              label: `${b.name} · ${b.type === 'committee' ? 'committee' : 'evaluation'}`,
            }))}
            help="Reach back to an earlier block to fish out a startup the funnel dropped."
          />
          {recruitingId && fromBlockId !== recruitingId && config.includeOutcomeIds.length > 0 && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              Statuses are currently pulled from another block. Choosing here replaces that rule — startups already on
              the list because of it drop off unless they got there another way.
            </div>
          )}
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            Everyone carrying one of these statuses joins the list, now and as the status is given to others later.
          </p>
          <div className="rows">
            {sourceOutcomes.map((outcome) => {
              const already = alreadyPulled(outcome.id);
              const count = pool.filter((p) => p.outcomeId === outcome.id).length;
              return (
                <label className="check rowcard" style={{ padding: '9px 11px' }} key={outcome.id}>
                  <input
                    type="checkbox"
                    disabled={already}
                    checked={already || statuses.includes(outcome.id)}
                    onChange={(e) =>
                      setStatuses((s) => (e.target.checked ? [...s, outcome.id] : s.filter((id) => id !== outcome.id)))
                    }
                  />
                  <span style={{ flex: 1 }}>
                    <span className={outcome.tone === 'neutral' ? 'badge' : `badge ${outcome.tone}`}>
                      {outcome.label}
                    </span>
                    {already && <span className="faint" style={{ fontSize: 12 }}> · already pulled in</span>}
                  </span>
                  <span className="num faint" style={{ fontSize: 12.5 }}>
                    {count} waiting
                  </span>
                </label>
              );
            })}
          </div>
          {sourceOutcomes.every((o) => alreadyPulled(o.id)) && sourceOutcomes.length > 0 && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              Every status from this block is already pulled in.
            </p>
          )}
        </>
      )}

      <div className="public-sep" />

      <div className="field">
        <label>How they land</label>
        <div className="help">
          The score rule decides for everyone else. Choosing here is what overrides it for these startups.
        </div>
        <div className="seg" role="group" style={{ alignSelf: 'flex-start' }}>
          <button className={landing === 'pass' ? 'on' : ''} onClick={() => setLanding('pass')}>
            {config.passLabel}
          </button>
          <button className={landing === 'fail' ? 'on' : ''} onClick={() => setLanding('fail')}>
            {config.failLabel}
          </button>
          <button className={landing === 'rule' ? 'on' : ''} onClick={() => setLanding('rule')}>
            Let the rule decide
          </button>
        </div>
      </div>
    </Modal>
  );
}
