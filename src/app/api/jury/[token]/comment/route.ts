import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createServiceRoleClient()

  const { data: cj } = await supabase
    .from('committee_jurors')
    .select('*')
    .eq('access_token', token)
    .single()

  if (!cj) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const body = await request.json()
  const { application_id, criterion, comment } = body

  if (typeof application_id !== 'string' || typeof criterion !== 'string' || typeof comment !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const text = comment.trim()

  if (text === '') {
    await supabase.from('juror_rating_comments')
      .delete()
      .eq('committee_id', cj.committee_id)
      .eq('juror_id', cj.juror_id)
      .eq('application_id', application_id)
      .eq('criterion', criterion)
    return NextResponse.json({ success: true })
  }

  const { error } = await supabase.from('juror_rating_comments').upsert(
    {
      committee_id: cj.committee_id,
      juror_id: cj.juror_id,
      application_id,
      criterion,
      comment: text,
    },
    { onConflict: 'committee_id,juror_id,application_id,criterion' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
