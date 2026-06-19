import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateTrackingToken } from '@/lib/email-templates'
import type { EmailCampaignAudience } from '@/lib/types'

/**
 * POST /api/admin/campaigns
 * Body: {
 *   subject, body,
 *   audience_type, recipientIds: string[],
 *   include_unsubscribe?, include_tracking_pixel?, filters_json?
 * }
 * Creates a draft campaign and pre-creates email_sends rows for each recipient.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const subject = String(body.subject || '').trim()
  const bodyText = String(body.body || '').trim()
  const audience: EmailCampaignAudience = body.audience_type === 'juror' ? 'juror' : 'application'
  // Back-compat: accept either `recipientIds` or legacy `applicationIds`
  const recipientIds: string[] = Array.isArray(body.recipientIds)
    ? body.recipientIds
    : Array.isArray(body.applicationIds) ? body.applicationIds : []
  const includeUnsubscribe = !!body.include_unsubscribe
  const includeTrackingPixel = body.include_tracking_pixel !== false
  const filtersJson = body.filters_json || null

  if (!subject || !bodyText) return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  if (recipientIds.length === 0) return NextResponse.json({ error: 'At least one recipient required' }, { status: 400 })

  let recipients: {
    application_id?: string | null
    juror_id?: string | null
    recipient_email: string
    recipient_name: string
    startup_name?: string | null
    tracking_token: string
  }[] = []

  if (audience === 'application') {
    const { data: apps, error } = await supabase
      .from('applications')
      .select('id, startup_name, do_not_contact, founders(full_name, email, is_primary)')
      .in('id', recipientIds)
      .neq('do_not_contact', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type FounderRow = { full_name: string; email: string; is_primary: boolean }
    recipients = (apps || []).map(a => {
      const founders = (a.founders || []) as FounderRow[]
      const primary = founders.find(f => f.is_primary) || founders[0]
      if (!primary?.email) return null
      return {
        application_id: a.id as string,
        startup_name: a.startup_name as string,
        recipient_email: primary.email,
        recipient_name: primary.full_name,
        tracking_token: generateTrackingToken(),
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)
  } else {
    const { data: jurors, error } = await supabase
      .from('jurors')
      .select('id, first_name, last_name, email, do_not_contact')
      .in('id', recipientIds)
      .neq('do_not_contact', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type JurorRow = { id: string; first_name: string; last_name: string; email: string }
    recipients = (jurors as JurorRow[] || []).filter(j => !!j.email).map(j => ({
      juror_id: j.id,
      recipient_email: j.email,
      recipient_name: `${j.first_name} ${j.last_name}`.trim(),
      tracking_token: generateTrackingToken(),
    }))
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No eligible recipients (all opted out or no email).' }, { status: 400 })
  }

  const { data: campaign, error: campErr } = await supabase
    .from('email_campaigns')
    .insert({
      subject,
      body: bodyText,
      status: 'draft',
      audience_type: audience,
      include_unsubscribe: includeUnsubscribe,
      include_tracking_pixel: includeTrackingPixel,
      filters_json: filtersJson,
      created_by: user.id,
      recipients_count: recipients.length,
    })
    .select()
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: campErr?.message || 'Failed to create campaign' }, { status: 500 })
  }

  const sendsPayload = recipients.map(r => ({
    campaign_id: campaign.id,
    audience_type: audience,
    application_id: r.application_id || null,
    juror_id: r.juror_id || null,
    recipient_email: r.recipient_email,
    recipient_name: r.recipient_name,
    startup_name: r.startup_name || null,
    tracking_token: r.tracking_token,
    status: 'queued' as const,
  }))

  const { error: sendsErr } = await supabase.from('email_sends').insert(sendsPayload)
  if (sendsErr) return NextResponse.json({ error: sendsErr.message }, { status: 500 })

  return NextResponse.json({ campaign, recipientsCount: recipients.length })
}
