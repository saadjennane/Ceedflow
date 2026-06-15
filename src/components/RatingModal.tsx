'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Star, X, ChevronDown, ChevronRight } from 'lucide-react'
import type {
  ApplicationRating,
  ApplicationRatingComment,
  AdminUser,
  RatingCriterionKey,
} from '@/lib/types'
import { RATING_CRITERIA } from '@/lib/types'
import { computeRatingStats } from '@/lib/ratings'

function getAdminName(adminUsers: AdminUser[], adminId: string): string {
  const u = adminUsers.find(x => x.id === adminId)
  if (!u) return 'Unknown'
  if (u.first_name || u.last_name) return `${u.first_name || ''} ${u.last_name || ''}`.trim()
  return u.email
}

function getAdminInitials(adminUsers: AdminUser[], adminId: string): string {
  const u = adminUsers.find(x => x.id === adminId)
  if (!u) return '?'
  return `${(u.first_name?.[0] || u.email[0]).toUpperCase()}${(u.last_name?.[0] || '').toUpperCase()}`
}

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
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
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

function StarDisplay({ value, size = 11 }: { value: number | null; size?: number }) {
  if (value === null) return <span className="text-xs text-gray-300">—</span>
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(value) ? 'fill-amber-400 stroke-amber-500' : 'fill-transparent stroke-gray-300'}
        />
      ))}
    </div>
  )
}

