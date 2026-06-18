import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sendTemplateEmail, isAllowedFrom } from '@/lib/email'
import type { EmailLanguage, EmailTemplate } from '@/lib/types'

/**
 * POST /api/admin/email-templates/[id]/send
 * Body: {
 *   applicationId?, jurorId?,
 *   language?, subjectOverride?, bodyOverride?, from?
 * }
 *
 * Sends a manual template to either an application's primary founder OR a juror,
 * depending on the template's recipient_type. Variables are populated from the
 * relevant entity. Optional `from` overrides the sender (must be in
 * EMAIL_FROM_ADDRESSES, otherwise the default is used).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: templateId } = await params
  const body = await request.json()
  const language: EmailLanguage = body.language === 'en' ? 'en' : 'fr'
  const subjectOverride = typeof body.subjectOverride === 'string' ? body.subjectOverride : undefined
  const bodyOverride = typeof body.bodyOverride === 'string' ? body.bodyOverride : undefined
  const from = typeof body.from === 'string' && body.from ? body.from : undefined
  if (from && !isAllowedFrom(from)) {
    return NextResponse.json({ error: 'FROM not in allowed list (EMAIL_FROM_ADDRESSES)' }, { status: 400 })
  }
  const applicationId = body.applicationId ? String(body.applicationId) : null
  const jurorId = body.jurorId ? String(body.jurorId) : null

  const service = await createServiceRoleClient()

  const { data: template } = await service
    .from('email_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle<EmailTemplate>()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  if (template.trigger_event !== 'manual') {
    return NextResponse.json({ error: 'Template is not manual' }, { status: 400 })
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Branch on recipient_type
  if (template.recipient_type === 'application') {
    if (!applicationId) return NextResponse.json({ error: 'applicationId required for application template' }, { status: 400 })
    const { data: application } = await service
      .from('applications')
      .select('id, startup_name, stage, sector, do_not_contact, founders(full_name, email, is_primary)')
      .eq('id', applicationId)
      .maybeSingle()
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    if (application.do_not_contact) return NextResponse.json({ error: 'Cette candidature est marquée « ne plus contacter »' }, { status: 400 })

    type FounderRow = { full_name: string; email: string; is_primary: boolean }
    const founders = (application.founders || []) as FounderRow[]
    const primary = founders.find(f => f.is_primary) || founders[0]
    if (!primary || !primary.email) return NextResponse.json({ error: 'Pas de fondateur principal avec email' }, { status: 400 })

    const result = await sendTemplateEmail({
      key: template.key,
      triggerEvent: 'manual',
      language,
      to: primary.email,
      recipientName: primary.full_name,
      applicationId: application.id as string,
      sentBy: user.id,
      subjectOverride,
      bodyOverride,
      from,
      variables: {
        founder_name: primary.full_name,
        founder_first_name: primary.full_name?.trim().split(/\s+/)[0] || '',
        startup_name: application.startup_name as string,
        stage: application.stage as string,
        sector: application.sector as string,
        review_url: `${APP_URL}/admin/applications/${application.id}`,
      },
    })

    if (result.status === 'sent') return NextResponse.json({ success: true, sentTo: primary.email })
    return NextResponse.json({ error: result.reason || 'Send failed', status: result.status }, { status: 500 })
  }

  // Juror template
  if (!jurorId) return NextResponse.json({ error: 'jurorId required for juror template' }, { status: 400 })
  const { data: juror } = await service
    .from('jurors')
    .select('id, first_name, last_name, email, role')
    .eq('id', jurorId)
    .maybeSingle()
  if (!juror) return NextResponse.json({ error: 'Juror not found' }, { status: 404 })
  if (!juror.email) return NextResponse.json({ error: 'Ce jury n\'a pas d\'email' }, { status: 400 })

  const fullName = [juror.first_name, juror.last_name].filter(Boolean).join(' ')
  const result = await sendTemplateEmail({
    key: template.key,
    triggerEvent: 'manual',
    language,
    to: juror.email,
    recipientName: fullName,
    jurorId: juror.id as string,
    sentBy: user.id,
    subjectOverride,
    bodyOverride,
    from,
    variables: {
      juror_name: fullName,
      juror_first_name: juror.first_name || '',
      juror_role: juror.role || '',
    },
  })

  if (result.status === 'sent') return NextResponse.json({ success: true, sentTo: juror.email })
  return NextResponse.json({ error: result.reason || 'Send failed', status: result.status }, { status: 500 })
}
