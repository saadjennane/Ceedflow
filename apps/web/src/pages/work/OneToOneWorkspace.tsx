/**
 * Les One to One d'une brique : les planifier, les suivre, lire ce qui s'en écrit.
 *
 * Two views. The planning: who meets whom and when, what is waiting on an
 * answer, which startups have not met anybody yet. The reports: every
 * answer of every report, summed up question by question the way a form's
 * responses page does — then the responses themselves, and the export.
 */
import {
  FREQUENCIES,
  FREQUENCY_LABEL,
  MAX_SESSIONS,
  MEETING_STATUS_LABEL,
  type Availability,
  formPages,
  meetingState,
  summarise,
  type Block,
  type Candidate,
  type FormField,
  type OneToOneConfig,
  type OneToOneMeeting,
  type PersonRef,
  type QuestionSummary,
} from '@ceed/shared';
import { useMemo, useState } from 'react';
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
  availability: Availability[];
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

export function OneToOneWorkspace({ block, onOpenSetup }: { block: Block; onOpenSetup: (id: string) => void }) {
  const view = useAsync(() => api.get<View>(`/api/blocks/${block.id}/one-to-one`), `oto:${block.id}`);
  const [side, setSide] = useState<'planning' | 'availability' | 'reports'>('planning');
  const [planning, setPlanning] = useState<string[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;
  const data = view.data;
  const opened = data.meetings.find((m) => m.id === openId) ?? null;

  if (!data.config.interlocutors.length || !data.config.report.fields.length) {
    return (
      <div className="empty" style={{ padding: 26 }}>
        <h3>{data.config.interlocutors.length ? 'The report has no question yet' : 'Nobody to meet yet'}</h3>
        <p>
          {data.config.interlocutors.length
            ? 'Write what an interlocutor fills in after each meeting, then plan the meetings here.'
            : 'Name the mentors and experts the startups will meet, and write the report they fill in.'}
        </p>
        <button className="btn primary" onClick={() => onOpenSetup(block.id)}>
          <Icon name="settings" size={14} /> Set it up
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <div className="seg" role="group" aria-label="View">
          <button className={side === 'planning' ? 'on' : ''} onClick={() => setSide('planning')}>
            <Icon name="calendar" size={13} /> Planning
          </button>
          <button className={side === 'availability' ? 'on' : ''} onClick={() => setSide('availability')}>
            <Icon name="clock" size={13} /> Availability
          </button>
          <button className={side === 'reports' ? 'on' : ''} onClick={() => setSide('reports')}>
            <Icon name="form" size={13} /> Reports
          </button>
        </div>
        <div className="spacer" />
        {side === 'planning' && (
          <button className="btn primary sm" onClick={() => setPlanning([])}>
            <Icon name="plus" size={13} /> Plan a meeting
          </button>
        )}
      </div>

      {side === 'planning' ? (
        <Planning data={data} onOpen={setOpenId} onPlan={setPlanning} />
      ) : side === 'availability' ? (
        <AvailabilityView data={data} onChanged={view.reload} />
      ) : (
        <Reports data={data} onOpen={setOpenId} />
      )}

      {planning && (
        <PlanModal
          data={data}
          preselected={planning}
          onClose={() => setPlanning(null)}
          onDone={() => {
            setPlanning(null);
            view.reload();
          }}
        />
      )}

      {opened && (
        <MeetingDrawer
          key={opened.id}
          meeting={opened}
          data={data}
          onClose={() => setOpenId(null)}
          onChanged={view.reload}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

function Planning({
  data,
  onOpen,
  onPlan,
}: {
  data: View;
  onOpen: (id: string) => void;
  onPlan: (candidateIds: string[]) => void;
}) {
  const [person, setPerson] = useState('');
  const [showPast, setShowPast] = useState(false);
  const today = todayIso();
  const shown = data.meetings.filter(
    (m) => (!person || m.personId === person) && (showPast || !m.heldOn || m.heldOn >= today || meetingState(m) === 'to_report'),
  );
  /* Par jour, et ce qui n'a pas encore d'heure en tête : c'est ce qui attend quelqu'un. */
  const days = [...new Set(shown.map((m) => m.heldOn ?? ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  const met = new Set(data.meetings.filter((m) => m.status !== 'cancelled').map((m) => m.candidateId));
  const waiting = data.pool.filter((p) => !met.has(p.candidate.id));

  return (
    <div className="oto-layout">
      <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <select className="status-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Interlocutor">
            <option value="">Every interlocutor</option>
            {data.interlocutors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            <span>Show past meetings</span>
          </label>
        </div>

        {!shown.length && (
          <div className="empty" style={{ padding: 22 }}>
            <p style={{ margin: 0 }}>No meeting {showPast ? '' : 'coming up '}yet. Plan one from the list of startups.</p>
          </div>
        )}

        {days.map((day) => (
          <section className="card" key={day || 'none'}>
            <div className="rowcard-head" style={{ padding: '10px 14px' }}>
              <strong style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 13.5 }}>
                {day ? formatDate(day) : 'Waiting for a time'}
              </strong>
              <span className="badge num">{shown.filter((m) => (m.heldOn ?? '') === day).length}</span>
            </div>
            <div className="rows" style={{ padding: 10 }}>
              {shown
                .filter((m) => (m.heldOn ?? '') === day)
                .map((m) => {
                  const state = STATE_BADGE[meetingState(m)];
                  return (
                    <button
                      key={m.id}
                      className="rowcard row"
                      style={{ gap: 10, padding: '9px 12px', width: '100%', textAlign: 'left' }}
                      onClick={() => onOpen(m.id)}
                    >
                      <span className="num faint" style={{ width: 44, fontSize: 12.5 }}>{m.startTime ?? '—'}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: 13 }}>{m.orgName}</strong>
                        <span className="faint" style={{ fontSize: 12 }}> · {m.personName}</span>
                      </span>
                      <span className={state.tone}>{state.label}</span>
                      <Icon name="chevronRight" size={13} />
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>

      {/* Ceux qui n'ont encore vu personne : c'est la liste qu'on vient
          vider en planifiant. */}
      <aside className="card card-pad stack" style={{ gap: 8, alignSelf: 'start' }}>
        <div className="row">
          <strong style={{ flex: 1, fontSize: 13 }}>No meeting yet</strong>
          <span className="badge num">{waiting.length}</span>
        </div>
        {!waiting.length && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Every startup has a meeting.</p>}
        {waiting.map(({ candidate }) => (
          <div className="row" key={candidate.id} style={{ gap: 6 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{candidate.orgName}</span>
            <button className="btn ghost sm" onClick={() => onPlan([candidate.id])} aria-label={`Plan for ${candidate.orgName}`}>
              <Icon name="plus" size={12} />
            </button>
          </div>
        ))}
      </aside>
    </div>
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
  const [invite, setInvite] = useState<'confirm' | 'none' | 'slots'>(data.config.invite);
  const [heldOn, setHeldOn] = useState('');
  const [startTime, setStartTime] = useState('');
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('weekly');
  const [count, setCount] = useState(6);
  const [tell, setTell] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const books = invite === 'slots';
  /* Laisser réserver : autant de startups qu'on veut, chacune prendra son
     créneau. Une heure donnée : une startup, et une série possible. */
  const ready = picked.length > 0 && personId && (books || (heldOn && startTime && picked.length === 1));
  const freeFor = data.availability.filter((a) => a.personId === personId && a.onDate >= todayIso()).length;

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
      title="Plan a meeting"
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
      <div className="field">
        <label>How it is set</label>
        <div className="pick-list">
          {(['confirm', 'none', 'slots'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={invite === mode ? 'pick on' : 'pick'}
              onClick={() => {
                setInvite(mode);
                if (mode !== 'slots') setPicked((p) => p.slice(0, 1));
              }}
            >
              <Icon name={invite === mode ? 'check' : 'square'} />
              <div>
                <strong>{INVITE_WORDS[mode].title}</strong>
                <span>{INVITE_WORDS[mode].line}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

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
        {books && (
          <div className="hint" style={freeFor ? undefined : { color: 'var(--warn)' }}>
            {freeFor
              ? `${freeFor} stretch${freeFor === 1 ? '' : 'es'} of availability coming up — the startups pick from these.`
              : 'No availability published yet — add some in the Availability view, or they will find nothing to book.'}
          </div>
        )}
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
  const [personId, setPersonId] = useState(meeting.personId);
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

  const moved = heldOn !== (meeting.heldOn ?? '') || startTime !== (meeting.startTime ?? '') || personId !== meeting.personId;

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
        subtitle={`${meeting.personName} · ${when(meeting)}`}
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
              {meeting.heldOn ? 'The startup booked this time.' : 'Waiting for the startup to book a time. Their link:'}
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
              {data.interlocutors.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {moved && (
            <button
              className="btn primary sm"
              disabled={busy}
              onClick={() =>
                change(
                  { heldOn: heldOn || null, startTime: startTime || null, personId },
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
          <button className="btn ghost sm" disabled={busy} onClick={() => tell({ person: true })}>
            <Icon name="send" size={12} /> Write to {meeting.personName}
          </button>
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
  const [tab, setTab] = useState<'summary' | 'responses'>('summary');
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
          <button className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>Summary</button>
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

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

/**
 * Les plages que chaque interlocuteur offre, et dans lesquelles les startups
 * réservent. L'interlocuteur les publie depuis son espace ; CEED peut les
 * saisir pour lui — un mentor qui envoie ses dispos par message.
 */
function AvailabilityView({ data, onChanged }: { data: View; onChanged: () => void }) {
  const [personId, setPersonId] = useState(data.interlocutors[0]?.id ?? '');
  const [onDate, setOnDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [slotMinutes, setSlotMinutes] = useState(data.config.durationMinutes);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const today = todayIso();
  const theirs = data.availability.filter((a) => a.personId === personId && a.onDate >= today);
  const booked = (a: Availability) =>
    data.meetings.filter(
      (m) => m.personId === a.personId && m.heldOn === a.onDate && m.startTime && m.startTime >= a.startTime && m.startTime < a.endTime && m.status !== 'cancelled',
    ).length;

  const add = async () => {
    setBusy(true);
    try {
      await api.post(`/api/blocks/${data.block.id}/availability`, { personId, onDate, startTime, endTime, slotMinutes });
      toast('Availability added.');
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <select className="status-select" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Interlocutor">
          {data.interlocutors.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="faint" style={{ fontSize: 12.5 }}>
          They can publish these themselves from their space, under Meetings.
        </span>
      </div>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <strong style={{ fontSize: 13.5 }}>Add a stretch</strong>
        <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Day</label>
            <input className="input" type="date" min={today} value={onDate} onChange={(e) => setOnDate(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>From</label>
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>To</label>
            <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0, width: 120 }}>
            <label>Slots of (min)</label>
            <input className="input num" type="number" min={5} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value) || 45)} />
          </div>
          <button className="btn primary sm" disabled={busy || !personId || !onDate || endTime <= startTime} onClick={add}>
            <Icon name="plus" size={13} /> Add
          </button>
        </div>
      </section>

      {!theirs.length ? (
        <div className="empty" style={{ padding: 20 }}>
          <p style={{ margin: 0 }}>No availability coming up for this interlocutor.</p>
        </div>
      ) : (
        <div className="rows">
          {theirs.map((a) => (
            <div className="rowcard row" key={a.id} style={{ gap: 10, padding: '9px 12px' }}>
              <Icon name="clock" size={14} />
              <span style={{ flex: 1, fontSize: 13 }}>
                <strong>{formatDate(a.onDate)}</strong> · {a.startTime}–{a.endTime}
                <span className="faint"> · slots of {a.slotMinutes} min</span>
              </span>
              <span className="badge num">{booked(a)} booked</span>
              <button
                className="btn ghost icon sm"
                aria-label="Remove"
                onClick={async () => {
                  await api.del(`/api/availability/${a.id}`);
                  onChanged();
                }}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
