'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Star, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import type {
  Application, Founder, JurorRating, JurorRatingComment, JurorDecision, RatingCriterionKey,
} from '@/lib/types'
import { RATING_CRITERIA } from '@/lib/types'

function StarRow({
  value,
  onChange,
  size = 18,
}: {
  value: number | null
  onChange: (next: number) => void
  size?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = hover !== null ? n <= hover : value !== null && n <= value
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="cursor-pointer p-0.5 hover:scale-110 transition-transform"
          >
            <Star
              size={size}
              className={filled ? 'fill-amber-400 stroke-amber-500' : 'fill-transparent stroke-gray-300'}
            />
          </button>
        )
      })}
    </div>
  )
}

export default function AdminJurorRatingClient({
  committeeId,
  jurorId,
  application,
  founders,
  ratings,
  comments,
  decision,
}: {
  committeeId: string
  jurorId: string
  application: Application
  founders: Founder[]
  ratings: JurorRating[]
  comments: JurorRatingComment[]
  decision: JurorDecision | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [draftComments, setDraftComments] = useState<Partial<Record<RatingCriterionKey, string>>>({})
  const [saving, setSaving] = useState(false)

  const scoreByCriterion = useMemo(() => {
    const map: Partial<Record<RatingCriterionKey, number>> = {}
    for (const r of ratings) map[r.criterion] = r.score
    return map
  }, [ratings])

  const commentsByCriterion = useMemo(() => {
    const map: Partial<Record<RatingCriterionKey, string>> = {}
    for (const c of comments) map[c.criterion] = c.comment
    return map
  }, [comments])

  const myAvg = ratings.length > 0
    ? ratings.reduce((a, b) => a + b.score, 0) / ratings.length
    : null

  const totalCriteria = RATING_CRITERIA.length

  const setScore = async (criterion: RatingCriterionKey, score: number) => {
    setSaving(true)
    await supabase.from('juror_ratings').upsert(
      {
        committee_id: committeeId,
        juror_id: jurorId,
        application_id: application.id,
        criterion,
        score,
      },
      { onConflict: 'committee_id,juror_id,application_id,criterion' }
    )
    setSaving(false)
    router.refresh()
  }

  const saveComment = async (criterion: RatingCriterionKey, raw: string) => {
    const text = raw.trim()
    const existing = commentsByCriterion[criterion] || ''
    if (text === existing) return
    setSaving(true)
    if (text === '') {
      await supabase.from('juror_rating_comments')
        .delete()
        .eq('committee_id', committeeId)
        .eq('juror_id', jurorId)
        .eq('application_id', application.id)
        .eq('criterion', criterion)
    } else {
      await supabase.from('juror_rating_comments').upsert(
        {
          committee_id: committeeId,
          juror_id: jurorId,
          application_id: application.id,
          criterion,
          comment: text,
        },
        { onConflict: 'committee_id,juror_id,application_id,criterion' }
      )
    }
    setSaving(false)
    router.refresh()
  }

  const setDecision = async (d: 'retenu' | 'rejete') => {
    setSaving(true)
    await supabase.from('juror_decisions').upsert(
      {
        committee_id: committeeId,
        juror_id: jurorId,
        application_id: application.id,
        decision: d,
      },
      { onConflict: 'committee_id,juror_id,application_id' }
    )
    setSaving(false)
    router.refresh()
  }

  const clearDecision = async () => {
    if (!decision) return
    setSaving(true)
    await supabase.from('juror_decisions').delete().eq('id', decision.id)
    setSaving(false)
    router.refresh()
  }

  const primaryFounder = founders.find(f => f.is_primary)

  return (
    <div className="space-y-6">
      {/* App info */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-3 mb-3">
          {application.logo_url && (
            <img src={application.logo_url} alt="" className="w-12 h-12 rounded-full object-cover border border-gray-200" />
          )}
          <div>
            <h2 className="text-xl font-bold">{application.startup_name}</h2>
            <div className="text-sm text-gray-500">{application.sector} · {application.stage}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{application.description}</p>
          </div>
          <div className="space-y-2">
            {primaryFounder && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Porteur principal</h3>
                <p className="text-gray-700">{primaryFounder.full_name} — {primaryFounder.role}</p>
                <p className="text-xs text-gray-500">{primaryFounder.email}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              {application.website && (
                <a href={application.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                  Site <ExternalLink size={10} />
                </a>
              )}
              {application.linkedin_page && (
                <a href={application.linkedin_page} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                  LinkedIn <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3 bg-white border border-amber-200">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Note moy.</div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-xl font-semibold tabular-nums ${myAvg === null ? 'text-gray-300' : 'text-amber-700'}`}>
              {myAvg === null ? '—' : myAvg.toFixed(1)}
            </span>
            {myAvg !== null && <span className="text-xs text-gray-400">/5</span>}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{ratings.length}/{totalCriteria} critères notés</div>
        </div>
        <div className={`rounded-lg p-3 border ${decision?.decision === 'retenu' ? 'bg-green-50 border-green-200' : decision?.decision === 'rejete' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-[11px] uppercase tracking-wide ${decision?.decision === 'retenu' ? 'text-green-700' : decision?.decision === 'rejete' ? 'text-red-700' : 'text-gray-500'}`}>Décision</div>
              <div className={`text-xl font-semibold mt-1 ${decision?.decision === 'retenu' ? 'text-green-700' : decision?.decision === 'rejete' ? 'text-red-700' : 'text-gray-400'}`}>
                {decision?.decision === 'retenu' ? 'Retenu' : decision?.decision === 'rejete' ? 'Rejeté' : '—'}
              </div>
            </div>
            {decision && (
              <button onClick={clearDecision} className="text-xs text-gray-500 hover:text-red-600 underline">
                Effacer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="space-y-4">
        {RATING_CRITERIA.map((c, idx) => {
          const draft = draftComments[c.key] ?? commentsByCriterion[c.key] ?? ''
          return (
            <div key={c.key} className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3">
                <span className="text-gray-400 mr-1">{idx + 1}.</span>
                {c.label}
              </h3>
              {/* Sub-criteria as evaluation hints */}
              <ul className="space-y-1 mb-3 ml-1">
                {c.sublabels.map((sub, subIdx) => (
                  <li key={subIdx} className="flex items-start gap-2">
                    <span className="text-gray-300 text-xs mt-0.5">•</span>
                    <span className="text-xs text-gray-500">{sub}</span>
                  </li>
                ))}
              </ul>
              {/* One score per criterion */}
              <div className="flex items-center justify-between gap-3 py-2 border-t border-gray-100">
                <span className="text-sm font-medium text-gray-700">Note du jury</span>
                <StarRow value={scoreByCriterion[c.key] ?? null} onChange={(n) => setScore(c.key, n)} size={20} />
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraftComments(prev => ({ ...prev, [c.key]: e.target.value }))}
                onBlur={() => saveComment(c.key, draft)}
                placeholder="Commentaire pour ce critère (optionnel)…"
                rows={2}
                className="mt-3 w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )
        })}
      </div>

      {/* Decision */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 sticky bottom-4 shadow-lg">
        <h3 className="font-semibold text-sm mb-3">Décision du jury</h3>
        <div className="flex gap-3">
          <button
            onClick={() => setDecision('retenu')}
            disabled={saving}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium ${
              decision?.decision === 'retenu'
                ? 'bg-green-600 text-white'
                : 'bg-white border-2 border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            <CheckCircle2 size={18} />
            Retenu
          </button>
          <button
            onClick={() => setDecision('rejete')}
            disabled={saving}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium ${
              decision?.decision === 'rejete'
                ? 'bg-red-600 text-white'
                : 'bg-white border-2 border-red-300 text-red-700 hover:bg-red-50'
            }`}
          >
            <XCircle size={18} />
            Rejeté
          </button>
        </div>
        {saving && <p className="text-xs text-gray-400 mt-2">Enregistrement…</p>}
      </div>
    </div>
  )
}
