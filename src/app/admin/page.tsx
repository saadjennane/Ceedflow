import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import ApplicationsList from '@/components/ApplicationsList'
import type { AdminUser } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  const { data: applications } = await supabase
    .from('applications')
    .select('*, founders(*), documents(*)')
    .order('created_at', { ascending: false })

  const serviceClient = await createServiceRoleClient()
  const { data: adminUsersData } = await serviceClient.auth.admin.listUsers()
  const adminUsers: AdminUser[] = adminUsersData?.users?.map(u => ({
    id: u.id,
    email: u.email || '',
    first_name: u.user_metadata?.first_name || '',
    last_name: u.user_metadata?.last_name || '',
  })) || []

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ApplicationsList applications={applications || []} adminUsers={adminUsers} currentUserId={user.id} />
      </div>
    </div>
  )
}
