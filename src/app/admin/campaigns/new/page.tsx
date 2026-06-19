import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import CampaignComposer from '@/components/CampaignComposer'
import type { ApplicationTag, Sector, Stage, ApplicationStatus, Priority, Source } from '@/lib/types'

export default async function NewCampaignPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  // Filter options: just distinct values pulled from existing rows so the dropdowns
  // never propose things that don't exist in the data.
  const { data: apps } = await supabase
    .from('applications')
    .select('status, priority, sector, stage, source')
    .is('deleted_at', null)

  type Row = { status?: ApplicationStatus; priority?: Priority; sector?: Sector; stage?: Stage; source?: Source }
  const rows = (apps || []) as Row[]
  const uniq = <T,>(arr: (T | undefined | null)[]) => Array.from(new Set(arr.filter(Boolean) as T[])).sort()
  const filterOptions = {
    statuses: uniq(rows.map(r => r.status)),
    priorities: uniq(rows.map(r => r.priority)),
    sectors: uniq(rows.map(r => r.sector)),
    stages: uniq(rows.map(r => r.stage)),
    sources: uniq(rows.map(r => r.source)),
  }

  const { data: tagsData } = await supabase.from('application_tags').select('*').order('label')
  const tags = (tagsData || []) as ApplicationTag[]

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <CampaignComposer
          currentUserEmail={user.email || ''}
          filterOptions={filterOptions}
          tags={tags}
        />
      </div>
    </div>
  )
}
