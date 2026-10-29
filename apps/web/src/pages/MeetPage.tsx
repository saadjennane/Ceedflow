/**
 * Un rendez-vous proposé, du côté de la startup : le lire, et y répondre.
 *
 * The committee's booking page, for one meeting: when, with whom, where — and
 * yes or no. Nothing else is written through this link, and the report of the
 * meeting never shows here.
 */
import { WEEKDAY_LABEL, type FormField, type FormPage } from '@ceed/shared';
import { PrepForm } from '../ui/PrepForm';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';

interface Invitation {
  programName: string;
  editionName: string;
  colour: string;
  orgName: string;
  personName: string;
  heldOn: string | null;
  startTime: string | null;
  durationMinutes: number;
  location: string;
  invite: 'slots' | 'confirm' | 'none';
  rsvpState: 'pending' | 'confirmed' | 'declined';
  meetingLink?: string;
  answerBy?: string | null;
  late?: boolean;
  cadence?: 'single' | 'recurring';
  prep?: {
    pages: { page: FormPage; fields: FormField[] }[];
    answers: Record<string, unknown>;
    locked: boolean;
    submittedAt: string | null;
    editedByName: string;
  } | null;
  /** A regular follow-up: the weekly slots it may take for the whole series. */
  weekly?: { personId: string; personName: string; weekday: number; startTime: string; endTime: string; firstOn: string; sessions: number }[];
  /** Ce qu'elle a dit en refusant. */
  rsvpNote?: string;
  status: 'planned' | 'held' | 'cancelled' | 'no_show';
  open: boolean;
  slots: { dayId: string; onDate: string; startTime: string; endTime: string; personId: string; personName: string }[];
}

