/**
 * Les One to One d'une brique, comme les séances d'un comité.
 *
 * A day at a time: its interlocutors side by side, each with their column of
 * slots, and the startups on the right — dragged onto a slot, or invited to
 * book one themselves. Clicking a startup opens its meeting and the report.
 * The Reporting view sums the reports up, question by question or startup
 * by startup.
 */
import {
  FREQUENCIES,
  FREQUENCY_LABEL,
  MAX_SESSIONS,
  MEETING_STATUS_LABEL,
  daySlots,
  formPages,
  mentorsOf,
  meetingState,
  summarise,
  type Block,
  type Candidate,
  type FormField,
  type OneToOneConfig,
  type OneToOneDay,
  type OneToOneMeeting,
  type PersonRef,
  type QuestionSummary,
} from '@ceed/shared';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../../lib/api';
import { formatDate, todayIso } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { download, toWorkbook, type Cell } from '../../lib/xlsx';
import { FormPageBody } from '../../ui/FormPages';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Drawer, Modal, useToast } from '../../ui/Overlays';
import { INVITE_WORDS } from '../builder/panels/OneToOnePanel';
import '../../ui/directory.css';

interface View {
  block: Block;
  config: OneToOneConfig;
  meetings: OneToOneMeeting[];
  pool: { candidate: Candidate }[];
  interlocutors: PersonRef[];
  days: OneToOneDay[];
  reach: { upstream: number; track: number; from: string | null };
}

/** A badge per state: what the reader needs to know first. */
const STATE_BADGE: Record<ReturnType<typeof meetingState>, { label: string; tone: string }> = {
  scheduled: { label: 'Scheduled', tone: 'badge info' },
  awaiting: { label: 'Awaiting answer', tone: 'badge warn' },
  unscheduled: { label: 'No time yet', tone: 'badge' },
  declined: { label: 'Declined', tone: 'badge stop' },
  to_report: { label: 'Report due', tone: 'badge warn' },
  reported: { label: 'Report sent', tone: 'badge ok' },
  no_show: { label: 'No-show', tone: 'badge stop' },
  cancelled: { label: 'Cancelled', tone: 'badge' },
};

const when = (m: Pick<OneToOneMeeting, 'heldOn' | 'startTime'>) =>
  m.heldOn ? `${formatDate(m.heldOn)}${m.startTime ? ` · ${m.startTime}` : ''}` : 'No time yet';

/**
 * Ceux qu'une startup doit encore voir : ses mentors sans rendez-vous avec
 * elle — ou, sans mentor, quelqu'un (null) tant qu'elle n'en a aucun.
 */
function stillToMeet(
  config: OneToOneConfig,
  live: OneToOneMeeting[],
  candidate: Candidate,
): (string | null)[] {
  const theirs = live.filter((m) => m.candidateId === candidate.id);
  const mine = mentorsOf(config, candidate);
  if (!mine.length) return theirs.length ? [] : [null];
  return mine.filter((id) => !theirs.some((m) => m.personId === id));
}

/** What is being dragged: a placed meeting, or a startup with none yet. */
type Dragged = { kind: 'meeting'; meeting: OneToOneMeeting } | { kind: 'startup'; candidate: Candidate };

