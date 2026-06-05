'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Star, ChevronDown, ChevronRight } from 'lucide-react'
import type { ApplicationRating, AdminUser, RatingCriterionKey } from '@/lib/types'
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

function StarDisplay({ value, size = 12 }: { value: number | null; size?: number }) {
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

export default function RatingGrid({
  applicationId,
  ratings,
  adminUsers,
  currentUserId,
}: {
  applicationId: string
  ratings: ApplicationRating[]
  adminUsers: AdminUser[]
  currentUserId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [expandedRaterId, setExpandedRaterId] = useState<string | null>(null)
  const [draftComments, setDraftComments] = useState<Record<string, string>>({})

  const myRatings = useMemo(
    () => ratings.filter(r => r.admin_id === currentUserId),
    [ratings, currentUserId]
  )

  const myByCriterion = useMemo(() => {
    const map: Partial<Record<RatingCriterionKey, ApplicationRating>> = {}
    for (const r of myRatings) map[r.criterion] = r
    return map
  }, [myRatings])

  const stats = useMemo(() => computeRatingStats(ratings), [ratings])

  const myAvg = useMemo(() => {
    if (myRatings.length === 0) return null
    return myRatings.reduce((a, b) => a + b.score, 0) / myRatings.length
  }, [myRatings])

  const otherRaters = useMemo(() => {
    const ids = Array.from(new Set(ratings.map(r => r.admin_id))).filter(id => id !== currentUserId)
    return ids.map(id => ({ id, name: getAdminName(adminUsers, id), avg: stats.perAdminAvg[id] }))
  }, [ratings, adminUsers, stats, currentUserId])

  const upsertScore = async (criterion: RatingCriterionKey, score: number) => {
    const existing = myByCriterion[criterion]
    await supabase
      .from('application_ratings')
      .upsert(
        {
          application_id: applicationId,
          admin_id: currentUserId,
          criterion,
          score,
          comment: existing?.comment ?? null,
        },
        { onConflict: 'application_id,admin_id,criterion' }
      )
    router.refresh()
  }

  const saveComment = async (criterion: RatingCriterionKey, comment: string) => {
    const existing = myByCriterion[criterion]
    if (!existing && comment.trim() === '') return
    if (existing && (existing.comment || '') === comment) return

    if (!existing) {
      return
    }

    await supabase
      .from('application_ratings')
      .update({ comment: comment.trim() || null })
      .eq('id', existing.id)
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold">Rating</h2>
        <div className="flex items-center gap-3 text-sm">
          {stats.overallAvg !== null ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 text-xs">Team avg</span>
                <StarDisplay value={stats.overallAvg} size={14} />
                <span className="font-medium text-amber-700">{stats.overallAvg.toFixed(1)}</span>
                <span className="text-xs text-gray-400">({stats.raterCount} rater{stats.raterCount > 1 ? 's' : ''})</span>
              </div>
            </>
          ) : (
            <span className="text-xs text-gray-400">Not rated yet</span>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">Note this application against each criterion. Hover to preview, click a star to save.</p>

      {/* Your grid */}
      <div className="space-y-4">
        {RATING_CRITERIA.map((c, idx) => {
          const mine = myByCriterion[c.key]
          const teamAvg = stats.perCriterionAvg[c.key]
          const commentKey = c.key
          const currentDraft = draftComments[commentKey] ?? mine?.comment ?? ''

          return (
            <div key={c.key} className="border-l-2 border-gray-100 pl-3">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-800">
                    <span className="text-gray-400 mr-1">{idx + 1}.</span>
                    {c.label}
                  </h3>
                  <ul className="mt-1 space-y-0.5">
                    {c.sublabels.map((s, i) => (
                      <li key={i} className="text-xs text-gray-500 flex gap-1">
                        <span className="text-gray-300">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <StarRow
                    value={mine?.score ?? null}
                    onChange={(n) => upsertScore(c.key, n)}
                  />
                  {teamAvg !== null && (
                    <span className="text-[11px] text-gray-400">
                      Team: {teamAvg.toFixed(1)}/5
                    </span>
                  )}
                </div>
              </div>
              <textarea
                value={currentDraft}
                onChange={(e) => setDraftComments(prev => ({ ...prev, [commentKey]: e.target.value }))}
                onBlur={() => saveComment(c.key, currentDraft)}
                placeholder={mine ? 'Comment (optional)…' : 'Rate first, then you can comment…'}
                disabled={!mine}
                rows={1}
                className="mt-2 w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed resize-none"
              />
            </div>
          )
        })}
      </div>

      {/* Your overall */}
      {myAvg !== null && (
        <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <span className="text-gray-500">Your average</span>
          <div className="flex items-center gap-2">
            <StarDisplay value={myAvg} size={14} />
            <span className="font-medium">{myAvg.toFixed(1)}/5</span>
          </div>
        </div>
      )}

      {/* Team breakdown */}
      {otherRaters.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Other raters</h4>
          <div className="space-y-1">
            {otherRaters.map(rater => {
              const isOpen = expandedRaterId === rater.id
              const theirRatings = ratings.filter(r => r.admin_id === rater.id)
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
                    <div className="px-3 pb-3 pt-1 space-y-2">
                      {RATING_CRITERIA.map(c => {
                        const r = theirRatings.find(x => x.criterion === c.key)
                        if (!r) return null
                        return (
                          <div key={c.key} className="text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-700">{c.label}</span>
                              <div className="flex items-center gap-1">
                                <StarDisplay value={r.score} size={11} />
                                <span className="text-gray-500">{r.score}/5</span>
                              </div>
                            </div>
                            {r.comment && (
                              <p className="text-gray-500 italic mt-0.5 pl-1 border-l border-gray-200">{r.comment}</p>
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
  )
}
