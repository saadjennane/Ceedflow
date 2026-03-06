import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AdminNav from '@/components/AdminNav'
import SettingsForm from '@/components/SettingsForm'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
          <ArrowLeft size={16} /> Back to applications
        </Link>
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <SettingsForm currentEmail={user.email || ''} initialFirstName={user.user_metadata?.first_name || ''} initialLastName={user.user_metadata?.last_name || ''} />
      </div>
    </div>
  )
}
