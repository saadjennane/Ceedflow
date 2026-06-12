import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import StartupsClient from '@/components/StartupsClient'
import type { ExternalStartup, ExternalStartupSyncRun } from '@/lib/types'

export default async function StartupsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const [startupsRes, lastRunRes] = await Promise.all([
    supabase
      .from('external_startups')
      .select('*')
      .order('name', { ascending: true })
      .limit(2000),
    supabase
      .from('external_startups_sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const startups = (startupsRes.data || []) as ExternalStartup[]
  const lastRun = (lastRunRes.data || null) as ExternalStartupSyncRun | null

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <StartupsClient startups={startups} lastRun={lastRun} />
      </div>
    </div>
  )
}
