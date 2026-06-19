import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { applyVariables, buildHtmlBody, buildTextBody, type TemplateContext } from '@/lib/email-templates'

export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const FROM_EMAIL = process.env.EMAIL_FROM || 'CEED Morocco <noreply@ceedflow.com>'

const DELAY_MS = 1500
const MAX_PER_CALL = 25

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'ssl0.ovh.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

function firstName(full?: string | null) {
  if (!full) return ''
  return full.trim().split(/\s+/)[0] || ''
}

/**
 * POST /api/admin/campaigns/[id]/send
 * Processes up to MAX_PER_CALL queued sends for this campaign.
 * Adapts variables, unsubscribe header, and tracking pixel to the campaign's
 * audience_type, include_unsubscribe, and include_tracking_pixel flags.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supa = await createServerSupabaseClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const service = await createServiceRoleClient()

  const { data: campaign, error: campErr } = await service
    .from('email_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()
  if (campErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  if (campaign.status === 'draft') {
    await service.from('email_campaigns').update({ status: 'sending' }).eq('id', campaignId)
  }

  const { data: queued, error: qErr } = await service
    .from('email_sends')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')
    .limit(MAX_PER_CALL)
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  if (!queued || queued.length === 0) {
    await service.from('email_campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaignId)
    return NextResponse.json({ remaining: 0, sent: 0, failed: 0, done: true })
  }

  // For juror audience, load role per juror_id (the email_sends row only has name + email)
  const audienceType = campaign.audience_type as 'application' | 'juror'
  const includeUnsubscribe = !!campaign.include_unsubscribe
  const includeTrackingPixel = campaign.include_tracking_pixel !== false

  let jurorRoles = new Map<string, string>()
  if (audienceType === 'juror') {
    const jurorIds = queued.map(q => q.juror_id).filter(Boolean) as string[]
    if (jurorIds.length > 0) {
      const { data: jurors } = await service.from('jurors').select('id, role').in('id', jurorIds)
      jurorRoles = new Map((jurors || []).map((j: { id: string; role: string | null }) => [j.id, j.role || '']))
    }
  }

  const transporter = getTransporter()
  let sent = 0
  let failed = 0

  for (const item of queued) {
    const ctx: TemplateContext = audienceType === 'application'
      ? {
          founder_name: item.recipient_name || '',
          founder_first_name: firstName(item.recipient_name),
          startup_name: item.startup_name || '',
        }
      : {
          juror_name: item.recipient_name || '',
          juror_first_name: firstName(item.recipient_name),
          juror_role: item.juror_id ? jurorRoles.get(item.juror_id) || '' : '',
        }

    const trackingPixelUrl = includeTrackingPixel ? `${APP_URL}/api/track/${item.tracking_token}/pixel.png` : undefined
    const unsubscribeUrl = includeUnsubscribe ? `${APP_URL}/unsubscribe/${item.tracking_token}` : undefined
    const html = buildHtmlBody(campaign.body, ctx, { trackingPixelUrl, unsubscribeUrl })
    const text = buildTextBody(campaign.body, ctx, { unsubscribeUrl })
    const subject = applyVariables(campaign.subject, ctx)

    const headers: Record<string, string> = {}
    if (unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
    }

    try {
      await transporter.sendMail({
        from: FROM_EMAIL,
        to: item.recipient_email,
        subject,
        html,
        text,
        headers,
      })
      await service.from('email_sends')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', item.id)
      sent++
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 500) || 'unknown'
      await service.from('email_sends')
        .update({ status: 'failed', error_message: msg })
        .eq('id', item.id)
      failed++
    }

    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  const { data: campAfter } = await service
    .from('email_campaigns')
    .select('sent_count, failed_count')
    .eq('id', campaignId)
    .single()
  await service.from('email_campaigns').update({
    sent_count: (campAfter?.sent_count || 0) + sent,
    failed_count: (campAfter?.failed_count || 0) + failed,
  }).eq('id', campaignId)

  const { count: remaining } = await service
    .from('email_sends')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')

  const done = (remaining || 0) === 0
  if (done) {
    await service.from('email_campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaignId)
  }

  return NextResponse.json({ remaining: remaining || 0, sent, failed, done })
}
