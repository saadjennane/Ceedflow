import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import StartupDetailClient from '@/components/StartupDetailClient'
import type { ExternalStartup } from '@/lib/types'

export default async function StartupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: startup } = await supabase
    .from('external_startups')
    .select('*')
    .eq('id', id)
    .single()
  if (!startup) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <StartupDetailClient startup={startup as ExternalStartup} currentUserId={user.id} />
      </div>
    </div>
  )
}
