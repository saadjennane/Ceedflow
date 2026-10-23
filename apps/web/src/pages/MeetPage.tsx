/**
 * Un rendez-vous proposé, du côté de la startup : le lire, et y répondre.
 *
 * The committee's booking page, for one meeting: when, with whom, where — and
 * yes or no. Nothing else is written through this link, and the report of the
 * meeting never shows here.
 */
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
  status: 'planned' | 'held' | 'cancelled' | 'no_show';
  open: boolean;
  slots: { onDate: string; startTime: string; endTime: string }[];
}

export function MeetPage() {
  const { token = '' } = useParams();
  const page = useAsync(() => api.get<Invitation>(`/api/public/meet/${token}`), token);
  const [answered, setAnswered] = useState<Invitation | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

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
  const book = async () => {
    if (!picked) return;
    const [onDate, startTime] = picked.split(' ');
    setSending(true);
    setError(null);
    try {
      setAnswered(await api.post<Invitation>(`/api/public/meet/${token}`, { onDate, startTime }));
      setPicked(null);
    } catch (err) {
      setError((err as Error).message);
      page.reload();
    } finally {
      setSending(false);
    }
  };
  /* Les créneaux par jour : on choisit un jour avant une heure. */
  const days = [...new Set(data.slots.map((x) => x.onDate))];

  const answer = async (accept: boolean) => {
    setSending(true);
    setError(null);
    try {
      setAnswered(await api.post<Invitation>(`/api/public/meet/${token}`, { accept }));
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
          <h1>A meeting with {data.personName}</h1>
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
            </div>
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
              <Icon name="x" size={15} /> You declined this time. The team will propose another.
            </div>
          )}

          {data.open && data.invite === 'slots' && (
            <div className="stack" style={{ gap: 10 }}>
              <strong style={{ fontSize: 14 }}>{data.heldOn ? 'Pick another time' : 'Pick a time'}</strong>
              {!days.length && (
                <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                  No time is free yet. {data.personName} will publish their availability — come back to this link.
                </p>
              )}
              {days.map((day) => (
                <div key={day} className="stack" style={{ gap: 6 }}>
                  <div className="eyebrow">{formatDate(day)}</div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {data.slots
                      .filter((x) => x.onDate === day)
                      .map((x) => {
                        const key = `${x.onDate} ${x.startTime}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={picked === key ? 'track on' : 'track'}
                            onClick={() => setPicked(key)}
                          >
                            {x.startTime}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
              {days.length > 0 && (
                <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!picked || sending} onClick={book}>
                  <Icon name="check" size={14} /> {sending ? 'Booking…' : 'Book this time'}
                </button>
              )}
            </div>
          )}

          {data.open && data.invite === 'confirm' && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" disabled={sending} onClick={() => answer(true)}>
                <Icon name="check" size={14} /> {data.rsvpState === 'confirmed' ? 'Still confirmed' : 'Confirm'}
              </button>
              <button className="btn" disabled={sending} onClick={() => answer(false)}>
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