export function MeetPage() {
  const { token = '' } = useParams();
  const page = useAsync(() => api.get<Invitation>(`/api/public/meet/${token}`), token);
  const [answered, setAnswered] = useState<Invitation | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /* Refuser ouvre un mot facultatif — pourquoi, et quand on pourrait. */
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');

  if (page.loading) {
    return (
      <div className="public">
        <div className="public-card">
          <div className="public-body">Loading…</div>
        </div>
      </div>
    );
  }

  if (page.error || !page.data) {
    return (
      <div className="public">
        <div className="public-card">
          <div className="public-body">
            <h1>This invitation is not available</h1>
            <p className="public-intro">{page.error ?? 'The link may be wrong, or the meeting may have moved on.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const data = answered ?? page.data;
  /* Un créneau de la semaine, pour tout le suivi. */
  const bookWeekly = async () => {
    if (!picked) return;
    const [weekday, startTime, personId] = picked.split('|');
    setSending(true);
    setError(null);
    try {
      setAnswered(await api.post<Invitation>(`/api/public/meet/${token}`, { weekday: Number(weekday), startTime, personId }));
      setPicked(null);
    } catch (err) {
      setError((err as Error).message);
      page.reload();
    } finally {
      setSending(false);
    }
  };
  const book = async () => {
    if (!picked) return;
    const [dayId, startTime, personId] = picked.split('|');
    setSending(true);
    setError(null);
    try {
      setAnswered(await api.post<Invitation>(`/api/public/meet/${token}`, { dayId, startTime, personId }));
      setPicked(null);
    } catch (err) {
      setError((err as Error).message);
      page.reload();
    } finally {
      setSending(false);
    }
  };
  /* Les créneaux par jour : on choisit un jour avant une heure — et, quand
     plusieurs personnes reçoivent, chez qui. */
  const days = [...new Set(data.slots.map((x) => x.onDate))];
  const several = new Set(data.slots.map((x) => x.personId)).size > 1;

  const answer = async (accept: boolean) => {
    setSending(true);
    setError(null);
    try {
      setAnswered(await api.post<Invitation>(`/api/public/meet/${token}`, { accept, note: accept ? '' : note }));
      setDeclining(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={{ background: data.colour }} />
        <div className="public-body stack" style={{ gap: 14 }}>
          <div className="eyebrow">
            {data.programName} · {data.editionName}
          </div>
          <h1>{data.personName ? `A meeting with ${data.personName}` : 'Book your meeting'}</h1>
          <p className="public-intro">For {data.orgName}.</p>

          {data.status === 'cancelled' ? (
            <div className="callout warn">
              <Icon name="alert" size={15} /> This meeting was cancelled. The team will be in touch.
            </div>
          ) : (
            <div className="rowcard card-pad stack" style={{ gap: 4 }}>
              <strong style={{ fontSize: 15 }}>
                {data.heldOn ? formatDate(data.heldOn) : 'Date to be set'}
                {data.startTime ? ` · ${data.startTime}` : ''}
              </strong>
              <span className="faint" style={{ fontSize: 13 }}>
                {data.durationMinutes} minutes{data.location ? ` · ${data.location}` : ''}
              </span>
              {data.meetingLink && (
                <a href={data.meetingLink} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  Join the video call
                </a>
              )}
            </div>
          )}

          {/* La préparation : ce que la startup écrit avant la séance — et qu'elle
              relit, corrigée par son interlocuteur, une fois verrouillée. */}
          {data.prep && (
            <section className="rowcard card-pad stack" style={{ gap: 10 }}>
              <div className="row wrap" style={{ gap: 6 }}>
                <strong style={{ flex: 1, fontSize: 14 }}>Prepare the session</strong>
                {data.prep.locked ? (
                  <span className="badge">Locked</span>
                ) : data.prep.submittedAt ? (
                  <span className="badge ok">Sent</span>
                ) : (
                  <span className="badge warn">To prepare</span>
                )}
              </div>
              <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
                {data.prep.locked
                  ? 'Your preparation is locked: you can read it, no longer change it.'
                  : 'Your interlocutor reads it before the session. You can change it until it is locked.'}
                {data.prep.editedByName && ` Updated by ${data.prep.editedByName}.`}
              </p>
              <PrepForm
                key={`${data.prep.submittedAt}-${data.prep.locked}`}
                pages={data.prep.pages}
                answers={data.prep.answers}
                readOnly={data.prep.locked}
                saveLabel="Save draft"
                sendLabel={data.prep.submittedAt ? 'Update' : 'Send to my interlocutor'}
                savedSay="Saved."
                onSave={async (answers, send) => {
                  setAnswered(await api.put<Invitation>(`/api/public/meet/${token}/prep`, { answers, submit: send }));
                }}
              />
            </section>
          )}

          {data.late ? (
            <div className="callout warn">
              <Icon name="clock" size={15} /> The deadline to answer has passed. Get in touch with the team.
            </div>
          ) : (
            data.answerBy &&
            data.open && (
              <span className="badge warn" style={{ alignSelf: 'flex-start' }}>
                <Icon name="clock" size={13} /> Answer by {formatDate(data.answerBy)}
              </span>
            )
          )}

          {error && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> {error}
            </div>
          )}

          {data.rsvpState === 'confirmed' && data.status !== 'cancelled' && (
            <div className="callout ok">
              <Icon name="check" size={15} /> You confirmed. See you then.
            </div>
          )}
          {data.rsvpState === 'declined' && (
            <div className="callout">
              <Icon name="x" size={15} />
              <div>
                You declined this time. The team will propose another.
                {data.rsvpNote && <div style={{ marginTop: 4, fontStyle: 'italic' }}>“{data.rsvpNote}”</div>}
              </div>
            </div>
          )}

          {/* Un suivi régulier : on choisit un jour et une heure de la semaine, pour toutes les séances. */}
          {data.open && data.invite === 'slots' && data.cadence === 'recurring' && !data.heldOn && (
            <div className="stack" style={{ gap: 10 }}>
              <strong style={{ fontSize: 14 }}>Pick your weekly time — for the whole follow-up</strong>
              {!(data.weekly ?? []).length && (
                <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                  No weekly time is free at the moment. The team will open more — come back to this link.
                </p>
              )}
              {[...new Set((data.weekly ?? []).map((c) => c.weekday))].map((weekday) => {
                const cells = (data.weekly ?? []).filter((c) => c.weekday === weekday);
                return (
                  <div key={weekday} className="stack" style={{ gap: 6 }}>
                    <div className="eyebrow">
                      Every {WEEKDAY_LABEL[weekday]} · from {formatDate(cells[0]!.firstOn)} · {cells[0]!.sessions} sessions
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {cells.map((c) => {
                        const key = `${c.weekday}|${c.startTime}|${c.personId}`;
                        return (
                          <button key={key} type="button" className={picked === key ? 'track on' : 'track'} aria-pressed={picked === key} onClick={() => setPicked(key)}>
                            {c.startTime}
                            {new Set((data.weekly ?? []).map((x) => x.personId)).size > 1 && (
                              <span className="faint" style={{ fontWeight: 400 }}> · {c.personName}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {(data.weekly ?? []).length > 0 && !declining && (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary" disabled={!picked || sending} onClick={bookWeekly}>
                    <Icon name="check" size={14} /> {sending ? 'Booking…' : 'Book this weekly time'}
                  </button>
                  <button className="btn ghost" disabled={sending} onClick={() => setDeclining(true)}>
                    None of these times work
                  </button>
                </div>
              )}
            </div>
          )}

          {data.open && data.invite === 'slots' && data.cadence !== 'recurring' && (
            <div className="stack" style={{ gap: 10 }}>
              <strong style={{ fontSize: 14 }}>{data.heldOn ? 'Pick another time' : 'Pick a time'}</strong>
              {!days.length && (
                <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                  No time is free at the moment. The team will open more — come back to this link.
                </p>
              )}
              {days.map((day) => (
                <div key={day} className="stack" style={{ gap: 6 }}>
                  <div className="eyebrow">{formatDate(day)}</div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {data.slots
                      .filter((x) => x.onDate === day)
                      .map((x) => {
                        const key = `${x.dayId}|${x.startTime}|${x.personId}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={picked === key ? 'track on' : 'track'}
                            onClick={() => setPicked(key)}
                          >
                            {x.startTime}
                            {several && <span className="faint" style={{ fontWeight: 400 }}> · {x.personName}</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
              {days.length > 0 && !declining && (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary" disabled={!picked || sending} onClick={book}>
                    <Icon name="check" size={14} /> {sending ? 'Booking…' : 'Book this time'}
                  </button>
                  {/* Une sortie : aucune heure ne va, et l'équipe le sait — avec pourquoi. */}
                  {!data.heldOn && (
                    <button className="btn ghost" disabled={sending} onClick={() => setDeclining(true)}>
                      None of these times work
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {data.open && data.invite !== 'none' && declining && (
            <div className="stack" style={{ gap: 8 }}>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>A word for the team (optional)</span>
                <textarea
                  className="textarea"
                  rows={3}
                  maxLength={1000}
                  value={note}
                  placeholder="Why it does not work, and when you could — e.g. “Travelling until the 12th, any morning after.”"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary" disabled={sending} onClick={() => answer(false)}>
                  {sending ? 'Sending…' : 'Send my answer'}
                </button>
                <button className="btn ghost" disabled={sending} onClick={() => setDeclining(false)}>
                  Back
                </button>
              </div>
            </div>
          )}

          {data.open && data.invite === 'confirm' && !declining && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" disabled={sending} onClick={() => answer(true)}>
                <Icon name="check" size={14} /> {data.rsvpState === 'confirmed' ? 'Still confirmed' : 'Confirm'}
              </button>
              <button className="btn" disabled={sending} onClick={() => setDeclining(true)}>
                {data.rsvpState === 'declined' ? 'Still declined' : 'This time does not work'}
              </button>
            </div>
          )}
          {!data.open && data.status === 'planned' && data.invite === 'none' && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>The team set this meeting — there is nothing to answer.</p>
          )}
        </div>
      </div>
    </div>
  );
}
