/**
 * Un rendez-vous proposé, du côté de la startup : choisir son heure, ou y répondre.
 *
 * The committee's booking page, for one meeting: when, with whom, where — and
 * yes or no. Nothing else is written through this link: the preparation is
 * filled in the startup's member space, signed in, and the report never shows.
 */
import { WEEKDAY_LABEL } from '@ceed/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';

interface Invitation {
  id: string;
  blockName: string;
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
  /** Où en est la préparation — elle se remplit dans l'espace membre. */
  prepare?: { state: 'todo' | 'sent' | 'locked' } | null;
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
  const weekly = data.cadence === 'recurring';
  const cells = weekly ? (data.weekly ?? []) : [];
  /* Choisir son heure : des créneaux des journées, ou une heure de la semaine
     pour tout le suivi. */
  const picks = data.open && data.invite === 'slots' && (weekly ? !data.heldOn : true);
  const offered = weekly ? cells.length : data.slots.length;
  const several = new Set((weekly ? cells : data.slots).map((x) => x.personId)).size > 1;
  const days = [...new Set(data.slots.map((x) => x.onDate))];
  const weekdays = [...new Set(cells.map((c) => c.weekday))];

  const post = async (body: object) => {
    setSending(true);
    setError(null);
    try {
      setAnswered(await api.post<Invitation>(`/api/public/meet/${token}`, body));
      setPicked(null);
      setDeclining(false);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError((err as Error).message);
      page.reload();
    } finally {
      setSending(false);
    }
  };
  const book = () => {
    if (!picked) return;
    const [a, startTime, personId] = picked.split('|');
    void post(weekly ? { weekday: Number(a), startTime, personId } : { dayId: a, startTime, personId });
  };

  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={{ background: `linear-gradient(90deg, ${data.colour}, ${data.colour}55)` }} />
        <div className="public-body">
          <div className="eyebrow">{data.editionName}</div>
          <h1>{data.blockName || 'One to One'}</h1>
          <p className="public-intro">
            {data.orgName}, you are invited to a one-to-one{data.personName ? ` with ${data.personName}` : ''} for the{' '}
            {data.programName} programme.
          </p>

          <dl className="answers">
            <dt>When</dt>
            <dd>
              {data.heldOn ? (
                <>
                  {formatDate(data.heldOn)}
                  {data.startTime && (
                    <>
                      {' · '}
                      <strong className="num">{data.startTime}</strong>
                    </>
                  )}
                  {weekly && data.heldOn && <span className="faint"> · first session</span>}
                </>
              ) : (
                <span className="faint">{picks ? 'pick your time below' : 'to be set by the team'}</span>
              )}
            </dd>
            {data.personName && (
              <>
                <dt>With</dt>
                <dd>{data.personName}</dd>
              </>
            )}
            {data.location && (
              <>
                <dt>Where</dt>
                <dd>{data.location}</dd>
              </>
            )}
            <dt>How long</dt>
            <dd>
              <span className="num">{data.durationMinutes}</span> minutes
            </dd>
            {data.meetingLink && (
              <>
                <dt>Video</dt>
                <dd>
                  <a href={data.meetingLink} target="_blank" rel="noreferrer">Join the video call</a>
                </dd>
              </>
            )}
          </dl>

