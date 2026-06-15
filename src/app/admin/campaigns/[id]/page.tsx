import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Check, X, Eye } from 'lucide-react'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import type { EmailCampaign, EmailSend } from '@/lib/types'

function formatDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<EmailCampaign['status'], string> = {
  draft: 'Brouillon', sending: 'Envoi en cours', sent: 'Envoyée', failed: 'Échec',
}
const STATUS_COLOR: Record<EmailCampaign['status'], string> = {
  draft: 'bg-gray-100 text-gray-700', sending: 'bg-blue-100 text-blue-800',
  sent: 'bg-emerald-100 text-emerald-800', failed: 'bg-red-100 text-red-800',
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: campaign } = await supabase.from('email_campaigns').select('*').eq('id', id).single()
  if (!campaign) notFound()

  const { data: sends } = await supabase.from('email_sends').select('*').eq('campaign_id', id).order('recipient_email')
  const list = (sends || []) as EmailSend[]

  const c = campaign as EmailCampaign
  const openRate = c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/admin/campaigns" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
          <ArrowLeft size={16} /> Retour aux campagnes
        </Link>

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">{c.subject}</h1>
              <p className="text-sm text-gray-500">Créée le {formatDate(c.created_at)}{c.sent_at && ` · Envoyée le ${formatDate(c.sent_at)}`}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[c.status]}`}>
              {STATUS_LABEL[c.status]}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-6">
            <Stat label="Destinataires" value={c.recipients_count} icon={<Mail size={16} className="text-gray-400" />} />
            <Stat label="Envoyés" value={c.sent_count} icon={<Check size={16} className="text-emerald-500" />} />
            <Stat label="Échecs" value={c.failed_count} icon={<X size={16} className="text-red-500" />} highlight={c.failed_count > 0 ? 'text-red-600' : undefined} />
            <Stat label="Ouvertures" value={c.opened_count} sub={c.sent_count > 0 ? `${openRate}%` : undefined} icon={<Eye size={16} className="text-blue-500" />} />
          </div>
        </div>

        {/* Body preview */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-3">Contenu envoyé</h2>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 p-4 rounded border border-gray-100">{c.body}</pre>
        </div>

        {/* Recipients table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <h2 className="font-semibold p-5 border-b border-gray-200">Destinataires ({list.length})</h2>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Startup</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Fondateur</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Envoyé</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Ouvertures</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Dernière ouverture</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium">{s.startup_name || '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{s.recipient_name || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{s.recipient_email}</td>
                  <td className="px-4 py-2">
                    {s.status === 'sent' && <span className="text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> envoyé</span>}
                    {s.status === 'failed' && <span className="text-red-600 inline-flex items-center gap-1" title={s.error_message || ''}><X size={12} /> échec</span>}
                    {s.status === 'queued' && <span className="text-gray-500">en attente</span>}
                    {s.status === 'bounced' && <span className="text-amber-700">bounce</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(s.sent_at)}</td>
                  <td className="px-4 py-2 text-gray-700">
                    {s.open_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-700"><Eye size={12} /> {s.open_count}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(s.last_opened_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, icon, highlight }: { label: string; value: number; sub?: string; icon: React.ReactNode; highlight?: string }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide">{icon}{label}</div>
      <div className={`text-2xl font-bold mt-1 ${highlight || 'text-gray-900'}`}>{value}{sub && <span className="text-sm font-normal text-gray-500 ml-1">({sub})</span>}</div>
    </div>
  )
}
