import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  let query = supabase.from('applications').select('*')

  const status = searchParams.get('status')
  const sector = searchParams.get('sector')
  const stage = searchParams.get('stage')
  const priority = searchParams.get('priority')

  if (status) query = query.eq('status', status)
  if (sector) query = query.eq('sector', sector)
  if (stage) query = query.eq('stage', stage)
  if (priority) query = query.eq('priority', priority)

  const { data: applications, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }

  // Build CSV
  const headers = ['Startup Name', 'Sector', 'Stage', 'Status', 'Priority', 'Assigned Admin', 'Next Action', 'Submitted']
  const rows = (applications || []).map(app => [
    app.startup_name,
    app.sector,
    app.stage,
    app.status,
    app.priority,
    app.assigned_admin_id || '',
    app.next_action || '',
    new Date(app.created_at).toLocaleDateString(),
  ])

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=applications.csv',
    },
  })
}
