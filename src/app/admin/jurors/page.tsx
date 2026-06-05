import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import JurorsClient from '@/components/JurorsClient'
import type { Juror, Committee, CommitteeJuror, JurorRating } from '@/lib/types'

export default async function JurorsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const [jurorsRes, cjRes, committeesRes, ratingsRes] = await Promise.all([
    supabase.from('jurors').select('*').order('created_at', { ascending: false }),
    supabase.from('committee_jurors').select('*'),
    supabase.from('committees').select('*'),
    supabase.from('juror_ratings').select('*'),
  ])

  const jurors = (jurorsRes.data || []) as Juror[]
  const committeeJurors = (cjRes.data || []) as CommitteeJuror[]
  const committees = (committeesRes.data || []) as Committee[]
  const ratings = (ratingsRes.data || []) as JurorRating[]

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <JurorsClient
          jurors={jurors}
          committeeJurors={committeeJurors}
          committees={committees}
          ratings={ratings}
        />
      </div>
    </div>
  )
}
