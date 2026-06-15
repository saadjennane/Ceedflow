import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, Briefcase } from 'lucide-react'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import type {
  Juror, Committee, CommitteeJuror, JurorRating, JurorDecision, Application,
} from '@/lib/types'
import { RATING_CRITERIA } from '@/lib/types'

export default async function JurorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: juror } = await supabase.from('jurors').select('*').eq('id', id).single()
  if (!juror) notFound()

  const [cjRes, committeesRes, ratingsRes, decisionsRes, appsRes] = await Promise.all([
    supabase.from('committee_jurors').select('*').eq('juror_id', id),
    supabase.from('committees').select('*'),
    supabase.from('juror_ratings').select('*').eq('juror_id', id),
    supabase.from('juror_decisions').select('*').eq('juror_id', id),
    supabase.from('applications').select('id, startup_name, sector, stage').is('deleted_at', null),
  ])

  const myCommitteeJurors = (cjRes.data || []) as CommitteeJuror[]
  const committees = (committeesRes.data || []) as Committee[]
  const ratings = (ratingsRes.data || []) as JurorRating[]
  const decisions = (decisionsRes.data || []) as JurorDecision[]
  const apps = (appsRes.data || []) as Pick<Application, 'id' | 'startup_name' | 'sector' | 'stage'>[]

  const committeeMap = new Map(committees.map(c => [c.id, c]))
  const appMap = new Map(apps.map(a => [a.id, a]))

  // App ratings grouped by (committee, application) → avg + comments+decisions
  const appKey = (committeeId: string, applicationId: string) => `${committeeId}::${applicationId}`
  const grouped: Map<string, { committeeId: string; applicationId: string; scores: number[]; decision: JurorDecision | undefined }> = new Map()
  for (const r of ratings) {
    const key = appKey(r.committee_id, r.application_id)
    if (!grouped.has(key)) {
      grouped.set(key, { committeeId: r.committee_id, applicationId: r.application_id, scores: [], decision: undefined })
    }
    grouped.get(key)!.scores.push(r.score)
  }
  for (const d of decisions) {
    const key = appKey(d.committee_id, d.application_id)
    if (!grouped.has(key)) {
      grouped.set(key, { committeeId: d.committee_id, applicationId: d.application_id, scores: [], decision: d })
    } else {
      grouped.get(key)!.decision = d
    }
  }

  void RATING_CRITERIA

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/admin/jurors" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
          <ArrowLeft size={16} /> Retour à la liste des jurys
        </Link>

        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">{(juror as Juror).first_name} {(juror as Juror).last_name}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <a href={`mailto:${(juror as Juror).email}`} className="flex items-center gap-1 hover:text-blue-700">
              <Mail size={14} />
              {(juror as Juror).email}
            </a>
            {(juror as Juror).phone && (
              <span className="flex items-center gap-1">
                <Phone size={14} />
                {(juror as Juror).phone}
              </span>
            )}
            {(juror as Juror).role && (
              <span className="flex items-center gap-1">
                <Briefcase size={14} />
                {(juror as Juror).role}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Comités</h2>
          {myCommitteeJurors.length === 0 ? (
            <p className="text-sm text-gray-500">Ce jury ne participe à aucun comité.</p>
          ) : (
            <div className="space-y-2">
              {myCommitteeJurors.map(cj => {
                const c = committeeMap.get(cj.committee_id)
                if (!c) return null
                return (
                  <Link
                    key={cj.id}
                    href={`/admin/committees/${c.id}`}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className="text-xs text-gray-500">{c.status}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Startups notées</h2>
          {grouped.size === 0 ? (
            <p className="text-sm text-gray-500">Pas encore de notation.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Startup</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Comité</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Note moy.</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Décision</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.values()).map(g => {
                  const app = appMap.get(g.applicationId)
                  const committee = committeeMap.get(g.committeeId)
                  const avg = g.scores.length > 0 ? g.scores.reduce((a, b) => a + b, 0) / g.scores.length : null
                  return (
                    <tr key={`${g.committeeId}::${g.applicationId}`} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <Link href={`/admin/applications/${g.applicationId}`} className="font-medium hover:underline">
                          {app?.startup_name || '—'}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{committee?.name || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 tabular-nums">{avg !== null ? `${avg.toFixed(1)}/5` : '—'}</td>
                      <td className="px-3 py-2">
                        {g.decision ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.decision.decision === 'retenu' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {g.decision.decision === 'retenu' ? 'Retenu' : 'Rejeté'}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">En attente</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
