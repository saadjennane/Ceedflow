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
  const { application_id, criterion, sub_index, score } = body

  if (typeof application_id !== 'string' || typeof criterion !== 'string' || typeof sub_index !== 'number' || typeof score !== 'number') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  if (score < 1 || score > 5) {
    return NextResponse.json({ error: 'Score must be between 1 and 5' }, { status: 400 })
  }

  // Verify the app belongs to the committee
  const { data: ca } = await supabase
    .from('committee_applications')
    .select('id')
    .eq('committee_id', cj.committee_id)
    .eq('application_id', application_id)
    .maybeSingle()

  if (!ca) {
    return NextResponse.json({ error: 'Application not in this committee' }, { status: 400 })
  }

  const { error } = await supabase.from('juror_ratings').upsert(
    {
      committee_id: cj.committee_id,
      juror_id: cj.juror_id,
      application_id,
      criterion,
      sub_index,
      score,
    },
    { onConflict: 'committee_id,juror_id,application_id,criterion,sub_index' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
