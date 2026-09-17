import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';

interface BookingPayload {
  programName: string;
  editionName: string;
  colour: string;
  orgName: string;
  blockName: string;
  mode: 'none' | 'confirm' | 'slots';
  deadline: string | null;
  session: { name: string; heldOn: string | null; location: string; minutesPerStartup: number };
  slots: { index: number; startsAt: string; endsAt: string; taken: boolean }[];
  rsvpState: 'pending' | 'confirmed' | 'declined';
  slotIndex: number | null;
}

export function BookingPage() {
  const { token = '' } = useParams();
  const page = useAsync(() => api.get<BookingPayload>(`/api/public/book/${token}`), token);
  const [chosen, setChosen] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ state: string; slotIndex: number | null } | null>(null);

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
            <p className="public-intro">{page.error ?? 'The link may be wrong, or the committee may have moved on.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const data = page.data;
  const state = done?.state ?? data.rsvpState;
  const bookedIndex = done ? done.slotIndex : data.slotIndex;
  const booked = bookedIndex === null ? null : data.slots.find((s) => s.index === bookedIndex);
  const answered = state !== 'pending';

  const respond = async (rsvpState: 'confirmed' | 'declined') => {
    setSending(true);
    setError(null);
    try {
      const result = await api.post<{ rsvpState: string; slotIndex: number | null }>(`/api/public/book/${token}`, {
        rsvpState,
        slotIndex: rsvpState === 'confirmed' && data.mode === 'slots' ? chosen : null,
      });
      setDone({ state: result.rsvpState, slotIndex: result.slotIndex });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
      page.reload();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={{ background: `linear-gradient(90deg, ${data.colour}, ${data.colour}55)` }} />
        <div className="public-body">
          <div className="eyebrow">{data.editionName}</div>
          <h1>{data.blockName}</h1>
          <p className="public-intro">
            {data.orgName}, you are invited to the {data.programName} selection committee.
          </p>

          <dl className="answers">
            <dt>When</dt>
            <dd>
              {formatDate(data.session.heldOn)}
              {booked && (
                <>
                  {' · '}
                  <strong className="num">
                    {booked.startsAt}–{booked.endsAt}
                  </strong>
                </>
              )}
            </dd>
            {data.session.location && (
              <>
                <dt>Where</dt>
                <dd>{data.session.location}</dd>
              </>
            )}
            <dt>How long</dt>
            <dd>
              <span className="num">{data.session.minutesPerStartup}</span> minutes
            </dd>
          </dl>

          {state === 'confirmed' && (
            <div className="callout ok">
              <Icon name="check" size={15} />
              <div>
                <strong>You are confirmed.</strong>
                {booked ? ` See you at ${booked.startsAt}.` : ' The team will confirm your time.'} Changing your mind?
                Pick another time below.
              </div>
            </div>
          )}
          {state === 'declined' && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>
                <strong>You have declined.</strong> If that was a mistake, you can still confirm below.
              </div>
            </div>
          )}

          {data.deadline && !answered && (
            <span className="badge warn">
              <Icon name="clock" size={13} /> Answer by {formatDate(data.deadline)}
            </span>
          )}

          {data.mode === 'slots' && (
            <>
              <div className="public-sep" />
              <h3 className="section-title">Pick your time</h3>
              <div className="slot-grid">
                {data.slots.map((slot) => {
                  const mine = slot.index === bookedIndex;
                  const disabled = slot.taken && !mine;
                  return (
                    <button
                      key={slot.index}
                      type="button"
                      className={`slot${chosen === slot.index || mine ? ' on' : ''}${disabled ? ' off' : ''}`}
                      disabled={disabled}
                      onClick={() => setChosen(slot.index)}
                    >
                      <span className="num">{slot.startsAt}</span>
                      <span className="faint">{disabled ? 'taken' : mine ? 'yours' : `${slot.endsAt}`}</span>
                    </button>
                  );
                })}
              </div>
              {!data.slots.some((s) => !s.taken || s.index === bookedIndex) && (
                <p className="faint" style={{ margin: 0 }}>
                  Every time is taken. Get in touch with the team and they will make room.
                </p>
              )}
            </>
          )}

          {error && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              {error}
            </div>
          )}

          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="btn primary"
              disabled={sending || (data.mode === 'slots' && chosen === null && bookedIndex === null)}
              onClick={() => respond('confirmed')}
            >
              {sending ? 'Sending…' : data.mode === 'slots' ? 'Confirm this time' : 'Confirm'}
            </button>
            <button className="btn" disabled={sending} onClick={() => respond('declined')}>
              I cannot make it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
