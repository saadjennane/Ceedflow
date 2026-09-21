import {
  type Block,
  type BlockOutcome,
  type Candidate,
  type CommitteeAssignment,
  type CommitteeConfig,
  type CommitteeSession,
  type CommitteeSlot,
  type PersonRef,
} from '@ceed/shared';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';

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
  /** The jury as people: the session itself only holds their ids. */
  jury: PersonRef[];
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

export function CommitteeWorkspace({
  block,
  onOpenSetup,
  onOpenScoring,
}: {
  block: Block;
  /** Opens this block's own drawer, over the tab you are on. */
  onOpenSetup: (id: string) => void;
  /** Sends you to Review, where the evaluation's scores live. */
  onOpenScoring: (id: string) => void;
}) {
  const view = useAsync(() => api.get<CommitteeView>(`/api/blocks/${block.id}/committee`), block.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ session: SessionView; slot: CommitteeSlot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<Dragged | null>(null);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { sessions, pool, evaluation, intakeFrom, config } = view.data;
  const current = sessions.find((s) => s.session.id === openId) ?? sessions[0] ?? null;
  /* On this sitting, still without a time — your work of the day, and the order
     Fill slots follows. The server hands them back in the order they were put
     on; sorting here says so out loud rather than relying on it. */
  const waiting = (current?.assignments ?? [])
    .filter((a) => a.assignment.slotIndex === null)
    .sort((a, b) => a.assignment.position - b.assignment.position);
  /* A startup may sit on several sittings now, so the ones held by another are
     no longer out of reach from here — they were simply invisible, and the only
     way to add one was to go back to Setup. They stay a group of their own:
     putting one on a second sitting is a decision, not a slip. */
  const onThis = new Set((current?.assignments ?? []).map((a) => a.candidate.id));
  const held = sessions
    .filter((sv) => sv.session.id !== current?.session.id)
    .flatMap((sv) => sv.assignments.map((row) => ({ candidate: row.candidate, on: sv.session.name || 'another sitting' })))
    .filter((x) => !onThis.has(x.candidate.id))
    .filter((x, i, all) => all.findIndex((y) => y.candidate.id === x.candidate.id) === i);

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

  /**
   * Off the sitting altogether: back to the pool, on no sitting at all.
   * This is the stronger of the two removals, and it lives on the rail chip —
   * the place where the startup is no longer tied to an hour.
   */
  const unseat = async (row: AssignmentView) => {
    setBusy(true);
    try {
      await api.del(`/api/assignments/${row.assignment.id}`);
      view.reload();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Off the hour, not off the sitting: it goes back to No time yet, still on
   * this panel. Clearing a time used to throw the startup out of the sitting
   * entirely, which made a simple change of mind about the timetable cost you
   * the seat.
   */
  const clearTime = async (row: AssignmentView) => {
    setBusy(true);
    try {
      view.set(await api.post<CommitteeView>(`/api/assignments/${row.assignment.id}/slot`, { slotIndex: null }));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Fills the free slots, in the order of the rail beside them: those already
   * on the sitting and still without a time first, then the pool. It only ever
   * fills what is empty — nothing already placed is moved or overwritten, so
   * there is nothing to confirm and nothing to lose.
   */
  const fillSlots = async () => {
    if (!current) return;
    const free = current.slots
      .filter((slot) => !current.assignments.some((a) => a.assignment.slotIndex === slot.index))
      .map((slot) => slot.index);
    const queue: Dragged[] = [
      ...current.assignments
        .filter((a) => a.assignment.slotIndex === null)
        .map((row) => ({ kind: 'seat', row }) as Dragged),
      // Those held by another sitting are deliberately left out: enrolling one
      // here is a decision, not something a button should do on your behalf.
      ...pool.map(({ candidate }) => ({ kind: 'pool', candidate }) as Dragged),
    ];
    if (!free.length || !queue.length) {
      toast(free.length ? 'Nobody left to place.' : 'Every time is taken.', true);
      return;
    }

    setBusy(true);
    try {
      let placed = 0;
      for (const slotIndex of free) {
        const next = queue.shift();
        if (!next) break;
        if (next.kind === 'seat') {
          await api.post(`/api/assignments/${next.row.assignment.id}/slot`, { slotIndex });
        } else {
          const { view: fresh } = await api.post<{ added: number; view: CommitteeView }>(
            `/api/sessions/${current.session.id}/assign`,
            { candidateIds: [next.candidate.id] },
          );
          const seat = fresh.sessions
            .find((sv) => sv.session.id === current.session.id)
            ?.assignments.find((a) => a.candidate.id === next.candidate.id);
          if (seat) await api.post(`/api/assignments/${seat.assignment.id}/slot`, { slotIndex });
        }
        placed += 1;
      }
      view.reload();
      toast(
        queue.length
          ? `${placed} placed · ${queue.length} still without a time. Add a stretch or shorten the slots.`
          : `${placed} placed.`,
      );
    } catch (err) {
      toast((err as Error).message, true);
      view.reload();
    } finally {
      setBusy(false);
    }
  };

  /** Puts startups on a panel with no timetable behind it. */
  const putOnPanel = async (session: SessionView, candidateIds: string[]) => {
    setBusy(true);
    try {
      const { view: fresh } = await api.post<{ added: number; view: CommitteeView }>(
        `/api/sessions/${session.session.id}/assign`,
        { candidateIds },
      );
      view.set(fresh);
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
                {/* A date and a capacity mean nothing without a timetable. */}
                {config.format === 'event'
                  ? `· ${formatDate(sv.session.heldOn)} · ${sv.assignments.length}/${sv.capacity}`
                  : config.assign
                    ? `· ${sv.assignments.length}`
                    : ''}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!current ? (
        <div className="empty">
          <h3>No {config.format === 'event' ? 'sitting' : 'panel'} yet</h3>
          <p>
            This is where you hand out the startups. Who reviews, and when, is set on the block — the{' '}
            <strong>Panels</strong> tab of its setup.
          </p>
          <button className="btn primary" onClick={() => onOpenSetup(block.id)}>
            <Icon name="settings" /> Open the setup
          </button>
        </div>
      ) : (
        <>
          {/* ---- the jury, above ---- */}
          <section className="card jury-strip">
            <div className="eyebrow">Jury</div>
            <div className="row wrap" style={{ flex: 1 }}>
              {current.jury.length ? (
                current.jury.map((person) => (
                  <span className="juror" key={person.id}>
                    <span className="juror-mark">
                      {person.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')}
                    </span>
                    {person.name}
                  </span>
                ))
              ) : (
                <span className="badge warn">No jury on this sitting — nobody can score it</span>
              )}
            </div>
          </section>

          <div className="row wrap" style={{ fontSize: 12.5 }}>
            {config.format === 'event' ? (
              <>
                <span className="faint">
                  {formatDate(current.session.heldOn)} ·{' '}
                  {current.session.windows.map((w) => `${w.startsAt}–${w.endsAt}`).join(' + ')} ·{' '}
                  <span className="num">{current.session.minutesPerStartup}</span> min each
                  {current.session.location && ` · ${current.session.location}`}
                </span>
                <span className={current.assignments.length > current.capacity ? 'badge stop num' : 'badge num'}>
                  {current.assignments.length}/{current.capacity}
                </span>
                <button
                  className="btn sm"
                  disabled={busy || (!waiting.length && !pool.length)}
                  onClick={fillSlots}
                  title="Fills the free times, in the order of the list beside them"
                >
                  <Icon name="check" size={13} /> Fill slots
                </button>
              </>
            ) : (
              <span className="faint">
                Spread over days — no timetable.{' '}
                {config.assign ? 'Each panel takes the startups you give it.' : 'This panel reviews everything.'}
              </span>
            )}
            {evaluation ? (
              <button className="linklike" onClick={() => onOpenScoring(evaluation.blockId)}>
                Scored by {evaluation.name}
              </button>
            ) : (
              <span className="badge warn">Nothing scores this committee</span>
            )}
            {config.format === 'event' && (
              <span
                className="faint"
                title={`On a seat: the chip is the answer to the invitation, the number and the coloured label are the score out of 100 and the status ${evaluation?.name ?? 'an evaluation'} gave after the pitch — not the screening result.`}
              >
                <Icon name="alert" size={12} /> What a seat shows
              </span>
            )}
          </div>

          {/* Asynchronous work has no day to lay out: what matters is who is on
              this panel's list. */}
          {config.format === 'async' ? (
            <AsyncList
              view={view.data}
              current={current}
              busy={busy}
              onRemove={unseat}
              onSeat={(ids) => putOnPanel(current, ids)}
            />
          ) : (
          <>
          <div className="day-split">
            <div className="day-stage">
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
                              onRemove={() => clearTime(row)}
                            />
                          ) : (
                            <button
                              className="slot-free"
                              disabled={busy || (!pool.length && !waiting.length && !held.length)}
                              onClick={() => setPlacing({ session: current, slot })}
                              title={
                                pool.length || waiting.length || held.length
                                  ? 'Put a startup here'
                                  : 'Nobody left to place'
                              }
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

            </div>
            </div>

            {/* ---- the rail, beside them and scrolling on its own ---- */}
            <aside
              className={`pool-rail day-rail${over === 'pool' ? ' over' : ''}`}
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
                // Landing in the rail means "no time", not "off the sitting" —
                // the same thing the seat's cross says.
                if (payload?.kind === 'seat') clearTime(payload.row);
              }}
            >
              {/* Your work of the day comes first: these are already on this
                  sitting and only want a time. The pool underneath is a
                  convenience — startups on no sitting at all, which is why
                  people read them as strangers turning up. */}
              <div className="rail-head">
                <span className="eyebrow">No time yet</span>
                <span className="num faint">{waiting.length}</span>
              </div>
              {waiting.length ? (
                waiting.map((row) => (
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
                    <span className="chip-name">{row.candidate.orgName}</span>
                    {config.rsvpMode !== 'none' && (
                      <span className={RSVP_TONE[row.assignment.rsvpState]}>{row.assignment.rsvpState}</span>
                    )}
                    <button
                      className="chip-x"
                      disabled={busy}
                      aria-label={`Take ${row.candidate.orgName} off this sitting`}
                      title="Off this sitting"
                      onClick={() => unseat(row)}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                  {config.rsvpMode === 'slots'
                    ? 'Seat a startup and it waits here until it picks a time.'
                    : 'Everyone on this sitting has a time.'}
                </p>
              )}

              <div className="public-sep" style={{ margin: '12px 0 6px' }} />
              <div className="rail-head">
                <span className="eyebrow">On no sitting</span>
                <span className="num faint">{pool.length}</span>
              </div>
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
                    <span className="chip-name">{candidate.orgName}</span>
                  </div>
                ))
              ) : (
                <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                  Everyone is on a sitting.
                </p>
              )}

              {held.length > 0 && (
                <>
                  <div className="public-sep" style={{ margin: '12px 0 6px' }} />
                  <div className="rail-head">
                    <span className="eyebrow">On another sitting</span>
                    <span className="num faint">{held.length}</span>
                  </div>
                  <p className="faint" style={{ margin: '0 0 4px', fontSize: 11.5 }}>
                    Drag one over to have it seen twice. Fill slots leaves them where they are.
                  </p>
                  {held.map(({ candidate, on }) => (
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
                      <span className="chip-name">{candidate.orgName}</span>
                      <span className="badge">{on}</span>
                    </div>
                  ))}
                </>
              )}
            </aside>
          </div>
          </>
          )}
        </>
      )}

      {placing && (
        <Modal
          title={`Who pitches at ${placing.slot.startsAt}?`}
          subtitle={`${placing.session.session.name} · ${formatDate(placing.session.session.heldOn)}`}
          onClose={() => setPlacing(null)}
        >
          {/* The same two lists as the rail, in the same order — this is the
              way that works when the window is too narrow to hold both zones
              side by side, and the only one that works from the keyboard. */}
          <div className="rows">
            {waiting.map((row) => (
              <button
                className="pick"
                key={row.assignment.id}
                onClick={async () => {
                  drag.current = { kind: 'seat', row };
                  await dropOn(placing.session, placing.slot.index);
                  setPlacing(null);
                }}
              >
                <Icon name="plus" size={14} />
                <div>
                  <strong>{row.candidate.orgName}</strong>
                  <span>On this sitting · no time yet</span>
                </div>
              </button>
            ))}
            {waiting.length > 0 && pool.length > 0 && (
              <div className="eyebrow" style={{ marginTop: 4 }}>
                On no sitting
              </div>
            )}
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
            {held.length > 0 && (
              <div className="eyebrow" style={{ marginTop: 4 }}>
                On another sitting
              </div>
            )}
            {held.map(({ candidate, on }) => (
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
                  <span>Already on {on} — it would be seen twice</span>
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
        {/* Frees the hour. It stays on the sitting, in No time yet — leaving
            the sitting is the cross on its chip over there. */}
        <button
          className="btn ghost icon sm"
          disabled={busy}
          onClick={onRemove}
          title="Free this time — it goes back to No time yet"
          aria-label="Free this time"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */

/**
 * Asynchronous reviewing: no day to lay out, so the panel is a list. Without
 * assignment there is nothing to hand out either — everyone reviews everything,
 * and the list simply says so.
 */
function AsyncList({
  view,
  current,
  busy,
  onRemove,
  onSeat,
}: {
  view: CommitteeView;
  current: SessionView;
  busy: boolean;
  onRemove: (row: AssignmentView) => void;
  onSeat: (candidateIds: string[]) => void;
}) {
  if (!view.config.assign) {
    return (
      <>
        <div className="callout">
          <Icon name="users" size={15} />
          <div>
            Every startup that reaches this block is on this panel&apos;s list — <strong>{view.pool.length}</strong> of
            them. Split them between panels from Setup if you would rather share the reading out.
          </div>
        </div>
        <div className="rows">
          {view.pool.map(({ candidate }) => (
            <div className="rowcard link-row" key={candidate.id}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{candidate.orgName}</span>
              <span className="faint" style={{ fontSize: 12 }}>
                {candidate.contactName}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="day">
      <section className="day-col">
        <header>
          <span className="eyebrow">On this panel</span>
          <span className="badge num">{current.assignments.length}</span>
        </header>
        <div className="day-slots">
          {!current.assignments.length ? (
            <div className="empty" style={{ padding: 18 }}>
              Nobody yet. Take startups from the pool alongside.
            </div>
          ) : (
            current.assignments.map((row) => (
              <div className="slot-row" key={row.assignment.id}>
                <div className="seated">
                  <div className="seated-main">
                    <div className="seated-name">{row.candidate.orgName}</div>
                    <div className="seated-meta">
                      {row.score !== null && <span className="num faint">{row.score}</span>}
                    </div>
                  </div>
                  <div className="seat-actions">
                    <button
                      className="btn ghost icon sm"
                      disabled={busy}
                      aria-label="Take off this panel"
                      onClick={() => onRemove(row)}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <aside className="pool-rail">
        <div className="eyebrow">Not on a panel</div>
        {!view.pool.length ? (
          <div className="faint" style={{ fontSize: 11.5 }}>
            Everyone is on a panel.
          </div>
        ) : (
          view.pool.map(({ candidate }) => (
            <button
              className="pool-chip"
              key={candidate.id}
              disabled={busy}
              onClick={() => onSeat([candidate.id])}
              title="Put on this panel"
            >
              {candidate.orgName}
            </button>
          ))
        )}
      </aside>
    </div>
  );
}
