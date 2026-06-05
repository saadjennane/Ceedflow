import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import CommitteeDetailClient from '@/components/CommitteeDetailClient'
import type {
  Committee, CommitteeApplication, CommitteeJuror, JurorDecision, JurorRating, Application, Juror,
} from '@/lib/types'

export default async function CommitteeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: committee } = await supabase.from('committees').select('*').eq('id', id).single()
  if (!committee) notFound()

  const [caRes, cjRes, decisionsRes, ratingsRes, appsRes, jurorsRes] = await Promise.all([
    supabase.from('committee_applications').select('*').eq('committee_id', id),
    supabase.from('committee_jurors').select('*').eq('committee_id', id),
    supabase.from('juror_decisions').select('*').eq('committee_id', id),
    supabase.from('juror_ratings').select('*').eq('committee_id', id),
    supabase.from('applications').select('id, startup_name, sector, stage, status, logo_url').is('deleted_at', null),
    supabase.from('jurors').select('*'),
  ])

  const committeeApps = (caRes.data || []) as CommitteeApplication[]
  const committeeJurors = (cjRes.data || []) as CommitteeJuror[]
  const decisions = (decisionsRes.data || []) as JurorDecision[]
  const ratings = (ratingsRes.data || []) as JurorRating[]
  const allApps = (appsRes.data || []) as Pick<Application, 'id' | 'startup_name' | 'sector' | 'stage' | 'status' | 'logo_url'>[]
  const allJurors = (jurorsRes.data || []) as Juror[]

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <CommitteeDetailClient
          committee={committee as Committee}
          committeeApps={committeeApps}
          committeeJurors={committeeJurors}
          decisions={decisions}
          ratings={ratings}
          allApps={allApps}
          allJurors={allJurors}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
