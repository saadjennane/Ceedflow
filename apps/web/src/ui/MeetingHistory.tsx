/**
 * Les One to One d'une startup, du plus récent au plus ancien.
 *
 * Read from the meetings themselves, never typed: who she met, in which brick,
 * and whether the report came back. The report is opened from the brick's own
 * tab — this list says where to look.
 */
import { MEETING_STATUS_LABEL, meetingState, type OneToOneMeeting } from '@ceed/shared';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from './Icon';

interface Line extends OneToOneMeeting {
  blockName: string;
}

export function MeetingHistory({ url, empty, heading }: { url: string; empty?: string; heading?: string }) {
  const lines = useAsync(() => api.get<Line[]>(url), url);
  if (!lines.data) return null;
  if (!lines.data.length) {
    return empty ? <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{empty}</p> : null;
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
    {heading && <h3 className="section-title">{heading}</h3>}
    <div className="rows">
      {lines.data.map((m) => {
        const state = meetingState(m);
        return (
          <div className="rowcard row" key={m.id} style={{ gap: 9, padding: '8px 11px' }}>
            <Icon name="users" size={13} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <strong>{m.personName}</strong>
              <span className="faint">
                {' '}
                · {m.blockName} · {m.heldOn ? `${formatDate(m.heldOn)}${m.startTime ? ` ${m.startTime}` : ''}` : 'no time yet'}
              </span>
            </span>
            {state === 'reported' ? (
              <span className="badge ok">Report sent</span>
            ) : (
              <span className="badge">{MEETING_STATUS_LABEL[m.status]}</span>
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}
