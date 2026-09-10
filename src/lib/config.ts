/**
 * Global feature flags. Flip these when program state changes.
 * Keep them synchronous constants so they can be imported from both
 * server components / API routes and client components.
 */

/** Are new startup applications currently accepted? */
export const APPLICATIONS_OPEN = false

/**
 * Bypass token for the closed-applications gate. Anyone visiting
 * /apply?token=<APPLICATION_BYPASS_TOKEN> sees a working form even while
 * APPLICATIONS_OPEN is false. Change this string to instantly invalidate
 * every previously shared link. Not a security boundary — treat it as a
 * shareable secret URL for hand-picked late invitees.
 */
export const APPLICATION_BYPASS_TOKEN = 'late-a7f3k9m2n5x8'

/**
 * Deadline for candidate slot bookings (public /book page).
 * Any GET/POST after this instant is refused. Morocco time (UTC+1, no DST).
 * Currently: Wednesday 16 September 2026, end of day.
 */
export const BOOKING_DEADLINE = '2026-09-16T23:59:59+01:00'
export const BOOKING_DAYS = ['2026-09-28', '2026-09-29'] as const

export const APPLICATIONS_CLOSED_COPY = {
  fr: {
    title: 'Candidatures clôturées',
    body: 'La période de dépôt des candidatures est terminée. Merci de votre intérêt pour The Builders — restez connectés pour la prochaine édition.',
    short: 'Candidatures fermées',
  },
  en: {
    title: 'Applications closed',
    body: 'The application window has closed. Thank you for your interest in The Builders — stay tuned for the next edition.',
    short: 'Applications closed',
  },
} as const
