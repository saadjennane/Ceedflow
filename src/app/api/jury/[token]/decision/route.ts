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
  const { application_id, decision } = body

  if (typeof application_id !== 'string' || (decision !== 'retenu' && decision !== 'rejete')) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { data: ca } = await supabase
    .from('committee_applications')
    .select('id')
    .eq('committee_id', cj.committee_id)
    .eq('application_id', application_id)
    .maybeSingle()

  if (!ca) {
    return NextResponse.json({ error: 'Application not in this committee' }, { status: 400 })
  }

  const { error } = await supabase.from('juror_decisions').upsert(
    {
      committee_id: cj.committee_id,
      juror_id: cj.juror_id,
      application_id,
      decision,
    },
    { onConflict: 'committee_id,juror_id,application_id' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
