'use client'

import { useMemo, useState } from 'react'
import { Star, Pencil } from 'lucide-react'
import type { ApplicationRating, ApplicationRatingComment, AdminUser } from '@/lib/types'
import { computeRatingStats } from '@/lib/ratings'
import RatingModal from './RatingModal'

function StarDisplay({ value, size = 14 }: { value: number | null; size?: number }) {
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
  comments,
  adminUsers,
  currentUserId,
}: {
  applicationId: string
  ratings: ApplicationRating[]
  comments: ApplicationRatingComment[]
  adminUsers: AdminUser[]
  currentUserId: string
}) {
  const [open, setOpen] = useState(false)
  const stats = useMemo(() => computeRatingStats(ratings, currentUserId), [ratings, currentUserId])

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Notation</h2>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Pencil size={14} />
            {stats.myScoreCount > 0 ? 'Modifier ma note' : 'Noter ce dossier'}
          </button>
        </div>

        <div className="space-y-2">
          <RatingLine
            label="Ma note"
            value={stats.myAvg}
            sub={stats.myScoreCount > 0 ? `${stats.myScoreCount} sous-critères notés` : 'Pas encore noté'}
            emphasized
          />
          <RatingLine
            label="Autres admins"
            value={stats.othersAvg}
            sub={
              stats.othersRaterCount > 0
                ? `${stats.othersRaterCount} admin${stats.othersRaterCount > 1 ? 's' : ''}`
                : 'Personne'
            }
          />
          <div className="border-t border-gray-100 pt-2">
            <RatingLine
              label="Moyenne globale"
              value={stats.globalAvg}
              sub={
                stats.globalRaterCount > 0
                  ? `${stats.globalRaterCount} évaluateur${stats.globalRaterCount > 1 ? 's' : ''}`
                  : '—'
              }
              emphasized
            />
          </div>
        </div>
      </div>

      {open && (
        <RatingModal
          applicationId={applicationId}
          ratings={ratings}
          comments={comments}
          adminUsers={adminUsers}
          currentUserId={currentUserId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function RatingLine({
  label,
  value,
  sub,
  emphasized = false,
}: {
  label: string
  value: number | null
  sub: string
  emphasized?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className={emphasized ? 'text-sm font-medium' : 'text-sm text-gray-700'}>{label}</div>
        <div className="text-[11px] text-gray-400">{sub}</div>
      </div>
      <div className="flex items-center gap-2">
        <StarDisplay value={value} size={12} />
        <span className={`text-sm tabular-nums ${value === null ? 'text-gray-300' : emphasized ? 'font-semibold text-amber-700' : 'text-gray-700'}`}>
          {value === null ? '—' : `${value.toFixed(1)}/5`}
        </span>
      </div>
    </div>
  )
}
