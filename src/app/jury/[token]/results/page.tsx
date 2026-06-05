import { createServiceRoleClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type {
  Committee, CommitteeApplication, CommitteeJuror, Juror, JurorDecision, JurorRating, Application,
} from '@/lib/types'
import { computeFinalDecision } from '@/lib/committees'

export const dynamic = 'force-dynamic'

export default async function JuryResultsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createServiceRoleClient()

  const { data: cj } = await supabase
    .from('committee_jurors')
    .select('*')
    .eq('access_token', token)
    .single()
  if (!cj) notFound()
  const committeeJuror = cj as CommitteeJuror

  const [committeeRes, jurorRes, caRes, allCjRes, decisionsRes, ratingsRes] = await Promise.all([
    supabase.from('committees').select('*').eq('id', committeeJuror.committee_id).single(),
    supabase.from('jurors').select('*').eq('id', committeeJuror.juror_id).single(),
    supabase.from('committee_applications').select('*').eq('committee_id', committeeJuror.committee_id),
    supabase.from('committee_jurors').select('*').eq('committee_id', committeeJuror.committee_id),
    supabase.from('juror_decisions').select('*').eq('committee_id', committeeJuror.committee_id),
    supabase.from('juror_ratings').select('*').eq('committee_id', committeeJuror.committee_id),
  ])

  if (!committeeRes.data || !jurorRes.data) notFound()

  const committee = committeeRes.data as Committee
  const juror = jurorRes.data as Juror
  const committeeApps = (caRes.data || []) as CommitteeApplication[]
  const allCommitteeJurors = (allCjRes.data || []) as CommitteeJuror[]
  const decisions = (decisionsRes.data || []) as JurorDecision[]
  const ratings = (ratingsRes.data || []) as JurorRating[]

  const appIds = committeeApps.map(ca => ca.application_id)
  const { data: appsData } = await supabase
    .from('applications')
    .select('id, startup_name, sector, stage, logo_url')
    .in('id', appIds.length > 0 ? appIds : ['00000000-0000-0000-0000-000000000000'])
  const apps = (appsData || []) as Pick<Application, 'id' | 'startup_name' | 'sector' | 'stage' | 'logo_url'>[]
  const appsById = new Map(apps.map(a => [a.id, a]))

  const ranked = committeeApps.map(ca => {
    const scores = ratings.filter(r => r.application_id === ca.application_id).map(r => r.score)
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    const final = computeFinalDecision(
      decisions.filter(d => d.application_id === ca.application_id),
      allCommitteeJurors.length,
      ca.admin_override_decision || null,
    )
    return { ca, app: appsById.get(ca.application_id), avg, final }
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Link href={`/jury/${token}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700">
            <ArrowLeft size={16} />
            Retour aux dossiers
          </Link>
          <div className="mt-1">
            <h1 className="font-semibold">{committee.name} — Classement</h1>
            <p className="text-xs text-gray-500">{juror.first_name} {juror.last_name}</p>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {ranked.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun dossier dans ce comité.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-12">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Startup</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sect. / Stade</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Note moy.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Décision</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, idx) => (
                  <tr key={row.ca.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {row.app?.logo_url && (
                          <img src={row.app.logo_url} alt="" className="w-6 h-6 rounded-full object-cover border border-gray-200" />
                        )}
                        {row.app?.startup_name || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{row.app?.sector || '—'} · {row.app?.stage || '—'}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.avg !== null ? (
                        <span className="text-amber-700 font-medium">{row.avg.toFixed(1)}/5</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.final.final === 'retenu' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Retenu</span>
                      )}
                      {row.final.final === 'rejete' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Rejeté</span>
                      )}
                      {row.final.final === 'pending' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">En attente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
