import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AdminNav from '@/components/AdminNav'
import AdminTabs from '@/components/AdminTabs'
import AdminJurorRatingClient from '@/components/AdminJurorRatingClient'
import type {
  Committee, Juror, Application, Founder,
  JurorRating, JurorRatingComment, JurorDecision, CommitteeJuror, CommitteeApplication,
} from '@/lib/types'

export default async function AdminJurorRatingPage({
  params,
}: {
  params: Promise<{ id: string; jurorId: string; appId: string }>
}) {
  const { id: committeeId, jurorId, appId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const [committeeRes, jurorRes, appRes, cjRes, caRes, foundersRes, ratingsRes, commentsRes, decisionRes] = await Promise.all([
    supabase.from('committees').select('*').eq('id', committeeId).single(),
    supabase.from('jurors').select('*').eq('id', jurorId).single(),
    supabase.from('applications').select('*').eq('id', appId).single(),
    supabase.from('committee_jurors').select('*').eq('committee_id', committeeId).eq('juror_id', jurorId).single(),
    supabase.from('committee_applications').select('*').eq('committee_id', committeeId).eq('application_id', appId).single(),
    supabase.from('founders').select('*').eq('application_id', appId),
    supabase.from('juror_ratings').select('*').eq('committee_id', committeeId).eq('juror_id', jurorId).eq('application_id', appId),
    supabase.from('juror_rating_comments').select('*').eq('committee_id', committeeId).eq('juror_id', jurorId).eq('application_id', appId),
    supabase.from('juror_decisions').select('*').eq('committee_id', committeeId).eq('juror_id', jurorId).eq('application_id', appId).maybeSingle(),
  ])

  if (!committeeRes.data || !jurorRes.data || !appRes.data || !cjRes.data || !caRes.data) notFound()

  const committee = committeeRes.data as Committee
  const juror = jurorRes.data as Juror
  const application = appRes.data as Application
  void (cjRes.data as CommitteeJuror)
  void (caRes.data as CommitteeApplication)
  const founders = (foundersRes.data || []) as Founder[]
  const ratings = (ratingsRes.data || []) as JurorRating[]
  const comments = (commentsRes.data || []) as JurorRatingComment[]
  const decision = decisionRes.data as JurorDecision | null

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav email={user.email || ''} displayName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined} />
      <AdminTabs />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href={`/admin/committees/${committee.id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
          <ArrowLeft size={16} />
          Retour au comité
        </Link>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900">
          Tu modifies la grille de <strong>{juror.first_name} {juror.last_name}</strong> sur le dossier <strong>{application.startup_name}</strong> (comité <strong>{committee.name}</strong>). Toutes les notes et décisions sont sauvegardées telles que si le jury les avait saisies.
        </div>

        <AdminJurorRatingClient
          committeeId={committee.id}
          jurorId={juror.id}
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
