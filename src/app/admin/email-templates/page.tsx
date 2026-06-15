import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import EmailTemplatesClient from '@/components/EmailTemplatesClient'
import type { EmailTemplate } from '@/lib/types'

export default async function EmailTemplatesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data } = await supabase
    .from('email_templates')
    .select('*')
    .order('trigger_event', { ascending: true })
    .order('name', { ascending: true })

  const templates = (data || []) as EmailTemplate[]

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <EmailTemplatesClient templates={templates} />
      </div>
    </div>
  )
}
