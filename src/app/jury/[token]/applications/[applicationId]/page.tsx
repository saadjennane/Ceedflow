import { createServiceRoleClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import JuryRatingClient from '@/components/JuryRatingClient'
import type {
  Application, Founder, Committee, CommitteeApplication, CommitteeJuror, Juror,
  JurorRating, JurorRatingComment, JurorDecision,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function JuryRatingPage({
  params,
}: {
  params: Promise<{ token: string; applicationId: string }>
}) {
  const { token, applicationId } = await params
  const supabase = await createServiceRoleClient()

  const { data: cj } = await supabase
    .from('committee_jurors')
    .select('*')
    .eq('access_token', token)
    .single()
  if (!cj) notFound()
  const committeeJuror = cj as CommitteeJuror

  const { data: ca } = await supabase
    .from('committee_applications')
    .select('*')
    .eq('committee_id', committeeJuror.committee_id)
    .eq('application_id', applicationId)
    .single()
  if (!ca) notFound()
  void (ca as CommitteeApplication)

  const [committeeRes, jurorRes, appRes, foundersRes, ratingsRes, commentsRes, decisionRes] = await Promise.all([
    supabase.from('committees').select('*').eq('id', committeeJuror.committee_id).single(),
    supabase.from('jurors').select('*').eq('id', committeeJuror.juror_id).single(),
    supabase.from('applications').select('*').eq('id', applicationId).single(),
    supabase.from('founders').select('*').eq('application_id', applicationId),
    supabase.from('juror_ratings').select('*').eq('committee_id', committeeJuror.committee_id).eq('juror_id', committeeJuror.juror_id).eq('application_id', applicationId),
    supabase.from('juror_rating_comments').select('*').eq('committee_id', committeeJuror.committee_id).eq('juror_id', committeeJuror.juror_id).eq('application_id', applicationId),
    supabase.from('juror_decisions').select('*').eq('committee_id', committeeJuror.committee_id).eq('juror_id', committeeJuror.juror_id).eq('application_id', applicationId).maybeSingle(),
  ])

  if (!committeeRes.data || !jurorRes.data || !appRes.data) notFound()

  const committee = committeeRes.data as Committee
  const juror = jurorRes.data as Juror
  const application = appRes.data as Application
  const founders = (foundersRes.data || []) as Founder[]
  const ratings = (ratingsRes.data || []) as JurorRating[]
  const comments = (commentsRes.data || []) as JurorRatingComment[]
  const decision = decisionRes.data as JurorDecision | null

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Link href={`/jury/${token}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700">
            <ArrowLeft size={16} />
            Retour aux dossiers
          </Link>
          <div className="mt-1">
            <h1 className="font-semibold">{committee.name}</h1>
            <p className="text-xs text-gray-500">{juror.first_name} {juror.last_name}</p>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <JuryRatingClient
          token={token}
          application={application}
          founders={founders}
          ratings={ratings}
          comments={comments}
          decision={decision}
        />
      </div>
    </div>
  )
}
