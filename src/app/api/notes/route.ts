import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { application_id, text } = await request.json()

  const { data: note, error } = await supabase
    .from('notes')
    .insert({
      application_id,
      author_user_id: user.id,
      text,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })
  }

  // Log activity
  await supabase.from('activity_log').insert({
    application_id,
    actor_user_id: user.id,
    action_type: 'note_added',
    new_value: text.substring(0, 100),
  })

  return NextResponse.json({ note })
}
