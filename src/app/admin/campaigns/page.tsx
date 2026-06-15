import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Mail, Plus } from 'lucide-react'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import type { EmailCampaign } from '@/lib/types'

function formatDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<EmailCampaign['status'], string> = {
  draft: 'Brouillon',
  sending: 'Envoi en cours',
  sent: 'Envoyée',
  failed: 'Échec',
}
const STATUS_COLOR: Record<EmailCampaign['status'], string> = {
  draft: 'bg-gray-100 text-gray-700',
  sending: 'bg-blue-100 text-blue-800',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
}

export default async function CampaignsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: campaigns } = await supabase
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  const list = (campaigns || []) as EmailCampaign[]

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Campagnes email</h1>
          <Link
            href="/admin/campaigns/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            <Plus size={16} />
            Nouvelle campagne
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Mail size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucune campagne pour le moment.</p>
            <Link href="/admin/campaigns/new" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
              Créer la première campagne
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sujet</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Destinataires</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Envoyés</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ouvertures</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Taux</th>
                </tr>
              </thead>
              <tbody>
                {list.map(c => {
                  const openRate = c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0
                  return (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/admin/campaigns/${c.id}`} className="hover:underline">{c.subject}</Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(c.sent_at || c.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{c.recipients_count}</td>
                      <td className="px-4 py-3 text-gray-700">{c.sent_count}{c.failed_count > 0 && <span className="text-red-600 text-xs ml-1">({c.failed_count} échecs)</span>}</td>
                      <td className="px-4 py-3 text-gray-700">{c.opened_count}</td>
                      <td className="px-4 py-3 text-gray-700">{c.sent_count > 0 ? `${openRate}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
