import {
  type Block,
  type BlockOutcome,
  type Candidate,
  type CommitteeAssignment,
  type CommitteeConfig,
  type CommitteeSession,
  type CommitteeSlot,
} from '@ceed/shared';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import { SessionModal } from '../builder/panels/CommitteePanel';

interface AssignmentView {
  assignment: CommitteeAssignment;
  candidate: Candidate;
  slot: CommitteeSlot | null;
  score: number | null;
  submitted: number;
  outcomeId: string | null;
}

interface SessionView {
  session: CommitteeSession;
  slots: CommitteeSlot[];
  assignments: AssignmentView[];
  capacity: number;
}

interface CommitteeView {
  config: CommitteeConfig;
  sessions: SessionView[];
  pool: { candidate: Candidate }[];
  intakeFrom: string | null;
  evaluation: { blockId: string; name: string; criteria: number; outcomes: BlockOutcome[] } | null;
}

const RSVP_TONE: Record<string, string> = {
  pending: 'badge warn',
  confirmed: 'badge ok',
  declined: 'badge stop',
};

/** What is being dragged: a seated startup, or someone still in the pool. */
type Dragged = { kind: 'seat'; row: AssignmentView } | { kind: 'pool'; candidate: Candidate };

export function CommitteeWorkspace({ block, onOpenBlock }: { block: Block; onOpenBlock: (id: string) => void }) {
  const view = useAsync(() => api.get<CommitteeView>(`/api/blocks/${block.id}/committee`), block.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CommitteeSession | 'new' | null>(null);
  const [placing, setPlacing] = useState<{ session: SessionView; slot: CommitteeSlot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<Dragged | null>(null);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { sessions, pool, evaluation, intakeFrom, config } = view.data;
  const current = sessions.find((s) => s.session.id === openId) ?? sessions[0] ?? null;

  /** Drops a startup on a slot: seat it first if it came from the pool. */
  const dropOn = async (session: SessionView, slotIndex: number | null) => {
    const payload = drag.current;
    drag.current = null;
    setOver(null);
    if (!payload) return;
    setBusy(true);
    try {
      if (payload.kind === 'pool') {
        await api.post(`/api/sessions/${session.session.id}/assign`, { candidateIds: [payload.candidate.id] });
        const fresh = await api.get<CommitteeView>(`/api/blocks/${block.id}/committee`);
        const seat = fresh.sessions
          .find((s) => s.session.id === session.session.id)
          ?.assignments.find((a) => a.candidate.id === payload.candidate.id);
        view.set(
          seat
            ? await api.post<CommitteeView>(`/api/assignments/${seat.assignment.id}/slot`, { slotIndex })
            : fresh,
        );
      } else {
        view.set(await api.post<CommitteeView>(`/api/assignments/${payload.row.assignment.id}/slot`, { slotIndex }));
      }
    } finally {
      setBusy(false);
    }
  };

  const unseat = async (row: AssignmentView) => {
    setBusy(true);
    try {
      await api.del(`/api/assignments/${row.assignment.id}`);
      view.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* ---- which sitting ---- */}
      <div className="work-head">
        <div className="work-pick">
          {sessions.map((sv) => (
            <button
              key={sv.session.id}
              className={sv.session.id === current?.session.id ? 'track on' : 'track'}
              onClick={() => setOpenId(sv.session.id)}
            >
              {sv.session.name}
              <span className="faint" style={{ fontWeight: 400 }}>
                {' '}
                · {formatDate(sv.session.heldOn)} · {sv.assignments.length}/{sv.capacity}
              </span>
            </button>
          ))}
          <button className="track add" onClick={() => setEditing('new')}>
            <Icon name="plus" size={13} /> Add committee
          </button>
        </div>
      </div>

      {!current ? (
        <div className="empty">
          <h3>No committee yet</h3>
          <p>Create a sitting, give it its hours and a time per startup, and its slots appear on their own.</p>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Add committee
          </button>
        </div>
      ) : (
        <>
          {/* ---- the jury, above ---- */}
          <section className="card jury-strip">
            <div className="eyebrow">Jury</div>
            <div className="row wrap" style={{ flex: 1 }}>
              {current.session.jury.length ? (
                current.session.jury.map((name) => (
                  <span className="juror" key={name}>
                    <span className="juror-mark">
                      {name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')}
                    </span>
                    {name}
                  </span>
                ))
              ) : (
                <span className="badge warn">No jury on this sitting — nobody can score it</span>
              )}
            </div>
            <button className="btn sm" onClick={() => setEditing(current.session)}>
              <Icon name="edit" size={13} /> Edit committee
            </button>
          </section>

          <div className="row wrap" style={{ fontSize: 12.5 }}>
            <span className="faint">
              {formatDate(current.session.heldOn)} ·{' '}
              {current.session.windows.map((w) => `${w.startsAt}–${w.endsAt}`).join(' + ')} ·{' '}
              <span className="num">{current.session.minutesPerStartup}</span> min each
              {current.session.location && ` · ${current.session.location}`}
            </span>
            <span className={current.assignments.length > current.capacity ? 'badge stop num' : 'badge num'}>
              {current.assignments.length}/{current.capacity}
            </span>
            {evaluation ? (
              <button className="linklike" onClick={() => onOpenBlock(evaluation.blockId)}>
                Scored by {evaluation.name}
              </button>
            ) : (
              <span className="badge warn">Nothing scores this committee</span>
            )}
          </div>

          {/* ---- the day, in columns, with the pool alongside ---- */}
          <div className="day">
            {current.session.windows.map((stretch, windowIndex) => {
              const slots = current.slots.filter((s) => s.windowIndex === windowIndex);
              return (
                <section className="day-col" key={windowIndex}>
                  <header>
                    <span className="eyebrow">
                      {current.session.windows.length === 1
                        ? 'Timetable'
                        : current.session.windows.length === 2
                          ? ['Morning', 'Afternoon'][windowIndex]
                          : `Stretch ${windowIndex + 1}`}
                    </span>
                    <span className="num faint">
                      {stretch.startsAt}–{stretch.endsAt}
                    </span>
                  </header>
                  <div className="day-slots">
                    {slots.map((slot) => {
                      const row = current.assignments.find((a) => a.assignment.slotIndex === slot.index);
                      const key = `${current.session.id}:${slot.index}`;
                      return (
                        <div
                          key={slot.index}
                          className={`slot-row${over === key ? ' over' : ''}${row ? '' : ' free'}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setOver(key);
                          }}
                          onDragLeave={() => setOver((o) => (o === key ? null : o))}
                          onDrop={(e) => {
                            e.preventDefault();
                            dropOn(current, slot.index);
                          }}
                        >
                          <span className="slot-time num">{slot.startsAt}</span>
                          {row ? (
                            <Seat
                              row={row}
                              outcomes={evaluation?.outcomes ?? []}
                              rsvp={config.rsvpMode !== 'none'}
                              busy={busy}
                              scoredBy={evaluation?.name ?? null}
                              onDragStart={() => {
                                drag.current = { kind: 'seat', row };
                              }}
                              onCopyLink={() => {
                                navigator.clipboard?.writeText(
                                  `${window.location.origin}/book/${row.assignment.token}`,
                                );
                                toast('Invitation link copied.');
                              }}
                              onRemove={() => unseat(row)}
                            />
                          ) : (
                            <button
                              className="slot-free"
                              disabled={busy || !pool.length}
                              onClick={() => setPlacing({ session: current, slot })}
                              title={pool.length ? 'Put a startup here' : 'Nobody left in the pool'}
                            >
                              free
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {/* ---- the pool rail ---- */}
            <aside
              className={`pool-rail${over === 'pool' ? ' over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver('pool');
              }}
              onDragLeave={() => setOver((o) => (o === 'pool' ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const payload = drag.current;
                setOver(null);
                drag.current = null;
                if (payload?.kind === 'seat') unseat(payload.row);
              }}
            >
              <div className="eyebrow">Pool</div>
              {intakeFrom && (
                <p className="faint" style={{ margin: '0 0 4px', fontSize: 11.5 }}>
                  From {intakeFrom}
                </p>
              )}
              {pool.length ? (
                pool.map(({ candidate }) => (
                  <div
                    className="pool-chip"
                    key={candidate.id}
                    draggable={!busy}
                    onDragStart={() => {
                      drag.current = { kind: 'pool', candidate };
                    }}
                  >
                    <span className="grip">
                      <Icon name="drag" size={12} />
                    </span>
                    {candidate.orgName}
                  </div>
                ))
              ) : (
                <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                  Everyone is on a sitting.
                </p>
              )}

              <div className="public-sep" style={{ margin: '10px 0 6px' }} />
              <div className="eyebrow">No time yet</div>
              {current.assignments.filter((a) => a.assignment.slotIndex === null).length ? (
                current.assignments
                  .filter((a) => a.assignment.slotIndex === null)
                  .map((row) => (
                    <div
                      className="pool-chip seated-chip"
                      key={row.assignment.id}
                      draggable={!busy}
                      onDragStart={() => {
                        drag.current = { kind: 'seat', row };
                      }}
                    >
                      <span className="grip">
                        <Icon name="drag" size={12} />
                      </span>
                      {row.candidate.orgName}
                      {config.rsvpMode !== 'none' && (
                        <span className={RSVP_TONE[row.assignment.rsvpState]}>{row.assignment.rsvpState}</span>
                      )}
                    </div>
                  ))
              ) : (
                <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                  {config.rsvpMode === 'slots'
                    ? 'Seat a startup and it waits here until it picks a time.'
                    : 'Everyone seated has a time.'}
                </p>
              )}
            </aside>
          </div>

          <div className="callout">
            <Icon name="alert" size={15} />
            <div>
              <strong>What a seat shows.</strong> The first chip is the answer to the invitation — whether the startup
              accepted that time. The number and the coloured label are its score out of 100 and the status{' '}
              {evaluation ? <strong>{evaluation.name}</strong> : 'an evaluation'} gave it after the pitch — not its
              screening result.
            </div>
          </div>

          <p className="faint" style={{ margin: 0, fontSize: 12 }}>
            Drag a startup from the pool onto a time, from one time to another to swap them over, or back to the pool
            to take it off. A free slot can also be filled with a click.
          </p>
        </>
      )}

      {editing && (
        <SessionModal
          blockId={block.id}
          session={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => view.reload()}
        />
      )}

      {placing && (
        <Modal
          title={`Who pitches at ${placing.slot.startsAt}?`}
          subtitle={`${placing.session.session.name} · ${formatDate(placing.session.session.heldOn)}`}
          onClose={() => setPlacing(null)}
        >
          <div className="rows">
            {pool.map(({ candidate }) => (
              <button
                className="pick"
                key={candidate.id}
                onClick={async () => {
                  drag.current = { kind: 'pool', candidate };
                  await dropOn(placing.session, placing.slot.index);
                  setPlacing(null);
                }}
              >
                <Icon name="plus" size={14} />
                <div>
                  <strong>{candidate.orgName}</strong>
                  <span>{candidate.contactName}</span>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function Seat({
  row,
  outcomes,
  rsvp,
  busy,
  scoredBy,
  onDragStart,
  onCopyLink,
  onRemove,
}: {
  row: AssignmentView;
  outcomes: BlockOutcome[];
  rsvp: boolean;
  busy: boolean;
  /** Named on every chip, because a seat carries three unrelated facts. */
  scoredBy: string | null;
  onDragStart: () => void;
  onCopyLink: () => void;
  onRemove: () => void;
}) {
  const status = outcomes.find((o) => o.id === row.outcomeId);
  return (
    <div className="seated" draggable={!busy} onDragStart={onDragStart}>
      <span className="grip">
        <Icon name="drag" size={13} />
      </span>
      <div className="seated-main">
        <div className="seated-name">{row.candidate.orgName}</div>
        <div className="seated-meta">
          {rsvp && (
            <span
              className={RSVP_TONE[row.assignment.rsvpState]}
              title={
                row.assignment.rsvpState === 'confirmed'
                  ? 'Accepted this time'
                  : row.assignment.rsvpState === 'declined'
                    ? 'Cannot make it'
                    : 'Has not answered the invitation yet'
              }
            >
              {row.assignment.rsvpState}
            </span>
          )}
          {row.score !== null && (
            <span className="num faint" title={scoredBy ? `Score out of 100 from ${scoredBy}` : 'Score out of 100'}>
              {row.score}
            </span>
          )}
          {status && (
            <span
              className={status.tone === 'neutral' ? 'badge' : `badge ${status.tone}`}
              title={scoredBy ? `Status put on it by ${scoredBy}` : 'Status'}
            >
              {status.label}
            </span>
          )}
        </div>
      </div>
      <div className="seat-actions">
        {rsvp && (
          <button
            className="btn ghost icon sm"
            onClick={onCopyLink}
            title="Copy the invitation link"
            aria-label="Copy link"
          >
            <Icon name="link" size={13} />
          </button>
        )}
        <button className="btn ghost icon sm" onClick={onRemove} title="Take off this committee" aria-label="Remove">
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
