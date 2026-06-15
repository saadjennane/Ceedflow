import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sendTemplateEmail } from '@/lib/email'
import type { EmailLanguage, EmailTemplate } from '@/lib/types'

/**
 * POST /api/admin/email-templates/[id]/send
 * Body: { applicationId, language?, subjectOverride?, bodyOverride? }
 *
 * Sends a manual template to the application's primary founder, with
 * variables substituted from the application data and optional overrides
 * (when the admin edits the rendered subject/body in the modal).
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
  const applicationId = String(body.applicationId || '')
  const language: EmailLanguage = body.language === 'en' ? 'en' : 'fr'
  const subjectOverride = typeof body.subjectOverride === 'string' ? body.subjectOverride : undefined
  const bodyOverride = typeof body.bodyOverride === 'string' ? body.bodyOverride : undefined

  if (!applicationId) {
    return NextResponse.json({ error: 'applicationId required' }, { status: 400 })
  }

  // Service role to load full application + verify template exists
  const service = await createServiceRoleClient()

  const { data: template } = await service
    .from('email_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle<EmailTemplate>()
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  if (template.trigger_event !== 'manual') {
    return NextResponse.json({ error: 'Template is not manual' }, { status: 400 })
  }

  const { data: application } = await service
    .from('applications')
    .select('id, startup_name, stage, sector, do_not_contact, founders(full_name, email, is_primary)')
    .eq('id', applicationId)
    .maybeSingle()
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (application.do_not_contact) {
    return NextResponse.json({ error: 'Cette candidature est marquée « ne plus contacter »' }, { status: 400 })
  }

  type FounderRow = { full_name: string; email: string; is_primary: boolean }
  const founders = (application.founders || []) as FounderRow[]
  const primary = founders.find(f => f.is_primary) || founders[0]
  if (!primary || !primary.email) {
    return NextResponse.json({ error: 'Pas de fondateur principal avec email' }, { status: 400 })
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
    variables: {
      founder_name: primary.full_name,
      founder_first_name: primary.full_name?.trim().split(/\s+/)[0] || '',
      startup_name: application.startup_name as string,
      stage: application.stage as string,
      sector: application.sector as string,
      review_url: `${APP_URL}/admin/applications/${application.id}`,
    },
  })

  if (result.status === 'sent') {
    return NextResponse.json({ success: true, sentTo: primary.email })
  }
  return NextResponse.json({ error: result.reason || 'Send failed', status: result.status }, { status: 500 })
}
