import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  if (id === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  const serviceClient = await createServiceRoleClient()
  const { data: list, error: listError } = await serviceClient.auth.admin.listUsers()

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  if (list.users.length <= 1) {
    return NextResponse.json({ error: 'Cannot delete the last admin.' }, { status: 400 })
  }

  const { error } = await serviceClient.auth.admin.deleteUser(id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
