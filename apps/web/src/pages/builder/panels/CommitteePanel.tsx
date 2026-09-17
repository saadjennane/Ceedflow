import {
  orderedBlocks,
  type Block,
  type BlockOutcome,
  type Candidate,
  type CommitteeAssignment,
  type CommitteeConfig,
  type CommitteeSession,
  type CommitteeSlot,
  type EvaluationCriterion,
  type TrackWithPhases,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { DateField, NumberField, SelectField, TagField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../../ui/Overlays';
import { CriteriaEditor, OutcomeBadge, OutcomeEditor, ScoreEditor } from './shared';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function CommitteeSetup({
  block,
  config,
  patch,
  track,
}: {
  block: Block;
  config: CommitteeConfig;
  patch: (partial: Partial<CommitteeConfig>) => void;
  track: TrackWithPhases;
}) {
  const ordered = orderedBlocks(track);
  const index = ordered.findIndex((b) => b.id === block.id);
  const upstream = ordered.slice(0, index === -1 ? undefined : index).filter((b) => b.type === 'evaluation');
  const source = config.sourceBlockId
    ? upstream.find((b) => b.id === config.sourceBlockId)
    : upstream[upstream.length - 1];
  const sourceOutcomes = (source?.config as { outcomes?: BlockOutcome[] } | undefined)?.outcomes ?? [];

  return (
    <>
      <div className="callout">
        <Icon name="gavel" size={15} />
        The committee runs the sittings: you create them, fill them with startups, let those startups book a time, and
        the jury scores them on the grid below. What comes out is a scored list with a status on each startup.
      </div>

      <h3 className="section-title">Who gets invited</h3>
      <SelectField
        label="Statuses come from"
        value={config.sourceBlockId ?? ''}
        onChange={(v) => patch({ sourceBlockId: v || null })}
        placeholder={
          upstream.length
            ? `Nearest evaluation before this block (${upstream[upstream.length - 1].name})`
            : 'No evaluation upstream yet'
        }
        options={upstream.map((b) => ({ value: b.id, label: b.name }))}
        help="Bulk assignment pulls startups by the status that evaluation gave them."
      />

      {sourceOutcomes.length > 0 && (
        <div className="field">
          <label>Statuses that qualify</label>
          <div className="row wrap">
            {sourceOutcomes.map((outcome) => {
              const on = config.intakeOutcomeIds.includes(outcome.id);
              return (
                <button
                  key={outcome.id}
                  type="button"
                  className={on ? 'track on' : 'track'}
                  onClick={() =>
                    patch({
                      intakeOutcomeIds: on
                        ? config.intakeOutcomeIds.filter((id) => id !== outcome.id)
                        : [...config.intakeOutcomeIds, outcome.id],
                    })
                  }
                >
                  {on && <Icon name="check" size={12} />} {outcome.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="public-sep" />

      <h3 className="section-title">How startups answer</h3>
      <SelectField
        label="Invitation"
        value={config.rsvpMode}
        onChange={(v) => patch({ rsvpMode: v as CommitteeConfig['rsvpMode'] })}
        options={[
          { value: 'slots', label: 'They pick a time from the sitting' },
          { value: 'confirm', label: 'They confirm or decline' },
          { value: 'none', label: 'No invitation — the team places them' },
        ]}
        help="Each assigned startup gets a personal link. With times, the slots come from the sitting's window and the minutes per startup."
      />
      {config.rsvpMode !== 'none' && (
        <DateField
          label="Answer by"
          value={config.rsvpDeadline}
          onChange={(v) => patch({ rsvpDeadline: v })}
          help="After this date the link stops accepting answers."
        />
      )}

      <div className="public-sep" />
      <CriteriaEditor criteria={config.criteria} onChange={(criteria) => patch({ criteria })} />

      <label className="check">
        <input
          type="checkbox"
          checked={config.requireComment}
          onChange={(e) => patch({ requireComment: e.target.checked })}
        />
        <span>Ask every juror for a written comment</span>
      </label>

      <div className="public-sep" />
      <OutcomeEditor outcomes={config.outcomes} onChange={(outcomes) => patch({ outcomes })} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Committees — the action                                             */
/* ------------------------------------------------------------------ */

interface AssignmentView {
  assignment: CommitteeAssignment;
  candidate: Candidate;
  slot: CommitteeSlot | null;
  score: number | null;
  submitted: number;
  outcomeId: string | null;
  overridden: boolean;
}

interface SessionView {
  session: CommitteeSession;
  slots: CommitteeSlot[];
  assignments: AssignmentView[];
  capacity: number;
}

interface CommitteeView {
  config: CommitteeConfig;
  criteria: EvaluationCriterion[];
  outcomes: BlockOutcome[];
  sessions: SessionView[];
  pool: { candidate: Candidate; outcomeId: string | null }[];
  source: { blockId: string; name: string; outcomes: BlockOutcome[] } | null;
}

const RSVP_TONE: Record<string, string> = {
  pending: 'badge warn',
  confirmed: 'badge ok',
  declined: 'badge stop',
};

export function CommitteeSittings({ block, dirty, onChanged }: { block: Block; dirty: boolean; onChanged: () => void }) {
  const view = useAsync(() => api.get<CommitteeView>(`/api/blocks/${block.id}/committee`), block.id);
  const [editing, setEditing] = useState<SessionView | 'new' | null>(null);
  const [picking, setPicking] = useState<SessionView | null>(null);
  const [scoring, setScoring] = useState<{ session: SessionView; row: AssignmentView } | null>(null);
  const [as, setAs] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { sessions, pool, outcomes, criteria, config, source } = view.data;
  const assigned = sessions.reduce((n, s) => n + s.assignments.length, 0);
  const confirmed = sessions.reduce(
    (n, s) => n + s.assignments.filter((a) => a.assignment.rsvpState === 'confirmed').length,
    0,
  );
  const scored = sessions.reduce((n, s) => n + s.assignments.filter((a) => a.score !== null).length, 0);
  const pendingStatus = sessions
    .flatMap((s) => s.assignments)
    .filter((a) => a.score !== null && !a.outcomeId).length;

  const applyAll = async () => {
    setBusy(true);
    try {
      const { written } = await api.post<{ written: number }>(`/api/blocks/${block.id}/outcomes/apply`);
      view.reload();
      onChanged();
      toast(written ? `${written} status${written === 1 ? '' : 'es'} written.` : 'Nothing to write.');
    } finally {
      setBusy(false);
    }
  };

  const setOutcome = async (candidateId: string, outcomeId: string) => {
    await api.post(`/api/blocks/${block.id}/outcomes`, { candidateId, outcomeId });
    view.reload();
    onChanged();
  };

  return (
    <>
      {dirty && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          You have unsaved changes in Setup. What happens here is saved immediately and separately.
        </div>
      )}

      <div className="row wrap">
        <span className="badge info num">{sessions.length} sittings</span>
        <span className="badge num">{assigned} assigned</span>
        <span className="badge num">{confirmed} confirmed</span>
        <span className="badge num">{scored} scored</span>
        {pool.length > 0 && <span className="badge warn num">{pool.length} still in the pool</span>}
        <div className="spacer" />
        {criteria.length > 0 && (
          <button className="btn primary sm" disabled={busy || !pendingStatus} onClick={applyAll}>
            <Icon name="check" size={13} /> Apply statuses{pendingStatus ? ` (${pendingStatus})` : ''}
          </button>
        )}
        <button className="btn sm" onClick={() => setEditing('new')}>
          <Icon name="plus" size={13} /> Add committee
        </button>
      </div>

      {!criteria.length && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          The jury has no grid. Add criteria in Setup, otherwise this committee produces no score and the Selection
          after it has nothing to cut on.
        </div>
      )}

      {!sessions.length ? (
        <div className="empty">
          <h3>No committee yet</h3>
          <p>Create a sitting, give it a window and a time per startup, and its slots appear on their own.</p>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Add committee
          </button>
        </div>
      ) : (
        sessions.map((sv) => {
          const over = sv.assignments.length > sv.capacity;
          const jurors = sv.session.jury;
          const me = as && jurors.includes(as) ? as : jurors[0] ?? '';
          return (
            <section className="card" key={sv.session.id}>
              <div className="rowcard-head" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--display)', fontSize: 14 }}>{sv.session.name}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {formatDate(sv.session.heldOn)} · {sv.session.startsAt}–{sv.session.endsAt} ·{' '}
                    <span className="num">{sv.session.minutesPerStartup}</span> min each
                    {sv.session.location && ` · ${sv.session.location}`}
                  </div>
                </div>
                <span className={over ? 'badge stop num' : 'badge num'} title="Assigned of available slots">
                  {sv.assignments.length}/{sv.capacity}
                </span>
                {jurors.length > 0 && (
                  <span className="badge" title={jurors.join(', ')}>
                    <Icon name="users" size={12} /> {jurors.length}
                  </span>
                )}
                <button className="btn ghost icon sm" onClick={() => setEditing(sv)} aria-label="Edit committee">
                  <Icon name="settings" size={14} />
                </button>
              </div>

              {over && (
                <div style={{ padding: '10px 14px 0' }}>
                  <div className="callout warn">
                    <Icon name="alert" size={15} />
                    More startups than slots. Widen the window, shorten the time per startup, or move someone to another
                    sitting.
                  </div>
                </div>
              )}

              <div style={{ padding: 12 }}>
                {!sv.assignments.length ? (
                  <div className="phase-empty">Nobody assigned yet.</div>
                ) : (
                  <div className="table-wrap" style={{ border: 0 }}>
                    <table className="data score-table">
                      <thead>
                        <tr>
                          <th style={{ width: 90 }}>Time</th>
                          <th>Startup</th>
                          <th>Invitation</th>
                          <th style={{ textAlign: 'right' }}>Score</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {sv.assignments.map((row) => (
                          <tr key={row.assignment.id}>
                            <td className="num muted">{row.slot ? row.slot.startsAt : '—'}</td>
                            <td className="name">{row.candidate.orgName}</td>
                            <td>
                              <span className={RSVP_TONE[row.assignment.rsvpState]}>{row.assignment.rsvpState}</span>
                            </td>
                            <td className="score" style={{ textAlign: 'right' }}>
                              {row.score ?? '—'}
                            </td>
                            <td>
                              {outcomes.length ? (
                                <select
                                  className="status-select"
                                  value={row.outcomeId ?? ''}
                                  onChange={(e) => setOutcome(row.candidate.id, e.target.value)}
                                >
                                  <option value="" disabled>
                                    —
                                  </option>
                                  {outcomes.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <OutcomeBadge outcomes={outcomes} id={row.outcomeId} />
                              )}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {config.rsvpMode !== 'none' && (
                                <button
                                  className="btn ghost icon sm"
                                  title="Copy the startup's invitation link"
                                  aria-label="Copy invitation link"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(
                                      `${window.location.origin}/book/${row.assignment.token}`,
                                    );
                                    toast('Invitation link copied.');
                                  }}
                                >
                                  <Icon name="link" size={13} />
                                </button>
                              )}
                              <button
                                className="btn ghost icon sm"
                                disabled={!criteria.length || !me}
                                title={me ? `Score as ${me}` : 'Add jury members to this committee first'}
                                aria-label="Score"
                                onClick={() => setScoring({ session: sv, row })}
                              >
                                <Icon name="star" size={13} />
                              </button>
                              <button
                                className="btn ghost icon sm"
                                aria-label="Remove from this committee"
                                onClick={async () => {
                                  await api.del(`/api/assignments/${row.assignment.id}`);
                                  view.reload();
                                }}
                              >
                                <Icon name="x" size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="row wrap" style={{ marginTop: 10 }}>
                  <button className="btn sm" onClick={() => setPicking(sv)} disabled={!pool.length}>
                    <Icon name="plus" size={13} /> Add from the pool
                  </button>
                  {source && config.intakeOutcomeIds.length > 0 && (
                    <button
                      className="btn sm"
                      disabled={busy || !pool.some((p) => p.outcomeId && config.intakeOutcomeIds.includes(p.outcomeId))}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const { added } = await api.post<{ added: number }>(
                            `/api/sessions/${sv.session.id}/assign`,
                            { fromOutcomeIds: config.intakeOutcomeIds },
                          );
                          view.reload();
                          toast(added ? `${added} startup${added === 1 ? '' : 's'} assigned.` : 'Nobody matched.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Icon name="users" size={13} /> Add everyone qualified by {source.name}
                    </button>
                  )}
                  {jurors.length > 1 && (
                    <label className="row" style={{ gap: 7, fontSize: 12.5, marginLeft: 'auto' }}>
                      <span className="faint">Scoring as</span>
                      <select className="status-select" value={me} onChange={(e) => setAs(e.target.value)}>
                        {jurors.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            </section>
          );
        })
      )}

      {pool.length > 0 && (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          Still unassigned: {pool.map((p) => p.candidate.orgName).join(', ')}.
        </p>
      )}

      {editing && (
        <SessionModal
          blockId={block.id}
          session={editing === 'new' ? null : editing.session}
          onClose={() => setEditing(null)}
          onSaved={() => {
            view.reload();
            onChanged();
          }}
        />
      )}

      {picking && (
        <PoolModal
          pool={pool}
          outcomes={source?.outcomes ?? []}
          sessionName={picking.session.name}
          onClose={() => setPicking(null)}
          onPick={async (candidateIds) => {
            await api.post(`/api/sessions/${picking.session.id}/assign`, { candidateIds });
            view.reload();
            toast(`${candidateIds.length} assigned to ${picking.session.name}.`);
          }}
        />
      )}

      {scoring && (
        <Modal
          title={`Score ${scoring.row.candidate.orgName}`}
          subtitle={`${scoring.session.session.name} · ${formatDate(scoring.session.session.heldOn)}`}
          onClose={() => setScoring(null)}
        >
          <ScoreEditor
            blockId={block.id}
            sessionId={scoring.session.session.id}
            candidate={scoring.row.candidate}
            criteria={criteria}
            evaluator={as && scoring.session.session.jury.includes(as) ? as : scoring.session.session.jury[0] ?? ''}
            requireComment={config.requireComment}
            onSaved={() => {
              setScoring(null);
              view.reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function SessionModal({
  blockId,
  session,
  onClose,
  onSaved,
}: {
  blockId: string;
  session: CommitteeSession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: session?.name ?? '',
    heldOn: session?.heldOn ?? null,
    startsAt: session?.startsAt ?? '09:00',
    endsAt: session?.endsAt ?? '13:00',
    minutesPerStartup: session?.minutesPerStartup ?? 25,
    location: session?.location ?? '',
    jury: session?.jury ?? [],
  });
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  const [h1, m1] = draft.startsAt.split(':').map(Number);
  const [h2, m2] = draft.endsAt.split(':').map(Number);
  const span = (h2 || 0) * 60 + (m2 || 0) - ((h1 || 0) * 60 + (m1 || 0));
  const slots = span > 0 ? Math.floor(span / Math.max(5, draft.minutesPerStartup)) : 0;

  return (
    <>
      <Modal
        title={session ? 'Committee' : 'New committee'}
        subtitle="A sitting of the jury. Its slots come from the window and the time per startup."
        onClose={onClose}
        footer={
          <>
            {session && (
              <button className="btn danger sm" onClick={() => setConfirm(true)}>
                <Icon name="trash" size={13} /> Delete
              </button>
            )}
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (session) await api.patch(`/api/sessions/${session.id}`, draft);
                else await api.post(`/api/blocks/${blockId}/sessions`, draft);
                onSaved();
                onClose();
                toast(session ? 'Committee updated.' : 'Committee added.');
              }}
            >
              {session ? 'Save' : 'Add committee'}
            </button>
          </>
        }
      >
        <TextField
          label="Name"
          value={draft.name}
          onChange={(v) => set({ name: v })}
          placeholder="Morning panel"
          hint="optional"
        />
        <div className="grid-2">
          <DateField label="Held on" value={draft.heldOn} onChange={(v) => set({ heldOn: v })} />
          <TextField label="Where" value={draft.location} onChange={(v) => set({ location: v })} placeholder="CEED Morocco, Casablanca" />
        </div>
        <div className="grid-2">
          <TextField label="From" value={draft.startsAt} onChange={(v) => set({ startsAt: v })} type="time" />
          <TextField label="To" value={draft.endsAt} onChange={(v) => set({ endsAt: v })} type="time" />
        </div>
        <NumberField
          label="Minutes per startup"
          value={draft.minutesPerStartup}
          onChange={(v) => set({ minutesPerStartup: v })}
          min={5}
          help={slots ? `That makes ${slots} slot${slots === 1 ? '' : 's'}.` : 'The window is too short for a single slot.'}
        />
        <TagField
          label="Jury"
          values={draft.jury}
          onChange={(v) => set({ jury: v })}
          help="Who sits on this panel. They are the names that can score here."
          placeholder="Add a jury member"
        />
      </Modal>

      {confirm && session && (
        <ConfirmDialog
          title={`Delete ${session.name}?`}
          body="Its assignments go with it. Scores already given stay on the block."
          confirmLabel="Delete committee"
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/sessions/${session.id}`);
            onSaved();
            onClose();
            toast('Committee deleted.');
          }}
        />
      )}
    </>
  );
}

function PoolModal({
  pool,
  outcomes,
  sessionName,
  onClose,
  onPick,
}: {
  pool: { candidate: Candidate; outcomeId: string | null }[];
  outcomes: BlockOutcome[];
  sessionName: string;
  onClose: () => void;
  onPick: (candidateIds: string[]) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <Modal
      title={`Add to ${sessionName}`}
      subtitle="Startups that reached this block and are not on any sitting yet."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!chosen.length}
            onClick={async () => {
              await onPick(chosen);
              onClose();
            }}
          >
            Add {chosen.length || ''}
          </button>
        </>
      }
    >
      <div className="rows">
        {pool.map(({ candidate, outcomeId }) => (
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
                {candidate.contactName}
              </div>
            </span>
            <OutcomeBadge outcomes={outcomes} id={outcomeId} />
          </label>
        ))}
      </div>
    </Modal>
  );
}