export default function RatingModal({
  applicationId,
  ratings,
  comments,
  adminUsers,
  currentUserId,
  onClose,
}: {
  applicationId: string
  ratings: ApplicationRating[]
  comments: ApplicationRatingComment[]
  adminUsers: AdminUser[]
  currentUserId: string
  onClose: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const [draftComments, setDraftComments] = useState<Partial<Record<RatingCriterionKey, string>>>({})
  const [expandedRaterId, setExpandedRaterId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats = useMemo(() => computeRatingStats(ratings, currentUserId), [ratings, currentUserId])

  // Map[criterion] -> ApplicationRating for the current user
  const myScoreByCriterion = useMemo(() => {
    const map: Partial<Record<RatingCriterionKey, ApplicationRating>> = {}
    for (const r of ratings) {
      if (r.admin_id === currentUserId) map[r.criterion] = r
    }
    return map
  }, [ratings, currentUserId])

  const myCommentsByCriterion = useMemo(() => {
    const map: Partial<Record<RatingCriterionKey, ApplicationRatingComment>> = {}
    for (const c of comments) {
      if (c.admin_id === currentUserId) map[c.criterion] = c
    }
    return map
  }, [comments, currentUserId])

  // Per-criterion: my note + team avg
  const perCriterionStats = useMemo(() => {
    const map: Partial<Record<RatingCriterionKey, { myScore: number | null; teamAvg: number | null }>> = {}
    for (const c of RATING_CRITERIA) {
      const all = ratings.filter(r => r.criterion === c.key)
      const mine = all.find(r => r.admin_id === currentUserId)
      const team = all.map(r => r.score)
      map[c.key] = {
        myScore: mine?.score ?? null,
        teamAvg: team.length > 0 ? team.reduce((a, b) => a + b, 0) / team.length : null,
      }
    }
    return map
  }, [ratings, currentUserId])

  const otherRaters = useMemo(() => {
    const ids = Array.from(new Set(ratings.map(r => r.admin_id))).filter(id => id !== currentUserId)
    return ids.map(id => ({ id, name: getAdminName(adminUsers, id), avg: stats.perAdminAvg[id] }))
  }, [ratings, adminUsers, stats, currentUserId])

  const upsertScore = async (criterion: RatingCriterionKey, score: number) => {
    await supabase
      .from('application_ratings')
      .upsert(
        {
          application_id: applicationId,
          admin_id: currentUserId,
          criterion,
          score,
        },
        { onConflict: 'application_id,admin_id,criterion' }
      )
    router.refresh()
  }

  const saveComment = async (criterion: RatingCriterionKey, raw: string) => {
    const text = raw.trim()
    const existing = myCommentsByCriterion[criterion]
    if (existing && existing.comment === text) return
    if (!existing && text === '') return

    if (text === '' && existing) {
      await supabase.from('application_rating_comments').delete().eq('id', existing.id)
    } else {
      await supabase
        .from('application_rating_comments')
        .upsert(
          {
            application_id: applicationId,
            admin_id: currentUserId,
            criterion,
            comment: text,
          },
          { onConflict: 'application_id,admin_id,criterion' }
        )
    }
    router.refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold">Notation du dossier</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Note chaque sous-critère de 1 à 5. Un commentaire optionnel par critère.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* Scoreboard */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50">
          <ScoreCard label="Ma note" value={stats.myAvg} sub={`${stats.myScoreCount} sous-critères`} highlight />
          <ScoreCard label="Autres admins" value={stats.othersAvg} sub={`${stats.othersRaterCount} admin${stats.othersRaterCount > 1 ? 's' : ''}`} />
          <ScoreCard label="Moyenne globale" value={stats.globalAvg} sub={`${stats.globalRaterCount} évaluateur${stats.globalRaterCount > 1 ? 's' : ''}`} highlight />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {RATING_CRITERIA.map((c, idx) => {
            const cstats = perCriterionStats[c.key]
            const currentDraft = draftComments[c.key] ?? myCommentsByCriterion[c.key]?.comment ?? ''

            return (
              <div key={c.key} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h3 className="font-semibold text-sm text-gray-900">
                    <span className="text-gray-400 mr-1">{idx + 1}.</span>
                    {c.label}
                  </h3>
                  <div className="text-right shrink-0">
                    {cstats?.teamAvg !== null && cstats?.teamAvg !== undefined && (
                      <div className="text-[11px] text-gray-500">
                        Équipe: <span className="font-medium">{cstats.teamAvg.toFixed(1)}/5</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-criteria shown as evaluation hints (read-only) */}
                <ul className="space-y-1 mb-3 ml-1">
                  {c.sublabels.map((sub, subIdx) => (
                    <li key={subIdx} className="flex items-start gap-2">
                      <span className="text-gray-300 text-xs mt-0.5">•</span>
                      <span className="text-xs text-gray-500">{sub}</span>
                    </li>
                  ))}
                </ul>

                {/* One score per criterion */}
                <div className="flex items-center justify-between gap-3 py-2 border-t border-gray-100 mt-2">
                  <span className="text-sm font-medium text-gray-700">Votre note</span>
                  <StarRow value={myScoreByCriterion[c.key]?.score ?? null} onChange={(n) => upsertScore(c.key, n)} size={20} />
                </div>

                <textarea
                  value={currentDraft}
                  onChange={(e) => setDraftComments(prev => ({ ...prev, [c.key]: e.target.value }))}
                  onBlur={() => saveComment(c.key, currentDraft)}
                  placeholder="Commentaire pour ce critère (optionnel)…"
                  rows={2}
                  className="mt-3 w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )
          })}

          {/* Other raters breakdown */}
          {otherRaters.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Détail des autres admins</h4>
              <div className="space-y-1">
                {otherRaters.map(rater => {
                  const isOpen = expandedRaterId === rater.id
                  const theirRatings = ratings.filter(r => r.admin_id === rater.id)
                  const theirComments = comments.filter(c => c.admin_id === rater.id)
                  return (
                    <div key={rater.id} className="border border-gray-100 rounded">
                      <button
                        onClick={() => setExpandedRaterId(isOpen ? null : rater.id)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                          <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center text-[9px] font-medium">
                            {getAdminInitials(adminUsers, rater.id)}
                          </div>
                          <span>{rater.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StarDisplay value={rater.avg} size={12} />
                          <span className="text-xs text-gray-600">{rater.avg.toFixed(1)}/5</span>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 space-y-3">
                          {RATING_CRITERIA.map(c => {
                            const rating = theirRatings.find(r => r.criterion === c.key)
                            const cmt = theirComments.find(x => x.criterion === c.key)
                            if (!rating && !cmt) return null
                            return (
                              <div key={c.key} className="text-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium text-gray-700">{c.label}</span>
                                  {rating && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <StarDisplay value={rating.score} size={11} />
                                      <span className="text-gray-500 tabular-nums">{rating.score}/5</span>
                                    </div>
                                  )}
                                </div>
                                {cmt && (
                                  <p className="text-gray-500 italic pl-2 border-l border-gray-200">{cmt.comment}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function ScoreCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string
  value: number | null
  sub: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-white border border-amber-200' : 'bg-white border border-gray-200'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={`text-xl font-semibold tabular-nums ${value === null ? 'text-gray-300' : highlight ? 'text-amber-700' : 'text-gray-800'}`}>
          {value === null ? '—' : value.toFixed(1)}
        </span>
        {value !== null && <span className="text-xs text-gray-400">/5</span>}
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}
