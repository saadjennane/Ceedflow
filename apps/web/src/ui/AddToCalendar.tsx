import { googleCalendarUrl, icsOf, outlookCalendarUrl, type CalendarEvent } from '@ceed/shared';
import { Icon } from './Icon';

/** Le rendez-vous confirmé, à mettre dans son agenda : Google, Outlook, ou le fichier pour tous les autres. */
export function AddToCalendar({ event }: { event: CalendarEvent }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([icsOf(event)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invitation.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span className="faint" style={{ fontSize: 13 }}>
        <Icon name="calendar" size={13} /> Add to calendar
      </span>
      <a className="btn sm" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
        Google
      </a>
      <a className="btn sm" href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer">
        Outlook
      </a>
      <button type="button" className="btn sm" onClick={download}>
        Apple / other (.ics)
      </button>
    </div>
  );
}
