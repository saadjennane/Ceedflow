import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import ApplicationDetail from '@/components/ApplicationDetail'

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  const { data: application } = await supabase
    .from('applications')
    .select('*, founders(*), documents(*), notes(*), activity_log(*)')
    .eq('id', id)
    .single()

  if (!application) {
    notFound()
  }

  // Get admin users for assignment dropdown (requires service role)
  const serviceClient = await createServiceRoleClient()
  const { data: adminUsers } = await serviceClient.auth.admin.listUsers()

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ApplicationDetail
          application={application}
          currentUserId={user.id}
          currentUserEmail={user.email || ''}
          adminUsers={adminUsers?.users?.map(u => ({
            id: u.id,
            email: u.email || '',
            first_name: u.user_metadata?.first_name || '',
            last_name: u.user_metadata?.last_name || '',
          })) || []}
        />
      </div>
    </div>
  )
}
