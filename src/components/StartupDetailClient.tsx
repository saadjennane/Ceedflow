'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Globe, Linkedin, MapPin, Calendar, Users, DollarSign,
  CheckCircle2, XCircle, Star, MessageSquareText, ExternalLink, Save,
} from 'lucide-react'
import type { ExternalStartup, ExternalStartupStatus } from '@/lib/types'

const STATUS_LABEL: Record<ExternalStartupStatus, string> = {
  new: 'Nouveau',
  reviewed: 'Évalué',
  interested: 'Intéressant',
  contacted: 'Contacté',
  not_relevant: 'Non pertinent',
}
const STATUS_COLOR: Record<ExternalStartupStatus, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  reviewed: 'bg-gray-100 text-gray-700 border-gray-200',
  interested: 'bg-amber-100 text-amber-800 border-amber-200',
  contacted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  not_relevant: 'bg-gray-100 text-gray-500 border-gray-200',
}

function formatDate(s?: string | null) {
  if (!s) return null
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function StartupDetailClient({
  startup,
  currentUserId,
}: {
  startup: ExternalStartup
  currentUserId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [notes, setNotes] = useState(startup.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  const setStatus = async (next: ExternalStartupStatus) => {
    setSavingStatus(true)
    const patch: Record<string, unknown> = {
      status_internal: next,
      reviewed_by: currentUserId,
      reviewed_at: new Date().toISOString(),
    }
    if (next === 'contacted') {
      patch.contacted_by = currentUserId
      patch.contacted_at = new Date().toISOString()
    }
    await supabase.from('external_startups').update(patch).eq('id', startup.id)
    setSavingStatus(false)
    router.refresh()
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    await supabase.from('external_startups').update({ notes }).eq('id', startup.id)
    setSavingNotes(false)
    router.refresh()
  }

  const founders = Array.isArray(startup.founders) ? startup.founders : []

  return (
    <div>
      <Link href="/admin/startups" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
        <ArrowLeft size={16} /> Retour à la liste
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          {startup.logo_url && (
            <img src={startup.logo_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 bg-white flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{startup.name}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 mt-1">
                  {startup.stage && <span>{startup.stage}</span>}
                  {startup.status && <><span>·</span><span>{startup.status}</span></>}
                  {startup.founding_year && <><span>·</span><span className="inline-flex items-center gap-1"><Calendar size={12} />{startup.founding_year}</span></>}
                  {startup.city && <><span>·</span><span className="inline-flex items-center gap-1"><MapPin size={12} />{startup.city}{startup.country ? `, ${startup.country}` : ''}</span></>}
                  {startup.employee_count && <><span>·</span><span className="inline-flex items-center gap-1"><Users size={12} />{startup.employee_count}</span></>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {startup.sectors.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{s}</span>
                  ))}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${STATUS_COLOR[startup.status_internal]}`}>
                {STATUS_LABEL[startup.status_internal]}
              </span>
            </div>
          </div>
        </div>

        {/* External links */}
        <div className="flex flex-wrap gap-2 mt-4">
          {startup.website && (
            <a href={startup.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
              <Globe size={14} /> Site web <ExternalLink size={12} className="text-gray-400" />
            </a>
          )}
          {startup.linkedin && (
            <a href={startup.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
              <Linkedin size={14} /> LinkedIn <ExternalLink size={12} className="text-gray-400" />
            </a>
          )}
          {startup.source_url && (
            <a href={startup.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
              Source ({startup.source}) <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {startup.description && (
            <Section title="Description">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{startup.description}</p>
            </Section>
          )}

          {(startup.total_funding || startup.latest_round || startup.lead_investor || startup.other_investors.length > 0) && (
            <Section title="Financement">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {startup.total_funding && (
                  <div>
                    <div className="text-xs text-gray-500">Total levé</div>
                    <div className="font-semibold text-gray-900 inline-flex items-center gap-1"><DollarSign size={14} className="text-emerald-600" />{startup.total_funding}</div>
                  </div>
                )}
                {startup.latest_round && (
                  <div>
                    <div className="text-xs text-gray-500">Dernier tour</div>
                    <div className="text-gray-700">{startup.latest_round}{startup.latest_round_date ? ` (${startup.latest_round_date})` : ''}</div>
                  </div>
                )}
                {startup.lead_investor && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500">Lead investor</div>
                    <div className="text-gray-700">{startup.lead_investor}</div>
                  </div>
                )}
                {startup.other_investors.length > 0 && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500">Autres investisseurs</div>
                    <div className="text-gray-700">{startup.other_investors.join(', ')}</div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {founders.length > 0 && (
            <Section title="Fondateurs">
              <ul className="space-y-1.5">
                {founders.map((f, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-gray-900">{f.name}</span>
                    {f.role && <span className="text-gray-500 ml-2">— {f.role}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {startup.notable_clients.length > 0 && (
            <Section title="Clients notables">
              <div className="flex flex-wrap gap-1.5">
                {startup.notable_clients.map(c => (
                  <span key={c} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700">{c}</span>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Sidebar — actions + notes */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Statut CRM</h3>
            <div className="grid grid-cols-2 gap-2">
              <StatusButton current={startup.status_internal} value="interested" label="Intéressant" icon={<Star size={14} />} onClick={() => setStatus('interested')} disabled={savingStatus} />
              <StatusButton current={startup.status_internal} value="contacted" label="Contacté" icon={<CheckCircle2 size={14} />} onClick={() => setStatus('contacted')} disabled={savingStatus} />
              <StatusButton current={startup.status_internal} value="reviewed" label="Évalué" icon={<MessageSquareText size={14} />} onClick={() => setStatus('reviewed')} disabled={savingStatus} />
              <StatusButton current={startup.status_internal} value="not_relevant" label="Non pertinent" icon={<XCircle size={14} />} onClick={() => setStatus('not_relevant')} disabled={savingStatus} />
            </div>
            <button
              onClick={() => setStatus('new')}
              disabled={savingStatus || startup.status_internal === 'new'}
              className="w-full mt-2 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Réinitialiser à « Nouveau »
            </button>
            {startup.contacted_at && (
              <p className="text-xs text-gray-400 mt-3">
                Contacté le {formatDate(startup.contacted_at)}
              </p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Notes internes</h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={6}
              placeholder="Notes, contexte, prochaines étapes…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes || notes === (startup.notes || '')}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={12} />
              {savingNotes ? 'Enregistrement…' : 'Enregistrer les notes'}
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 text-xs text-gray-500 space-y-1">
            <div>Scrapé pour la 1ère fois : {formatDate(startup.first_scraped_at)}</div>
            <div>Dernière mise à jour : {formatDate(startup.last_scraped_at)}</div>
            <div>ID source : <code className="bg-gray-100 px-1 rounded">{startup.external_id}</code></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </div>
  )
}

function StatusButton({
  current, value, label, icon, onClick, disabled,
}: {
  current: ExternalStartupStatus
  value: ExternalStartupStatus
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled: boolean
}) {
  const active = current === value
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
        active
          ? STATUS_COLOR[value] + ' ring-2 ring-offset-1 ring-blue-300'
          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
