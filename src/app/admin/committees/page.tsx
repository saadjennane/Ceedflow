import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import CommitteesClient from '@/components/CommitteesClient'
import type { Committee, CommitteeApplication, CommitteeJuror } from '@/lib/types'

export default async function CommitteesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const [committeesRes, caRes, cjRes] = await Promise.all([
    supabase.from('committees').select('*').order('created_at', { ascending: false }),
    supabase.from('committee_applications').select('*'),
    supabase.from('committee_jurors').select('*'),
  ])

  const committees = (committeesRes.data || []) as Committee[]
  const committeeApps = (caRes.data || []) as CommitteeApplication[]
  const committeeJurors = (cjRes.data || []) as CommitteeJuror[]

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <CommitteesClient
          committees={committees}
          committeeApps={committeeApps}
          committeeJurors={committeeJurors}
        />
      </div>
    </div>
  )
}
