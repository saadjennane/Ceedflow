import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceRoleClient()
  const { data, error } = await serviceClient.auth.admin.listUsers()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = data.users.map(u => ({
    id: u.id,
    email: u.email,
    first_name: u.user_metadata?.first_name || '',
    last_name: u.user_metadata?.last_name || '',
    created_at: u.created_at,
  }))

  return NextResponse.json({ users })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email, password, first_name, last_name } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const serviceClient = await createServiceRoleClient()
  const { error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: first_name || '', last_name: last_name || '' },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
