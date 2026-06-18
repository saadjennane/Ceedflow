import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/email-templates
 * Create a new manual template. Body:
 *   { key, name, description?, recipient_type, is_internal, enabled,
 *     subject_fr, body_fr, subject_en, body_en, available_variables? }
 *
 * `key` must be unique. `trigger_event` is forced to 'manual' (auto templates
 * are seed-only since they're triggered by code).
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const key = String(body.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const name = String(body.name || '').trim()
  const recipient_type = body.recipient_type === 'juror' ? 'juror' : 'application'
  const is_internal = !!body.is_internal
  const enabled = body.enabled !== false
  const subject_fr = String(body.subject_fr || '').trim()
  const body_fr = String(body.body_fr || '').trim()
  const subject_en = String(body.subject_en || '').trim()
  const body_en = String(body.body_en || '').trim()
  const description = body.description ? String(body.description) : null
  const available_variables = Array.isArray(body.available_variables)
    ? body.available_variables.map((v: unknown) => String(v))
    : []

  if (!key || !name || !subject_fr || !body_fr || !subject_en || !body_en) {
    return NextResponse.json({ error: 'key, name, subject_fr, body_fr, subject_en, body_en sont requis' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      key,
      name,
      description,
      recipient_type,
      is_internal,
      enabled,
      trigger_event: 'manual',
      subject_fr,
      body_fr,
      subject_en,
      body_en,
      available_variables,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `La clé "${key}" est déjà utilisée.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ template: data })
}
