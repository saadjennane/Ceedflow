/**
 * Un rendez-vous, mis dans l'agenda de qui le reçoit.
 *
 * Three ways in, because nobody uses the same calendar: a Google link, an
 * Outlook link, and the .ics file every other one opens (Apple, Outlook
 * desktop, Thunderbird). The same event behind all three, written once here
 * so the letter and the booking page never disagree on the hour.
 */

/** Les heures saisies dans la plateforme sont celles du Maroc. */
export const CALENDAR_TZ = 'Africa/Casablanca';

export interface CalendarEvent {
  /** Stable across re-bookings: the calendar replaces the event rather than adding one. */
  uid: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM, local time. Absent: an all-day event. */
  start?: string | null;
  minutes?: number;
  location?: string;
  description?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Combien de minutes la zone a d'avance sur UTC, à cet instant. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** L'instant UTC d'une heure de Casablanca — Ramadan compris, où le Maroc repasse à UTC+0. */
export function localToUtc(date: string, time: string, timeZone = CALENDAR_TZ): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  /* Deux passes : l'écart lu à l'heure approchée, puis relu à l'heure trouvée. */
  let at = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  at = naive - offsetMinutes(new Date(at), timeZone) * 60_000;
  return new Date(at);
}

const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const dayStamp = (date: string) => date.replaceAll('-', '');
const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Le début et la fin — en UTC, ou le jour entier quand il n'y a pas d'heure. */
function span(e: CalendarEvent): { start: Date; end: Date } | null {
  if (!e.start) return null;
  const start = localToUtc(e.date, e.start);
  return { start, end: new Date(start.getTime() + Math.max(5, e.minutes ?? 60) * 60_000) };
}

/** RFC 5545 : virgules, points-virgules et retours échappés, lignes repliées à 75 octets. */
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

/** Le fichier .ics. `sequence` grandit à chaque nouvelle heure, pour que l'agenda remplace l'ancienne. */
export function icsOf(e: CalendarEvent, sequence = 0, now = new Date()): string {
  const s = span(e);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CEED//CeedFlow//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${stamp(now)}`,
    ...(s
      ? [`DTSTART:${stamp(s.start)}`, `DTEND:${stamp(s.end)}`]
      : [`DTSTART;VALUE=DATE:${dayStamp(e.date)}`, `DTEND;VALUE=DATE:${dayStamp(nextDay(e.date))}`]),
    `SUMMARY:${escape(e.title)}`,
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Ajouter à Google Agenda, en un clic. */
export function googleCalendarUrl(e: CalendarEvent): string {
  const s = span(e);
  const dates = s ? `${stamp(s.start)}/${stamp(s.end)}` : `${dayStamp(e.date)}/${dayStamp(nextDay(e.date))}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates });
  if (e.location) q.set('location', e.location);
  if (e.description) q.set('details', e.description);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Ajouter à Outlook (web, Microsoft 365 comme compte personnel). */
export function outlookCalendarUrl(e: CalendarEvent): string {
  const s = span(e);
  const q = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: e.title });
  if (s) {
    q.set('startdt', s.start.toISOString());
    q.set('enddt', s.end.toISOString());
  } else {
    q.set('startdt', e.date);
    q.set('enddt', nextDay(e.date));
    q.set('allday', 'true');
  }
  if (e.location) q.set('location', e.location);
  if (e.description) q.set('body', e.description);
  return `https://outlook.office.com/calendar/deeplink/compose?${q.toString()}`;
}

/** Ce que {{calendrier}} écrit dans une lettre : les deux liens, le fichier joint dit en une phrase. */
export function calendarSentence(e: CalendarEvent): string {
  return [
    'Ajoutez ce rendez-vous à votre agenda :',
    `Google Agenda : ${googleCalendarUrl(e)}`,
    `Outlook : ${outlookCalendarUrl(e)}`,
    'Ou ouvrez le fichier invitation.ics joint (Apple Calendar, Outlook…).',
  ].join('\n');
}