          {data.status === 'cancelled' && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> This meeting was cancelled. The team will be in touch.
            </div>
          )}
          {data.status !== 'cancelled' && data.rsvpState === 'confirmed' && data.heldOn && (
            <div className="callout ok">
              <Icon name="check" size={15} />
              <div>
                <strong>You are confirmed.</strong>
                {data.startTime ? ` See you at ${data.startTime}.` : ' See you then.'}
                {picks && !weekly && ' Changing your mind? Pick another time below.'}
              </div>
            </div>
          )}
          {data.rsvpState === 'declined' && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>
                <strong>You have declined.</strong> The team will propose another time.
                {data.rsvpNote && <div style={{ marginTop: 4, fontStyle: 'italic' }}>“{data.rsvpNote}”</div>}
              </div>
            </div>
          )}

          {/* La préparation ne se remplit pas ici : dans l'espace de la startup. */}
          {data.prepare && data.heldOn && data.status === 'planned' && data.rsvpState !== 'declined' && (
            <div className="callout">
              <Icon name="edit" size={15} />
              <div className="stack" style={{ gap: 6 }}>
                <span>
                  {data.prepare.state === 'todo'
                    ? 'Your interlocutor asks you to prepare the session — the questions are in your CeedFlow space.'
                    : data.prepare.state === 'sent'
                      ? 'Your preparation is sent. You can still change it in your CeedFlow space until it is locked.'
                      : 'Your preparation is locked — you can read it in your CeedFlow space.'}
                </span>
                <Link className="btn sm" style={{ alignSelf: 'flex-start' }} to={`/prepare/${data.id}`}>
                  {data.prepare.state === 'todo' ? 'Prepare the session' : 'Open my preparation'}
                </Link>
              </div>
            </div>
          )}

          {data.late ? (
            <div className="callout warn">
              <Icon name="clock" size={15} /> The deadline to answer has passed. Get in touch with the team.
            </div>
          ) : (
            data.answerBy &&
            data.open &&
            data.rsvpState === 'pending' && (
              <span className="badge warn">
                <Icon name="clock" size={13} /> Answer by {formatDate(data.answerBy)}
              </span>
            )
          )}

          {data.open && data.invite === 'confirm' && data.rsvpState !== 'confirmed' && (
            <div className="callout">
              <Icon name="clock" size={15} />
              <div>
                The team has put you at <strong className="num">{data.startTime}</strong>. Confirm that it works, or tell
                us if it does not and we will find another time.
              </div>
            </div>
          )}

          {picks && (
            <>
              <div className="public-sep" />
              <h3 className="section-title">
                {weekly ? 'Pick your weekly time — for the whole follow-up' : data.heldOn ? 'Pick another time' : 'Pick your time'}
              </h3>
              {!offered && (
                <p className="faint" style={{ margin: 0 }}>
                  No time is free at the moment. The team will open more — come back to this link.
                </p>
              )}
              {!weekly &&
                days.map((day) => (
                  <div key={day} className="stack" style={{ gap: 6 }}>
                    {days.length > 1 && <div className="eyebrow">{formatDate(day)}</div>}
                    <div className="slot-grid">
                      {data.slots
                        .filter((x) => x.onDate === day)
                        .map((x) => {
                          const key = `${x.dayId}|${x.startTime}|${x.personId}`;
                          return (
                            <button key={key} type="button" className={`slot${picked === key ? ' on' : ''}`} onClick={() => setPicked(key)}>
                              <span className="num">{x.startTime}</span>
                              <span className="faint">{several ? x.personName : x.endTime}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              {weekly &&
                weekdays.map((weekday) => {
                  const row = cells.filter((c) => c.weekday === weekday);
                  return (
                    <div key={weekday} className="stack" style={{ gap: 6 }}>
                      <div className="eyebrow">
                        Every {WEEKDAY_LABEL[weekday]} · from {formatDate(row[0]!.firstOn)} · {row[0]!.sessions} sessions
                      </div>
                      <div className="slot-grid">
                        {row.map((c) => {
                          const key = `${c.weekday}|${c.startTime}|${c.personId}`;
                          return (
                            <button key={key} type="button" className={`slot${picked === key ? ' on' : ''}`} onClick={() => setPicked(key)}>
                              <span className="num">{c.startTime}</span>
                              <span className="faint">{several ? c.personName : c.endTime}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </>
          )}

          {error && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              {error}
            </div>
          )}

          {data.open && data.invite !== 'none' && (picks || data.invite === 'confirm') &&
            (declining ? (
              <div className="stack" style={{ gap: 8, marginTop: 6 }}>
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>A word for the team (optional)</span>
                  <textarea
                    className="textarea"
                    rows={3}
                    maxLength={1000}
                    value={note}
                    placeholder="Why it does not work, and when you could — e.g. “Away that week, free the next one.”"
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <div className="row">
                  <button className="btn primary" disabled={sending} onClick={() => post({ accept: false, note })}>
                    {sending ? 'Sending…' : 'Send my answer'}
                  </button>
                  <button className="btn ghost" disabled={sending} onClick={() => setDeclining(false)}>
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 6 }}>
                {picks ? (
                  <button className="btn primary" disabled={sending || !picked} onClick={book}>
                    {sending ? 'Sending…' : weekly ? 'Book this weekly time' : 'Confirm this time'}
                  </button>
                ) : (
                  <button className="btn primary" disabled={sending} onClick={() => post({ accept: true, note: '' })}>
                    {sending ? 'Sending…' : data.rsvpState === 'confirmed' ? 'Still confirmed' : 'Confirm I can attend'}
                  </button>
                )}
                {(!picks || !data.heldOn) && (
                  <button className="btn" disabled={sending} onClick={() => setDeclining(true)}>
                    {picks ? 'None of these times work' : 'I cannot make it'}
                  </button>
                )}
              </div>
            ))}

          {!data.open && data.status === 'planned' && data.invite === 'none' && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>The team set this meeting — there is nothing to answer.</p>
          )}
        </div>
      </div>
    </div>
  );
}
