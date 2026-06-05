import { createServiceRoleClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle, Star } from 'lucide-react'
import type {
  Juror, Committee, CommitteeApplication, CommitteeJuror, JurorDecision, JurorRating, Application,
} from '@/lib/types'
import { RATING_CRITERIA } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function JuryHomePage({
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

  const [committeeRes, jurorRes, caRes, decisionsRes, ratingsRes] = await Promise.all([
    supabase.from('committees').select('*').eq('id', committeeJuror.committee_id).single(),
    supabase.from('jurors').select('*').eq('id', committeeJuror.juror_id).single(),
    supabase.from('committee_applications').select('*').eq('committee_id', committeeJuror.committee_id),
    supabase.from('juror_decisions').select('*').eq('committee_id', committeeJuror.committee_id).eq('juror_id', committeeJuror.juror_id),
    supabase.from('juror_ratings').select('*').eq('committee_id', committeeJuror.committee_id).eq('juror_id', committeeJuror.juror_id),
  ])

  if (!committeeRes.data || !jurorRes.data) notFound()

  const committee = committeeRes.data as Committee
  const juror = jurorRes.data as Juror
  const committeeApps = (caRes.data || []) as CommitteeApplication[]
  const myDecisions = (decisionsRes.data || []) as JurorDecision[]
  const myRatings = (ratingsRes.data || []) as JurorRating[]

  const appIds = committeeApps.map(ca => ca.application_id)
  const { data: appsData } = await supabase
    .from('applications')
    .select('id, startup_name, sector, stage, logo_url, description')
    .in('id', appIds.length > 0 ? appIds : ['00000000-0000-0000-0000-000000000000'])

  const apps = (appsData || []) as Pick<Application, 'id' | 'startup_name' | 'sector' | 'stage' | 'logo_url' | 'description'>[]
  const appsById = new Map(apps.map(a => [a.id, a]))

  const totalSubCriteria = RATING_CRITERIA.reduce((sum, c) => sum + c.sublabels.length, 0)

  const ratingsByApp = new Map<string, JurorRating[]>()
  for (const r of myRatings) {
    if (!ratingsByApp.has(r.application_id)) ratingsByApp.set(r.application_id, [])
    ratingsByApp.get(r.application_id)!.push(r)
  }
  const decisionByApp = new Map(myDecisions.map(d => [d.application_id, d]))

  const completedCount = appIds.filter(id => {
    const rs = ratingsByApp.get(id) || []
    const dec = decisionByApp.get(id)
    return rs.length === totalSubCriteria && dec
  }).length

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold">{committee.name}</h1>
            <p className="text-xs text-gray-500">Bonjour {juror.first_name} {juror.last_name}</p>
          </div>
          <Link
            href={`/jury/${token}/results`}
            className="text-sm text-blue-600 hover:underline"
          >
            Voir le classement
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <div className="text-sm text-gray-700 mb-1">
            <strong>{completedCount}</strong> dossier{completedCount > 1 ? 's' : ''} complété{completedCount > 1 ? 's' : ''} sur <strong>{appIds.length}</strong>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all"
              style={{ width: `${appIds.length > 0 ? (completedCount / appIds.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Pour chaque dossier, note tous les sous-critères et choisis Retenu ou Rejeté. L&apos;unanimité « Retenu » est nécessaire pour qu&apos;un dossier soit retenu.
          </p>
        </div>

        {committeeApps.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun dossier dans ce comité pour le moment.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {committeeApps.map(ca => {
              const app = appsById.get(ca.application_id)
              if (!app) return null
              const rs = ratingsByApp.get(ca.application_id) || []
              const avg = rs.length > 0 ? rs.reduce((a, b) => a + b.score, 0) / rs.length : null
              const dec = decisionByApp.get(ca.application_id)
              const complete = rs.length === totalSubCriteria && dec
              return (
                <Link
                  key={ca.id}
                  href={`/jury/${token}/applications/${ca.application_id}`}
                  className={`bg-white border rounded-lg p-4 hover:shadow-md transition ${complete ? 'border-green-200' : 'border-gray-200'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {app.logo_url && (
                      <img src={app.logo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{app.startup_name}</h3>
                      <div className="text-xs text-gray-500">{app.sector} · {app.stage}</div>
                    </div>
                  </div>
                  {app.description && (
                    <p className="text-xs text-gray-600 line-clamp-2 mb-3">{app.description}</p>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{rs.length}/{totalSubCriteria} sous-critères</span>
                      {avg !== null && (
                        <span className="flex items-center gap-0.5 text-amber-700">
                          <Star size={12} className="fill-amber-400 stroke-amber-500" />
                          {avg.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {dec ? (
                      dec.decision === 'retenu' ? (
                        <span className="flex items-center gap-1 text-green-700">
                          <CheckCircle2 size={14} />
                          Retenu
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-700">
                          <XCircle size={14} />
                          Rejeté
                        </span>
                      )
                    ) : (
                      <span className="text-gray-400">À décider</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
