import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { startup_name, founder_emails } = await request.json()
    const supabase = await createServiceRoleClient()

    // Check by startup name
    const { data: nameMatch } = await supabase
      .from('applications')
      .select('id')
      .ilike('startup_name', startup_name)
      .limit(1)

    if (nameMatch && nameMatch.length > 0) {
      return NextResponse.json({ isDuplicate: true })
    }

    // Check by founder emails
    if (founder_emails && founder_emails.length > 0) {
      const { data: emailMatch } = await supabase
        .from('founders')
        .select('id')
        .in('email', founder_emails)
        .limit(1)

      if (emailMatch && emailMatch.length > 0) {
        return NextResponse.json({ isDuplicate: true })
      }
    }

    return NextResponse.json({ isDuplicate: false })
  } catch {
    return NextResponse.json({ isDuplicate: false })
  }
}
