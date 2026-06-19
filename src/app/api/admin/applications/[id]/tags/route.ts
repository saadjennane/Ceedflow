import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/** GET tags assigned to one application */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('application_tag_assignments')
    .select('tag_id, application_tags(*)')
    .eq('application_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tags: data?.map((r) => (r as { application_tags: unknown }).application_tags) || [] })
}

/** PUT /api/admin/applications/[id]/tags { tagIds: string[] } — replace the full set */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const tagIds: string[] = Array.isArray(body.tagIds) ? body.tagIds.map(String) : []

  await supabase.from('application_tag_assignments').delete().eq('application_id', id)
  if (tagIds.length > 0) {
    const rows = tagIds.map(tagId => ({ application_id: id, tag_id: tagId, assigned_by: user.id }))
    const { error } = await supabase.from('application_tag_assignments').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, tagIds })
}