export function OneToOneWorkspace({ block, onOpenSetup }: { block: Block; onOpenSetup: (id: string) => void }) {
  const view = useAsync(() => api.get<View>(`/api/blocks/${block.id}/one-to-one`), `oto:${block.id}`);
  const [side, setSide] = useState<'planning' | 'reporting'>('planning');
  const [dayId, setDayId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ day: OneToOneDay; personId: string; startTime: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<Dragged | null>(null);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;
  const data = view.data;
  const { config, days, meetings, pool, interlocutors } = data;
  const opened = meetings.find((m) => m.id === openId) ?? null;
  const current = days.find((d) => d.id === dayId) ?? days.find((d) => (d.heldOn ?? '') >= todayIso()) ?? days[0] ?? null;
  const name = (id: string | null) => interlocutors.find((p) => p.id === id)?.name ?? '';
  const live = meetings.filter((m) => m.status !== 'cancelled');

  if (!config.interlocutors.length || !config.report.fields.length) {
    return (
      <div className="empty" style={{ padding: 26 }}>
        <h3>{config.interlocutors.length ? 'The report has no question yet' : 'Nobody to meet yet'}</h3>
        <p>
          {config.interlocutors.length
            ? 'Write what an interlocutor fills in after each meeting, then plan the meetings here.'
            : 'Name the mentors and experts the startups will meet, set the days, and write the report they fill in.'}
        </p>
        <button className="btn primary" onClick={() => onOpenSetup(block.id)}>
          <Icon name="settings" size={14} /> Open the setup
        </button>
      </div>
    );
  }

  /* Le rail, comme au comité : ce qui attend sur cette journée, puis le vivier.
     Une startup y reste tant qu'il lui manque un rendez-vous — avec l'un de
     ses mentors quand elle en a, avec quiconque sinon. */
  const unplaced = pool.filter((p) => stillToMeet(config, live, p.candidate).length > 0);
  const booking = live.filter((m) => m.invite === 'slots' && !m.heldOn);
  const noTime = live.filter((m) => m.invite !== 'slots' && !m.heldOn);
  const onDay = current ? live.filter((m) => m.dayId === current.id) : [];
  const capacity = current ? daySlots(current).length * current.interlocutors.length : 0;

  const refresh = async () => view.set(await api.get<View>(`/api/blocks/${block.id}/one-to-one`));

  /** Une startup posée sur une case : un rendez-vous de plus, ou un rendez-vous déplacé. */
  const dropOn = async (day: OneToOneDay, personId: string, startTime: string) => {
    const payload = drag.current;
    drag.current = null;
    setOver(null);
    if (!payload) return;
    setBusy(true);
    try {
      if (payload.kind === 'startup') {
        await api.post(`/api/blocks/${block.id}/meetings`, {
          candidateIds: [payload.candidate.id],
          personId,
          dayId: day.id,
          /* Placée par l'équipe : proposée ou fixée, selon la brique — jamais
             « à réserver », puisque l'heure est déjà choisie. */
          invite: config.invite === 'slots' ? 'none' : config.invite,
          heldOn: day.heldOn,
          startTime,
        });
      } else {
        await api.patch(`/api/meetings/${payload.meeting.id}`, { personId, dayId: day.id, heldOn: day.heldOn, startTime });
      }
      await refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  /** Hors de la case, pas hors du programme : le rendez-vous reste, sans heure. */
  const clearTime = async (m: OneToOneMeeting) => {
    setBusy(true);
    try {
      await api.patch(`/api/meetings/${m.id}`, { heldOn: null, startTime: null, dayId: null });
      await refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const inform = async () => {
    setBusy(true);
    try {
      const sent = await api.post<{ startups: number; people: number }>(`/api/blocks/${block.id}/one-to-one/inform`, {
        dayId: current?.id ?? null,
      });
      toast(
        sent.startups || sent.people
          ? `Written to ${sent.startups} startup${sent.startups === 1 ? '' : 's'} and ${sent.people} interlocutor${sent.people === 1 ? '' : 's'}.`
          : 'Everybody on this day has already been told.',
      );
      await refresh();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const chip = (candidate: Candidate, extra?: ReactNode, meeting?: OneToOneMeeting) => (
    <div
      className="pool-chip"
      key={meeting?.id ?? candidate.id}
      draggable={!busy}
      onDragStart={() => {
        drag.current = meeting ? { kind: 'meeting', meeting } : { kind: 'startup', candidate };
      }}
    >
      <span className="grip">
        <Icon name="drag" size={12} />
      </span>
      <span className="chip-name">{candidate.orgName}</span>
      {extra}
    </div>
  );

  return (
    <>
      {/* ---- which day, and what to do with it ---- */}
      <div className="work-head">
        <div className="seg" role="group" aria-label="View">
          <button className={side === 'planning' ? 'on' : ''} onClick={() => setSide('planning')}>
            <Icon name="calendar" size={13} /> Planning
          </button>
          <button className={side === 'reporting' ? 'on' : ''} onClick={() => setSide('reporting')}>
            <Icon name="form" size={13} /> Reporting
          </button>
        </div>
        {side === 'planning' && (
          <div className="work-pick">
            {days.map((d) => (
              <button key={d.id} className={d.id === current?.id ? 'track on' : 'track'} onClick={() => setDayId(d.id)}>
                {d.name || 'Day'}
                <span className="faint" style={{ fontWeight: 400 }}>
                  {' '}
                  · {formatDate(d.heldOn)} · {live.filter((m) => m.dayId === d.id).length}/
                  {daySlots(d).length * d.interlocutors.length}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="spacer" />
        {side === 'planning' && (
          <>
            {/* Inviter : les startups choisissent leur créneau elles-mêmes. */}
            {config.invite === 'slots' && (
              <button className="btn primary sm" disabled={busy || !unplaced.length} onClick={() => setInviting(true)}>
                <Icon name="send" size={13} /> Invite
              </button>
            )}
            <button className="btn sm" disabled={busy || !current} onClick={inform} title="Write to everyone on this day not told yet">
              <Icon name="send" size={13} /> Inform
            </button>
            <button className="btn ghost sm" onClick={() => setPlanning(true)} title="A meeting outside the days — or a series">
              <Icon name="plus" size={13} /> Meeting
            </button>
          </>
        )}
      </div>

      {side === 'reporting' ? (
        <Reports data={data} onOpen={setOpenId} />
      ) : !current ? (
        <div className="empty">
          <h3>No day yet</h3>
          <p>
            The days the meetings happen on — date, hours, who receives — are set on the block, in the <strong>Days</strong>{' '}
            tab of its setup.
          </p>
          <button className="btn primary" onClick={() => onOpenSetup(block.id)}>
            <Icon name="settings" /> Open the setup
          </button>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ fontSize: 12.5 }}>
            <span className="faint">
              {formatDate(current.heldOn)} · {current.windows.map((w) => `${w.startsAt}–${w.endsAt}`).join(' + ')} ·{' '}
              <span className="num">{current.minutesPerMeeting}</span> min each
              {current.location && ` · ${current.location}`}
            </span>
            <span className={onDay.length > capacity ? 'badge stop num' : 'badge num'}>
              {onDay.length}/{capacity}
            </span>
            <span className="badge">{INVITE_WORDS[config.invite].title}</span>
          </div>

          <div className="day-split">
            <div className="day-stage">
              {/* Une colonne par interlocuteur du jour : c'est chez lui qu'on
                  pose la startup. */}
              <div className="day">
                {current.interlocutors.map((personId) => (
                  <section className="day-col" key={personId}>
                    <header>
                      <span className="eyebrow">{name(personId) || 'Interlocutor'}</span>
                      <span className="num faint">
                        {live.filter((m) => m.dayId === current.id && m.personId === personId).length}/{daySlots(current).length}
                      </span>
                    </header>
                    <div className="day-slots">
                      {daySlots(current).map((slot) => {
                        const m = onDay.find((x) => x.personId === personId && x.startTime === slot.startsAt);
                        const key = `${personId}:${slot.startsAt}`;
                        const state = m ? STATE_BADGE[meetingState(m)] : null;
                        return (
                          <div
                            key={slot.index}
                            className={`slot-row${over === key ? ' over' : ''}${m ? '' : ' free'}`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setOver(key);
                            }}
                            onDragLeave={() => setOver((o) => (o === key ? null : o))}
                            onDrop={(e) => {
                              e.preventDefault();
                              void dropOn(current, personId, slot.startsAt);
                            }}
                          >
                            <span className="slot-time num">{slot.startsAt}</span>
                            {m ? (
                              <div
                                className="seated"
                                draggable={!busy}
                                onDragStart={() => {
                                  drag.current = { kind: 'meeting', meeting: m };
                                }}
                              >
                                <span className="grip">
                                  <Icon name="drag" size={13} />
                                </span>
                                <button className="seated-main oto-seat" onClick={() => setOpenId(m.id)} title="Open the meeting and its report">
                                  <div className="seated-name">{m.orgName}</div>
                                  <div className="seated-meta">
                                    {state && (
                                      <span className={state.tone} title={m.rsvpState === 'declined' && m.rsvpNote ? m.rsvpNote : undefined}>
                                        {state.label}
                                        {/* Un mot laissé en refusant : lu au survol, ou en ouvrant le rendez-vous. */}
                                        {m.rsvpState === 'declined' && m.rsvpNote ? ' 💬' : ''}
                                      </span>
                                    )}
                                  </div>
                                </button>
                                <div className="seat-actions">
                                  <button
                                    className="btn ghost icon sm"
                                    disabled={busy}
                                    onClick={() => clearTime(m)}
                                    title="Free this time — the meeting goes back to No time yet"
                                    aria-label="Free this time"
                                  >
                                    <Icon name="x" size={13} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="slot-free"
                                disabled={busy || (!unplaced.length && !noTime.length)}
                                onClick={() => setPlacing({ day: current, personId, startTime: slot.startsAt })}
                                title="Put a startup here"
                              >
                                free
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {!current.interlocutors.length && (
                  <div className="empty">Nobody receives on this day — add interlocutors to it in the setup.</div>
                )}
              </div>
            </div>

            {/* ---- the rail ---- */}
            <aside
              className={`pool-rail day-rail${over === 'rail' ? ' over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver('rail');
              }}
              onDragLeave={() => setOver((o) => (o === 'rail' ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const payload = drag.current;
                drag.current = null;
                setOver(null);
                if (payload?.kind === 'meeting') void clearTime(payload.meeting);
              }}
            >
              {noTime.length > 0 && (
                <>
                  <div className="rail-head">
                    <span className="eyebrow">No time yet</span>
                    <span className="num faint">{noTime.length}</span>
                  </div>
                  {noTime.map((m) => {
                    const c = pool.find((p) => p.candidate.id === m.candidateId)?.candidate;
                    return c ? chip(c, m.personName ? <span className="badge">{m.personName}</span> : null, m) : null;
                  })}
                  <div className="public-sep" style={{ margin: '12px 0 6px' }} />
                </>
              )}

              {booking.length > 0 && (
                <>
                  <div className="rail-head">
                    <span className="eyebrow">Invited to book</span>
                    <span className="num faint">{booking.length}</span>
                  </div>
                  {booking.map((m) => (
                    <div className="pool-chip" key={m.id}>
                      <span className="chip-name">{m.orgName}</span>
                      {m.personName && <span className="badge">{m.personName}</span>}
                      <button
                        className="chip-x"
                        title="Copy their link to book"
                        aria-label={`Copy ${m.orgName}’s link`}
                        onClick={() => {
                          navigator.clipboard?.writeText(`${window.location.origin}/meet/${m.token}`);
                          toast('Link copied.');
                        }}
                      >
                        <Icon name="link" size={11} />
                      </button>
                    </div>
                  ))}
                  <div className="public-sep" style={{ margin: '12px 0 6px' }} />
                </>
              )}

              <div className="rail-head">
                <span className="eyebrow">No meeting yet</span>
                <span className="num faint">{unplaced.length}</span>
              </div>
              {unplaced.length ? (
                unplaced.map(({ candidate }) => {
                  const mine = mentorsOf(config, candidate);
                  return chip(
                    candidate,
                    mine.length ? (
                      <span className="badge" title="Their mentors">{mine.map(name).join(', ')}</span>
                    ) : null,
                  );
                })
              ) : pool.length ? (
                <p className="faint" style={{ margin: 0, fontSize: 12 }}>Every startup has a meeting.</p>
              ) : (
                /* Personne ici : dire pourquoi, plutôt que « tout le monde a un rendez-vous ». */
                <div className="stack" style={{ gap: 6 }}>
                  <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                    No startup reaches this brick yet.
                    {config.intake === 'upstream' && data.reach.from
                      ? ` It takes those who passed “${data.reach.from}”, and nobody has so far.`
                      : ''}
                  </p>
                  <button className="btn sm" onClick={() => onOpenSetup(block.id)}>
                    <Icon name="settings" size={12} /> Which startups
                  </button>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {placing && (
        <Modal
          title={`Who meets ${name(placing.personId)} at ${placing.startTime}?`}
          subtitle={`${placing.day.name || 'Day'} · ${formatDate(placing.day.heldOn)}`}
          onClose={() => setPlacing(null)}
        >
          {/* Les mêmes listes que le rail, dans le même ordre — la voie qui
              marche au clavier, et sur un écran trop étroit pour les deux. */}
          <div className="rows">
            {noTime.map((m) => (
              <button
                className="pick"
                key={m.id}
                onClick={async () => {
                  drag.current = { kind: 'meeting', meeting: m };
                  await dropOn(placing.day, placing.personId, placing.startTime);
                  setPlacing(null);
                }}
              >
                <Icon name="plus" size={14} />
                <div>
                  <strong>{m.orgName}</strong>
                  <span>A meeting with no time yet</span>
                </div>
              </button>
            ))}
            {unplaced.map(({ candidate }) => (
              <button
                className="pick"
                key={candidate.id}
                onClick={async () => {
                  drag.current = { kind: 'startup', candidate };
                  await dropOn(placing.day, placing.personId, placing.startTime);
                  setPlacing(null);
                }}
              >
                <Icon name="plus" size={14} />
                <div>
                  <strong>{candidate.orgName}</strong>
                  <span>
                    {mentorsOf(config, candidate).includes(placing.personId) ? 'Their mentor' : candidate.contactName}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {inviting && (
        <InviteModal
          data={data}
          onClose={() => setInviting(false)}
          onDone={() => {
            setInviting(false);
            void refresh();
          }}
        />
      )}

      {planning && (
        <PlanModal
          data={data}
          preselected={[]}
          onClose={() => setPlanning(false)}
          onDone={() => {
            setPlanning(false);
            void refresh();
          }}
        />
      )}

      {opened && (
        <MeetingDrawer
          key={opened.id}
          meeting={opened}
          data={data}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

/**
 * Inviter des startups à réserver.
 *
 * Chacune reçoit son lien : les créneaux libres des journées, chez son mentor
 * quand elle en a un parmi les interlocuteurs, chez qui elle veut sinon — ou
 * chez la personne qu'on choisit ici.
 */
function InviteModal({ data, onClose, onDone }: { data: View; onClose: () => void; onDone: () => void }) {
  const live = data.meetings.filter((m) => m.status !== 'cancelled');
  const unplaced = data.pool.filter((p) => stillToMeet(data.config, live, p.candidate).length > 0);
  const [picked, setPicked] = useState<string[]>(unplaced.map((p) => p.candidate.id));
  const [who, setWho] = useState<string>('mentors');
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const cells = data.days
    .filter((d) => (d.heldOn ?? '') >= todayIso())
    .reduce((n, d) => n + daySlots(d).length * d.interlocutors.length, 0);

  /**
   * Chez qui chacune réserve : un rendez-vous avec chacun de ses mentors — ou,
   * sans mentor, chez qui elle veut —, chez n'importe qui, ou chez une
   * personne choisie.
   */
  const peopleFor = (c: Candidate): (string | null)[] => {
    if (who === 'anyone') return [null];
    if (who === 'mentors') return stillToMeet(data.config, live, c);
    return [who];
  };

  const send = async () => {
    setBusy(true);
    try {
      /* Regroupées par interlocuteur : une demande par groupe, chacune prévenue. */
      const groups = new Map<string | null, string[]>();
      for (const { candidate } of unplaced.filter((p) => picked.includes(p.candidate.id))) {
        for (const key of peopleFor(candidate)) groups.set(key, [...(groups.get(key) ?? []), candidate.id]);
      }
      let count = 0;
      for (const [personId, candidateIds] of groups) {
        const made = await api.post<unknown[]>(`/api/blocks/${data.block.id}/meetings`, {
          candidateIds, personId, invite: 'slots', heldOn: null, startTime: null, tell,
        });
        count += made.length;
      }
      toast(`${count} invited to book${tell ? ' — and written to' : ''}.`);
      onDone();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Invite to book"
      subtitle="Each startup gets its own link to the free slots of the days."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !picked.length} onClick={send}>
            {busy ? 'Inviting…' : `Invite ${picked.length}`}
          </button>
        </>
      }
    >
      {!cells && (
        <div className="callout warn">
          <Icon name="alert" size={15} /> No day coming up — add one in the setup, or they will find nothing to book.
        </div>
      )}
      <div className="field">
        <label>Who they book with</label>
        <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="mentors">A meeting with each of their mentors — anyone when they have none</option>
          <option value="anyone">Anyone receiving on the days</option>
          {data.interlocutors.map((p) => (
            <option key={p.id} value={p.id}>Only {p.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <div className="row">
          <label style={{ flex: 1 }}>Startups</label>
          <button
            className="linkish"
            onClick={() => setPicked(picked.length === unplaced.length ? [] : unplaced.map((p) => p.candidate.id))}
          >
            {picked.length === unplaced.length ? 'None' : 'All'}
          </button>
        </div>
        <div className="rows oto-pick">
          {unplaced.map(({ candidate }) => (
            <label className="check rowcard" style={{ padding: '7px 10px' }} key={candidate.id}>
              <input
                type="checkbox"
                checked={picked.includes(candidate.id)}
                onChange={() =>
                  setPicked((p) => (p.includes(candidate.id) ? p.filter((x) => x !== candidate.id) : [...p, candidate.id]))
                }
              />
              <span style={{ flex: 1, fontSize: 13 }}>{candidate.orgName}</span>
              {who === 'mentors' && (
                <span className="faint" style={{ fontSize: 12 }}>
                  {mentorsOf(data.config, candidate)
                    .map((id) => data.interlocutors.find((p) => p.id === id)?.name ?? '')
                    .join(', ') || 'anyone'}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
        <span>Write to them now, with their link — the letter is in the setup’s Messages tab</span>
      </label>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>{cells} slots free across the days coming up.</p>
    </Modal>
  );
}

/** Planifier : une ou plusieurs startups, un interlocuteur, une façon de fixer l'heure. */
function PlanModal({
  data,
  preselected,
  onClose,
  onDone,
}: {
  data: View;
  preselected: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const first = data.pool.find((p) => p.candidate.id === preselected[0])?.candidate;
  /* Son mentor d'abord, quand la startup en a un parmi les interlocuteurs. */
  const mentor = first?.mentorId && data.config.interlocutors.includes(first.mentorId) ? first.mentorId : '';
  const [picked, setPicked] = useState<string[]>(preselected);
  const [personId, setPersonId] = useState(mentor || data.interlocutors[0]?.id || '');
  /* Le mode est celui de la brique (onglet Invitations). Dans une brique où les
     startups choisissent leur heure, un rendez-vous placé à la main leur est
     proposé à confirmer. */
  const invite: 'confirm' | 'none' = data.config.invite === 'none' ? 'none' : 'confirm';
  const [heldOn, setHeldOn] = useState('');
  const [startTime, setStartTime] = useState('');
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('weekly');
  const [count, setCount] = useState(6);
  const [tell, setTell] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const books = false;
  /* Laisser réserver : autant de startups qu'on veut, chacune prendra son
     créneau. Une heure donnée : une startup, et une série possible. */
  const ready = picked.length > 0 && personId && (books || (heldOn && startTime && picked.length === 1));

  const toggle = (id: string) =>
    setPicked((p) => (books ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const made = await api.post<unknown[]>(`/api/blocks/${data.block.id}/meetings`, {
        candidateIds: picked,
        personId,
        invite,
        heldOn: books ? null : heldOn,
        startTime: books ? null : startTime,
        repeat: !books && repeats ? { frequency, count, until: null } : null,
        tell,
      });
      toast(
        books
          ? `${made.length} invited to book.`
          : repeats
            ? `${made.length} sessions planned.`
            : invite === 'confirm'
              ? 'Proposed — waiting for their answer.'
              : 'In the diary.',
      );
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="A meeting outside the days"
      subtitle="At a time of its own — or a series, a weekly mentoring for instance."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving || !ready} onClick={save}>
            {saving ? 'Planning…' : books ? 'Invite them to book' : invite === 'confirm' ? 'Propose it' : 'Fix it'}
          </button>
        </>
      }
    >
      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        {data.config.invite === 'none'
          ? 'No invitation in this brick: the startup is told, nothing to answer.'
          : data.config.invite === 'confirm'
            ? 'The startup is asked to confirm the time, as set in the Invitations tab.'
            : 'In this brick the startups pick their own time; a meeting placed by hand is proposed to them to confirm.'}
      </p>

      <div className="field">
        <label>{books ? 'Startups' : 'Startup'}</label>
        {books ? (
          <div className="rows oto-pick">
            {data.pool.map(({ candidate }) => (
              <label className="check rowcard" style={{ padding: '7px 10px' }} key={candidate.id}>
                <input type="checkbox" checked={picked.includes(candidate.id)} onChange={() => toggle(candidate.id)} />
                <span style={{ fontSize: 13 }}>{candidate.orgName}</span>
              </label>
            ))}
          </div>
        ) : (
          <select
            className="input"
            value={picked[0] ?? ''}
            onChange={(e) => {
              setPicked(e.target.value ? [e.target.value] : []);
              const c = data.pool.find((p) => p.candidate.id === e.target.value)?.candidate;
              if (c?.mentorId && data.config.interlocutors.includes(c.mentorId)) setPersonId(c.mentorId);
            }}
          >
            <option value="">Pick a startup…</option>
            {data.pool.map(({ candidate }) => (
              <option key={candidate.id} value={candidate.id}>{candidate.orgName}</option>
            ))}
          </select>
        )}
      </div>

      <div className="field">
        <label>Meets</label>
        <select className="input" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {data.interlocutors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {first?.mentorId === p.id ? ' — their mentor' : ''}
            </option>
          ))}
        </select>
        {errors.personId && <div className="err">{errors.personId}</div>}
      </div>

      {!books && (
        <>
          <div className="grid-2">
            <div className="field">
              <label>{repeats ? 'First session' : 'Day'}</label>
              <input className="input" type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
              {errors.heldOn && <div className="err">{errors.heldOn}</div>}
            </div>
            <div className="field">
              <label>Time</label>
              <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              {errors.startTime && <div className="err">{errors.startTime}</div>}
            </div>
          </div>

          <label className="check">
            <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            <span>It repeats — a weekly mentoring, for instance</span>
          </label>
          {repeats && (
            <div className="sheet-group">
              <div className="grid-2">
                <div className="field">
                  <label>How often</label>
                  <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>How many sessions</label>
                  <input
                    className="input num"
                    type="number"
                    min={2}
                    max={MAX_SESSIONS}
                    value={count}
                    onChange={(e) => setCount(Math.max(2, Math.min(MAX_SESSIONS, Number(e.target.value) || 2)))}
                  />
                </div>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                Each session is a meeting of its own, with its own report — moved or cancelled on its own.
              </p>
            </div>
          )}
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
        <span>
          Tell them by email — the startup{books ? ', with its link to book' : invite === 'confirm' ? ', with its link to confirm' : ''}, and
          the interlocutor
        </span>
      </label>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        {data.config.durationMinutes} minutes{data.config.location ? ` · ${data.config.location}` : ''} — set in the brick, and
        changeable on the meeting.
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* One meeting                                                         */
/* ------------------------------------------------------------------ */

function MeetingDrawer({
  meeting,
  data,
  onClose,
  onChanged,
}: {
  meeting: OneToOneMeeting;
  data: View;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [heldOn, setHeldOn] = useState(meeting.heldOn ?? '');
  const [startTime, setStartTime] = useState(meeting.startTime ?? '');
  const [personId, setPersonId] = useState(meeting.personId ?? '');
  /* Où, et le lien de la visio : propres à chaque rendez-vous, pré-remplis par
     sa journée ou la brique. */
  const [place, setPlace] = useState(meeting.location ?? '');
  const [videoLink, setVideoLink] = useState(meeting.meetingLink ?? '');
  const [answers, setAnswers] = useState<Record<string, unknown>>(meeting.report);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const toast = useToast();
  const pages = formPages(data.config.report);
  const state = STATE_BADGE[meetingState(meeting)];
  const link = `${window.location.origin}/meet/${meeting.token}`;

  const change = async (patch: Record<string, unknown>, said: string) => {
    setBusy(true);
    try {
      await api.patch(`/api/meetings/${meeting.id}`, patch);
      toast(said);
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const report = async (submit: boolean) => {
    setBusy(true);
    setErrors({});
    try {
      await api.put(`/api/meetings/${meeting.id}/report`, { answers, submit });
      toast(submit ? 'Report sent.' : 'Draft saved.');
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const moved =
    heldOn !== (meeting.heldOn ?? '') || startTime !== (meeting.startTime ?? '') || personId !== (meeting.personId ?? '');

  const tell = async (who: { startup?: boolean; person?: boolean }) => {
    setBusy(true);
    try {
      const sent = await api.post<{ startup: boolean; person: boolean }>(`/api/meetings/${meeting.id}/tell`, who);
      toast(
        sent.startup || sent.person
          ? 'Written to.'
          : 'Nobody could be written to — no email address on file.',
        !(sent.startup || sent.person),
      );
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        wide
        title={meeting.orgName}
        subtitle={`${meeting.personName || 'Interlocutor not chosen yet'} · ${when(meeting)}`}
        onClose={onClose}
        footer={
          <>
            <button className="btn danger sm" onClick={() => setRemoving(true)}>
              <Icon name="trash" size={13} /> Delete
            </button>
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>Close</button>
          </>
        }
      >
        <div className="row wrap" style={{ gap: 6 }}>
          <span className={state.tone}>{state.label}</span>
          <span className="badge">{INVITE_WORDS[meeting.invite].title}</span>
          {meeting.reportSubmittedAt && (
            <span className="faint" style={{ fontSize: 12 }}>
              Report by {meeting.reportByName} · {formatDate(meeting.reportSubmittedAt)}
            </span>
          )}
        </div>

        {/* La réponse de la startup, et le lien pour la donner — en attendant
            que la lettre l'emporte. */}
        {meeting.invite === 'slots' && meeting.status === 'planned' && (
          <div className="callout">
            <Icon name="link" size={15} />
            <div style={{ flex: 1 }}>
              {meeting.heldOn
                ? 'The startup booked this time.'
                : meeting.rsvpState === 'declined'
                  ? 'The startup says none of the times work — open more, or place them by hand. Their link:'
                  : 'Waiting for the startup to book a time. Their link:'}
              {!meeting.heldOn && meeting.rsvpState === 'declined' && meeting.rsvpNote && (
                <div style={{ marginTop: 4, fontStyle: 'italic' }}>“{meeting.rsvpNote}”</div>
              )}
              {!meeting.heldOn && (
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <code className="public-link">{link}</code>
                  <button
                    className="btn sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(link);
                      toast('Link copied.');
                    }}
                  >
                    <Icon name="copy" size={13} /> Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {meeting.invite === 'confirm' && meeting.status === 'planned' && (
          <div className="callout">
            <Icon name="link" size={15} />
            <div style={{ flex: 1 }}>
              {meeting.rsvpState === 'pending'
                ? 'Waiting for the startup to confirm. Send them this link:'
                : meeting.rsvpState === 'confirmed'
                  ? 'The startup confirmed.'
                  : 'The startup declined — propose another time.'}
              {meeting.rsvpState === 'declined' && meeting.rsvpNote && (
                <div style={{ marginTop: 4, fontStyle: 'italic' }}>“{meeting.rsvpNote}”</div>
              )}
              {meeting.rsvpState === 'pending' && (
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <code className="public-link">{link}</code>
                  <button
                    className="btn sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(link);
                      toast('Link copied.');
                    }}
                  >
                    <Icon name="copy" size={13} /> Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid-3">
          <div className="field">
            <label>Day</label>
            <input className="input" type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          </div>
          <div className="field">
            <label>Time</label>
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label>Meets</label>
            <select className="input" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {!personId && <option value="">Not chosen yet</option>}
              {data.interlocutors.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Where</label>
            <input className="input" value={place} placeholder="CEED, Casablanca" onChange={(e) => setPlace(e.target.value)} />
          </div>
          <div className="field">
            <label>Video link</label>
            <input
              className="input"
              value={videoLink}
              placeholder="https://meet.google.com/…"
              onChange={(e) => setVideoLink(e.target.value)}
            />
          </div>
        </div>
        {(place !== (meeting.location ?? '') || videoLink !== (meeting.meetingLink ?? '')) && (
          <div className="row">
            <span className="faint" style={{ flex: 1, fontSize: 12 }}>Said in the letters and in both diaries.</span>
            <button
              className="btn primary sm"
              disabled={busy}
              onClick={() => change({ location: place, meetingLink: videoLink.trim() }, 'Place saved.')}
            >
              Save the place
            </button>
          </div>
        )}
        <div className="row wrap" style={{ gap: 6 }}>
          {moved && (
            <button
              className="btn primary sm"
              disabled={busy}
              onClick={() =>
                change(
                  { heldOn: heldOn || null, startTime: startTime || null, ...(personId ? { personId } : {}) },
                  meeting.invite === 'confirm' ? 'Moved — they are asked again.' : 'Moved.',
                )
              }
            >
              Save the change
            </button>
          )}
          <div className="spacer" />
          {meeting.status !== 'held' && (
            <button className="btn sm" disabled={busy} onClick={() => change({ status: 'held' }, 'Marked as held.')}>
              <Icon name="check" size={12} /> {MEETING_STATUS_LABEL.held}
            </button>
          )}
          {meeting.status !== 'no_show' && (
            <button className="btn sm" disabled={busy} onClick={() => change({ status: 'no_show' }, 'Marked as a no-show.')}>
              {MEETING_STATUS_LABEL.no_show}
            </button>
          )}
          {meeting.status !== 'cancelled' && meeting.seriesId && (
            <button
              className="btn sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.patch(`/api/meetings/${meeting.id}?scope=following`, { status: 'cancelled' });
                  toast('This session and the following ones are cancelled.');
                  onChanged();
                } catch (err) {
                  toast((err as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel this and the following
            </button>
          )}
          {meeting.status !== 'cancelled' ? (
            <button className="btn sm" disabled={busy} onClick={() => change({ status: 'cancelled' }, 'Cancelled.')}>
              Cancel
            </button>
          ) : (
            <button className="btn sm" disabled={busy} onClick={() => change({ status: 'planned' }, 'Back in the diary.')}>
              Restore
            </button>
          )}
        </div>

        {/* Qui a été prévenu, et quand : une lettre partie avant un changement
            d'heure dit l'ancienne heure. */}
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="faint" style={{ fontSize: 12, flex: 1 }}>
            Startup {meeting.toldStartupAt ? `told ${formatDate(meeting.toldStartupAt)}` : 'not told'} · Interlocutor{' '}
            {meeting.toldPersonAt ? `told ${formatDate(meeting.toldPersonAt)}` : 'not told'}
          </span>
          <button className="btn ghost sm" disabled={busy} onClick={() => tell({ startup: true })}>
            <Icon name="send" size={12} /> Write to the startup
          </button>
          {meeting.personId && (
            <button className="btn ghost sm" disabled={busy} onClick={() => tell({ person: true })}>
              <Icon name="send" size={12} /> Write to {meeting.personName}
            </button>
          )}
        </div>

        {/* Le compte rendu, que CEED peut écrire à la place de l'interlocuteur
            — dicté au téléphone, ou repris d'une note. */}
        <h3 className="section-title" style={{ marginTop: 6 }}>Report</h3>
        {pages.map((page) => (
          <FormPageBody
            key={page.page.id || 'single'}
            heading={pages.length > 1}
            page={{ ...page.page, fields: page.fields }}
            values={answers}
            errors={errors}
            onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
          />
        ))}
        <div className="row" style={{ gap: 6 }}>
          <div className="spacer" />
          <button className="btn" disabled={busy} onClick={() => report(false)}>Save draft</button>
          <button className="btn primary" disabled={busy} onClick={() => report(true)}>
            {meeting.reportSubmittedAt ? 'Update the report' : 'Send the report'}
          </button>
        </div>
      </Drawer>

      {removing && (
        <ConfirmDialog
          title="Delete this meeting?"
          body={`The meeting with ${meeting.orgName} and its report are deleted. To keep a trace, cancel it instead.`}
          confirmLabel="Delete"
          destructive
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await api.del(`/api/meetings/${meeting.id}`);
            onClose();
            onChanged();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

/** A report answer, as a cell: a list joined, a file by its name. */
const asText = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(asText).join(', ');
  if (typeof v === 'object') return String((v as { filename?: string }).filename ?? '');
  return String(v);
};

function Reports({ data, onOpen }: { data: View; onOpen: (id: string) => void }) {
  const [tab, setTab] = useState<'summary' | 'startups' | 'responses'>('summary');
  const [person, setPerson] = useState('');
  const [startup, setStartup] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const fields = data.config.report.fields;

  /* Les comptes rendus envoyés : un brouillon n'est pas encore une réponse. */
  const sent = useMemo(
    () =>
      data.meetings.filter(
        (m) =>
          m.reportSubmittedAt &&
          (!person || m.personId === person) &&
          (!startup || m.candidateId === startup) &&
          (!from || (m.heldOn ?? '') >= from) &&
          (!to || (m.heldOn ?? '') <= to),
      ),
    [data.meetings, person, startup, from, to],
  );
  const summaries = fields.map((f) => summarise(f, sent.map((m) => m.report)));

  const exportAll = () => {
    const head: Cell[] = ['Date', 'Time', 'Startup', 'Interlocutor', 'Status', ...fields.map((f) => f.label), 'Sent'];
    const rows: Cell[][] = [head];
    for (const m of sent) {
      rows.push([
        m.heldOn ?? '', m.startTime ?? '', m.orgName, m.personName, MEETING_STATUS_LABEL[m.status],
        ...fields.map((f) => asText(m.report[f.id])),
        m.reportSubmittedAt?.slice(0, 10) ?? '',
      ]);
    }
    download(toWorkbook([{ name: 'Reports', rows }]), `${data.block.name} — reports.xlsx`);
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="seg" role="group" aria-label="Reports view">
          <button className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>By question</button>
          <button className={tab === 'startups' ? 'on' : ''} onClick={() => setTab('startups')}>By startup</button>
          <button className={tab === 'responses' ? 'on' : ''} onClick={() => setTab('responses')}>
            Responses <span className="num">{sent.length}</span>
          </button>
        </div>
        <select className="status-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Interlocutor">
          <option value="">Every interlocutor</option>
          {data.interlocutors.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className="status-select" value={startup} onChange={(e) => setStartup(e.target.value)} aria-label="Startup">
          <option value="">Every startup</option>
          {data.pool.map(({ candidate }) => (
            <option key={candidate.id} value={candidate.id}>{candidate.orgName}</option>
          ))}
        </select>
        <input className="input" type="date" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className="input" type="date" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <div className="spacer" />
        <button className="btn sm" disabled={!sent.length} onClick={exportAll}>
          <Icon name="file" size={13} /> Export
        </button>
      </div>

      {!sent.length ? (
        <div className="empty" style={{ padding: 24 }}>
          <p style={{ margin: 0 }}>No report sent{person || startup || from || to ? ' for this selection' : ' yet'}.</p>
        </div>
      ) : tab === 'startups' ? (
        <ByStartup meetings={sent} fields={fields} onOpen={onOpen} />
      ) : tab === 'summary' ? (
        <div className="stack" style={{ gap: 10 }}>
          {summaries.map((s) => (
            <SummaryCard key={s.field.id} summary={s} total={sent.length} />
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Startup</th>
                <th>Interlocutor</th>
                {fields.map((f) => (
                  <th key={f.id}>{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sent.map((m) => (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(m.id)}>
                  <td className="num">{when(m)}</td>
                  <td className="name">{m.orgName}</td>
                  <td className="muted">{m.personName}</td>
                  {fields.map((f) => (
                    <td key={f.id} className="muted" style={{ maxWidth: 280 }}>
                      {asText(m.report[f.id]) || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Une question, résumée : des barres pour un choix, des chiffres pour un nombre, les réponses pour un texte. */
function SummaryCard({ summary: s, total }: { summary: QuestionSummary; total: number }) {
  const field: FormField = s.field;
  return (
    <section className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row">
        <strong style={{ flex: 1, fontSize: 13.5 }}>{field.label}</strong>
        <span className="faint num" style={{ fontSize: 12 }}>
          {s.answered} / {total} answered
        </span>
      </div>
      {s.kind === 'choice' && (
        <div className="stack" style={{ gap: 5 }}>
          {s.counts.map(({ option, count }) => {
            const max = Math.max(1, ...s.counts.map((c) => c.count));
            return (
              <div className="oto-bar" key={option}>
                <span className="oto-bar-label">{option}</span>
                <span className="oto-bar-track">
                  <span className="oto-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className="num faint" style={{ width: 70, textAlign: 'right', fontSize: 12 }}>
                  {count} · {s.answered ? Math.round((count / s.answered) * 100) : 0} %
                </span>
              </div>
            );
          })}
        </div>
      )}
      {s.kind === 'number' && (
        <div className="view-tiles">
          {(
            [
              ['Average', s.average],
              ['Lowest', s.min],
              ['Highest', s.max],
            ] as const
          ).map(([label, n]) => (
            <div className="view-tile" key={label}>
              <div className="eyebrow">{label}</div>
              <div className="view-tile-value num">{n === null ? '—' : Math.round(n * 10) / 10}</div>
            </div>
          ))}
        </div>
      )}
      {s.kind === 'text' && (
        <ul className="oto-answers">
          {s.answers.slice(0, 20).map((a, i) => (
            <li key={i}>{a}</li>
          ))}
          {s.answers.length > 20 && <li className="faint">… and {s.answers.length - 20} more — see Responses.</li>}
        </ul>
      )}
      {s.kind === 'file' && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{s.answered} file(s) attached.</p>}
    </section>
  );
}


/**
 * Les comptes rendus d'une startup, l'un sous l'autre : ce que chaque
 * interlocuteur en a dit, du plus récent au plus ancien.
 */
function ByStartup({
  meetings,
  fields,
  onOpen,
}: {
  meetings: OneToOneMeeting[];
  fields: FormField[];
  onOpen: (id: string) => void;
}) {
  const startups = [...new Map(meetings.map((m) => [m.candidateId, m.orgName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <div className="stack" style={{ gap: 12 }}>
      {startups.map(([candidateId, orgName]) => {
        const theirs = meetings
          .filter((m) => m.candidateId === candidateId)
          .sort((a, b) => (b.heldOn ?? '').localeCompare(a.heldOn ?? ''));
        return (
          <section className="card card-pad stack" key={candidateId} style={{ gap: 10 }}>
            <div className="row">
              <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>{orgName}</h3>
              <span className="badge num">
                {theirs.length} report{theirs.length === 1 ? '' : 's'}
              </span>
            </div>
            {theirs.map((m) => (
              <div className="rowcard card-pad stack" key={m.id} style={{ gap: 8 }}>
                <button className="row oto-report-head" onClick={() => onOpen(m.id)}>
                  <strong style={{ fontSize: 13 }}>{m.personName}</strong>
                  <span className="faint" style={{ fontSize: 12 }}>· {when(m)}</span>
                  <div className="spacer" />
                  <Icon name="chevronRight" size={13} />
                </button>
                <div className="oto-answers-grid">
                  {fields
                    .filter((f) => asText(m.report[f.id]))
                    .map((f) => (
                      <div key={f.id}>
                        <div className="eyebrow">{f.label}</div>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{asText(m.report[f.id])}</div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
