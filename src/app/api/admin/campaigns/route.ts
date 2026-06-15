import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateTrackingToken } from '@/lib/email-templates'

/**
 * POST /api/admin/campaigns
 * Body: { subject, body, applicationIds: string[] }
 * Creates a draft campaign and pre-creates email_sends rows for each recipient.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const subject = String(body.subject || '').trim()
  const bodyText = String(body.body || '').trim()
  const applicationIds: string[] = Array.isArray(body.applicationIds) ? body.applicationIds : []

  if (!subject || !bodyText) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  }
  if (applicationIds.length === 0) {
    return NextResponse.json({ error: 'At least one recipient required' }, { status: 400 })
  }

  // Load applications + their primary founders. Exclude those who opted out.
  const { data: apps, error: appsErr } = await supabase
    .from('applications')
    .select('id, startup_name, do_not_contact, founders(full_name, email, is_primary)')
    .in('id', applicationIds)
    .neq('do_not_contact', true)

  if (appsErr) return NextResponse.json({ error: appsErr.message }, { status: 500 })
  if (!apps || apps.length === 0) {
    return NextResponse.json({ error: 'No eligible recipients (all opted out?)' }, { status: 400 })
  }

  type FounderRow = { full_name: string; email: string; is_primary: boolean }

  // Build the list of unique recipients (primary founder per application)
  const recipients = apps
    .map((a) => {
      const founders = (a.founders || []) as FounderRow[]
      const primary = founders.find(f => f.is_primary) || founders[0]
      if (!primary || !primary.email) return null
      return {
        application_id: a.id as string,
        startup_name: a.startup_name as string,
        recipient_email: primary.email,
        recipient_name: primary.full_name,
        tracking_token: generateTrackingToken(),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No applications have a contactable founder email' }, { status: 400 })
  }

  // Create campaign
  const { data: campaign, error: campErr } = await supabase
    .from('email_campaigns')
    .insert({
      subject,
      body: bodyText,
      status: 'draft',
      created_by: user.id,
      recipients_count: recipients.length,
    })
    .select()
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: campErr?.message || 'Failed to create campaign' }, { status: 500 })
  }

  // Pre-create email_sends rows (status=queued)
  const sendsPayload = recipients.map(r => ({
    campaign_id: campaign.id,
    application_id: r.application_id,
    recipient_email: r.recipient_email,
    recipient_name: r.recipient_name,
    startup_name: r.startup_name,
    tracking_token: r.tracking_token,
    status: 'queued' as const,
  }))

  const { error: sendsErr } = await supabase.from('email_sends').insert(sendsPayload)
  if (sendsErr) {
    return NextResponse.json({ error: sendsErr.message }, { status: 500 })
  }

  return NextResponse.json({ campaign, recipientsCount: recipients.length })
}
