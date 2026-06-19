import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/** GET /api/admin/tags — list all tags */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('application_tags').select('*').order('label')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tags: data })
}

/** POST /api/admin/tags { label, color } — create a tag */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const label = String(body.label || '').trim()
  const color = typeof body.color === 'string' ? body.color : '#6b7280'
  if (!label) return NextResponse.json({ error: 'label requis' }, { status: 400 })

  const { data, error } = await supabase
    .from('application_tags')
    .insert({ label, color, created_by: user.id })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ce statut existe déjà' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ tag: data })
}
