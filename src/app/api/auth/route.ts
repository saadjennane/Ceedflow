import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { email, password } = await request.json()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.json({ user: data.user })
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  return NextResponse.json({ success: true })
}
