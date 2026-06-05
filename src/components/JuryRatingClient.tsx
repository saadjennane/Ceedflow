'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function JuryRatingClient({
  token,
  application,
  founders,
  ratings,
  comments,
  decision,
}: {
  token: string
  application: Application
  founders: Founder[]
  ratings: JurorRating[]
  comments: JurorRatingComment[]
  decision: JurorDecision | null
}) {
  const router = useRouter()
  const [draftComments, setDraftComments] = useState<Partial<Record<RatingCriterionKey, string>>>({})
  const [saving, setSaving] = useState(false)

  const scoresByCriterion = useMemo(() => {
    const map: Partial<Record<RatingCriterionKey, Record<number, number>>> = {}
    for (const r of ratings) {
      if (!map[r.criterion]) map[r.criterion] = {}
      map[r.criterion]![r.sub_index] = r.score
    }
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

  const totalSubCriteria = RATING_CRITERIA.reduce((sum, c) => sum + c.sublabels.length, 0)

  const setScore = async (criterion: RatingCriterionKey, subIndex: number, score: number) => {
    setSaving(true)
    await fetch(`/api/jury/${token}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: application.id,
        criterion,
        sub_index: subIndex,
        score,
      }),
    })
    setSaving(false)
    router.refresh()
  }

  const saveComment = async (criterion: RatingCriterionKey, raw: string) => {
    const text = raw.trim()
    const existing = commentsByCriterion[criterion] || ''
    if (text === existing) return
    setSaving(true)
    await fetch(`/api/jury/${token}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: application.id,
        criterion,
        comment: text,
      }),
    })
    setSaving(false)
    router.refresh()
  }

  const setDecision = async (d: 'retenu' | 'rejete') => {
    setSaving(true)
    await fetch(`/api/jury/${token}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: application.id, decision: d }),
    })
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
      <div className="grid grid-cols-3 gap-3">
        <ScoreCard label="Ma note" value={myAvg} sub={`${ratings.length}/${totalSubCriteria} sous-critères`} highlight />
        <ScoreCard
          label="Sous-critères restants"
          value={null}
          sub={`${totalSubCriteria - ratings.length} à noter`}
          numText={String(totalSubCriteria - ratings.length)}
        />
        <DecisionCard decision={decision?.decision || null} />
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
              <div className="space-y-2">
                {c.sublabels.map((sub, subIdx) => {
                  const score = scoresByCriterion[c.key]?.[subIdx] ?? null
                  return (
                    <div key={subIdx} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="flex-1 flex items-start gap-2">
                        <span className="text-gray-300 text-xs mt-0.5">•</span>
                        <span className="text-xs text-gray-700">{sub}</span>
                      </div>
                      <StarRow
                        value={score}
                        onChange={(n) => setScore(c.key, subIdx, n)}
                        size={16}
                      />
                    </div>
                  )
                })}
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
        <h3 className="font-semibold text-sm mb-3">Ta décision</h3>
        <p className="text-xs text-gray-500 mb-3">
          Si un seul jury rejette le dossier, il est rejeté. Il faut l&apos;unanimité « Retenu » pour qu&apos;il soit retenu.
        </p>
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

function ScoreCard({
  label,
  value,
  sub,
  highlight = false,
  numText,
}: {
  label: string
  value: number | null
  sub: string
  highlight?: boolean
  numText?: string
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-white border border-amber-200' : 'bg-white border border-gray-200'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={`text-xl font-semibold tabular-nums ${value === null && !numText ? 'text-gray-300' : highlight ? 'text-amber-700' : 'text-gray-800'}`}>
          {numText !== undefined ? numText : value === null ? '—' : value.toFixed(1)}
        </span>
        {value !== null && <span className="text-xs text-gray-400">/5</span>}
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}

function DecisionCard({ decision }: { decision: 'retenu' | 'rejete' | null }) {
  if (decision === 'retenu') {
    return (
      <div className="rounded-lg p-3 bg-green-50 border border-green-200">
        <div className="text-[11px] uppercase tracking-wide text-green-700">Ma décision</div>
        <div className="text-xl font-semibold text-green-700 mt-1">Retenu</div>
      </div>
    )
  }
  if (decision === 'rejete') {
    return (
      <div className="rounded-lg p-3 bg-red-50 border border-red-200">
        <div className="text-[11px] uppercase tracking-wide text-red-700">Ma décision</div>
        <div className="text-xl font-semibold text-red-700 mt-1">Rejeté</div>
      </div>
    )
  }
  return (
    <div className="rounded-lg p-3 bg-gray-50 border border-gray-200">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">Ma décision</div>
      <div className="text-xl font-semibold text-gray-400 mt-1">—</div>
    </div>
  )
}
