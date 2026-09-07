import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  fetchFilteredApplications,
  pickPrimaryFounder,
  readFiltersFromParams,
} from '@/lib/application-filters'

/**
 * GET /api/applications/export-emails
 * Returns a semicolon-separated .txt file with the primary founder email of
 * every application matching the current filters. Same filter rules as the
 * .xlsx export. Excludes do_not_contact and empty emails, and dedupes.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filters = readFiltersFromParams(request.nextUrl.searchParams)
  const rows = await fetchFilteredApplications(supabase, filters)

  const seen = new Set<string>()
  const emails: string[] = []
  for (const app of rows) {
    if (app.do_not_contact) continue
    const primary = pickPrimaryFounder(app)
    const email = primary?.email?.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    emails.push(email)
  }
  emails.sort()

  const body = emails.join(';')
  const filename = `emails_${new Date().toISOString().slice(0, 10)}.txt`

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
