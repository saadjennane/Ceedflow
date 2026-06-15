import nodemailer from 'nodemailer'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  buildTransactionalHtml,
  buildTransactionalText,
  applyVariables,
  type TemplateContext,
} from '@/lib/email-templates'
import type { EmailLanguage, EmailTemplate, EmailTemplateTrigger } from '@/lib/types'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'ssl0.ovh.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'CEED Morocco <noreply@ceedflow.com>'

export interface SendTemplateArgs {
  key: string
  triggerEvent: EmailTemplateTrigger
  language?: EmailLanguage
  /** Recipient for applicant-facing templates. Ignored when the template is internal. */
  to?: string | null
  recipientName?: string | null
  variables?: TemplateContext
  applicationId?: string | null
  externalStartupId?: string | null
  sentBy?: string | null
  /** Manual sends may override the rendered subject/body after the admin edits them. */
  subjectOverride?: string
  bodyOverride?: string
}

export interface SendTemplateResult {
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
  recipients?: string[]
}

/**
 * Send a transactional email from a managed template.
 *
 * - Loads the template by `key`.
 * - Respects the `enabled` toggle (returns `skipped` when off, and logs it).
 * - Renders the FR or EN variant with {{variables}}.
 * - Internal templates go to all admins; otherwise to `to`.
 * - Every attempt is logged in `email_template_sends`.
 */
export async function sendTemplateEmail(args: SendTemplateArgs): Promise<SendTemplateResult> {
  const supabase = await createServiceRoleClient()
  const language: EmailLanguage = args.language === 'en' ? 'en' : 'fr'
  const ctx: TemplateContext = args.variables || {}

  const { data: template, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('key', args.key)
    .maybeSingle<EmailTemplate>()

  if (error || !template) {
    console.error(`sendTemplateEmail: template "${args.key}" not found`, error)
    return { status: 'failed', reason: 'template_not_found' }
  }

  // Resolve recipients
  let recipients: string[] = []
  if (template.is_internal) {
    const { data: usersData } = await supabase.auth.admin.listUsers()
    recipients = (usersData?.users?.map(u => u.email).filter(Boolean) as string[]) || []
  } else if (args.to) {
    recipients = [args.to]
  }

  const logSend = (status: 'sent' | 'failed' | 'skipped', subject: string, errMsg?: string) =>
    supabase.from('email_template_sends').insert({
      template_id: template.id,
      template_key: template.key,
      trigger_event: args.triggerEvent,
      application_id: args.applicationId || null,
      external_startup_id: args.externalStartupId || null,
      recipient_email: recipients[0] || args.to || '',
      recipient_name: args.recipientName || null,
      language,
      subject,
      status,
      error_message: errMsg || null,
      sent_by: args.sentBy || null,
    })

  const rawSubject = args.subjectOverride ?? (language === 'en' ? template.subject_en : template.subject_fr)
  const rawBody = args.bodyOverride ?? (language === 'en' ? template.body_en : template.body_fr)
  const subject = applyVariables(rawSubject, ctx)

  // Toggle off → skip (and record why)
  if (!template.enabled) {
    await logSend('skipped', subject, 'template_disabled')
    return { status: 'skipped', reason: 'template_disabled' }
  }

  if (recipients.length === 0) {
    await logSend('skipped', subject, 'no_recipient')
    return { status: 'skipped', reason: 'no_recipient' }
  }

  const html = buildTransactionalHtml(rawBody, ctx)
  const text = buildTransactionalText(rawBody, ctx)

  try {
    await getTransporter().sendMail({
      from: FROM_EMAIL,
      to: recipients.join(', '),
      subject,
      html,
      text,
    })
    await logSend('sent', subject)
    return { status: 'sent', recipients }
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 500) || 'unknown'
    console.error(`sendTemplateEmail: failed to send "${args.key}":`, msg)
    await logSend('failed', subject, msg)
    return { status: 'failed', reason: msg, recipients }
  }
}
