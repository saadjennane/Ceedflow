import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { applyVariables, buildHtmlBody, buildTextBody, generateTrackingToken, type TemplateContext } from '@/lib/email-templates'
import type { EmailCampaignAudience } from '@/lib/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const FROM_EMAIL = process.env.EMAIL_FROM || 'CEED Morocco <noreply@ceedflow.com>'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'ssl0.ovh.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

/**
 * POST /api/admin/campaigns/test
 * Body: { subject, body, testEmail, audience_type?, includeUnsubscribe? }
 * Sends a single test email using sample values matching the audience type.
 */
export async function POST(request: NextRequest) {
  const supa = await createServerSupabaseClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const subject = String(body.subject || '').trim()
  const bodyText = String(body.body || '').trim()
  const testEmail = String(body.testEmail || user.email || '').trim()
  const audience: EmailCampaignAudience = body.audience_type === 'juror' ? 'juror' : 'application'
  const includeUnsubscribe = !!body.includeUnsubscribe
  if (!subject || !bodyText) return NextResponse.json({ error: 'Subject and body required' }, { status: 400 })
  if (!testEmail) return NextResponse.json({ error: 'Test email required' }, { status: 400 })

  const ctx: TemplateContext = audience === 'application'
    ? { founder_name: 'Aïcha El Idrissi', founder_first_name: 'Aïcha', startup_name: 'Acme Startup' }
    : { juror_name: 'Mehdi Bennani', juror_first_name: 'Mehdi', juror_role: 'Investisseur' }
  const token = generateTrackingToken()
  const trackingPixelUrl = `${APP_URL}/api/track/${token}/pixel.png`
  const unsubscribeUrl = includeUnsubscribe ? `${APP_URL}/unsubscribe/${token}` : undefined

  try {
    await getTransporter().sendMail({
      from: FROM_EMAIL,
      to: testEmail,
      subject: `[TEST] ${applyVariables(subject, ctx)}`,
      html: buildHtmlBody(bodyText, ctx, { trackingPixelUrl, unsubscribeUrl }),
      text: buildTextBody(bodyText, ctx, { unsubscribeUrl }),
    })
    return NextResponse.json({ success: true, sentTo: testEmail })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
