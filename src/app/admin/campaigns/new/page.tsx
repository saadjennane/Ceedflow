import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import CampaignComposer from '@/components/CampaignComposer'

interface CandidateRow {
  id: string
  startup_name: string
  status: string
  priority: string
  sector: string
  founder_email: string
  founder_name: string
  do_not_contact: boolean
}

export default async function NewCampaignPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  // Load applications (not deleted, not opted out) + their primary founder
  const { data: apps } = await supabase
    .from('applications')
    .select('id, startup_name, status, priority, sector, do_not_contact, founders(full_name, email, is_primary)')
    .is('deleted_at', null)
    .neq('do_not_contact', true)
    .order('created_at', { ascending: false })

  type FounderRow = { full_name: string; email: string; is_primary: boolean }
  const rows: CandidateRow[] = (apps || []).flatMap(a => {
    const founders = (a.founders || []) as FounderRow[]
    const primary = founders.find(f => f.is_primary) || founders[0]
    if (!primary || !primary.email) return []
    return [{
      id: a.id,
      startup_name: a.startup_name,
      status: a.status,
      priority: a.priority,
      sector: a.sector,
      founder_email: primary.email,
      founder_name: primary.full_name,
      do_not_contact: a.do_not_contact,
    }]
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <CampaignComposer candidates={rows} currentUserEmail={user.email || ''} />
      </div>
    </div>
  )
}
