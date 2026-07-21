/**
 * Global feature flags. Flip these when program state changes.
 * Keep them synchronous constants so they can be imported from both
 * server components / API routes and client components.
 */

/** Are new startup applications currently accepted? */
export const APPLICATIONS_OPEN = false

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
