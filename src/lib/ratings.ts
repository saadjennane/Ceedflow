import type { ApplicationRating, RatingCriterionKey } from './types'
import { RATING_CRITERIA } from './types'

export interface RatingStats {
  overallAvg: number | null
  raterCount: number
  perCriterionAvg: Record<RatingCriterionKey, number | null>
  perAdminAvg: Record<string, number>
}

export function computeRatingStats(ratings: ApplicationRating[] | undefined | null): RatingStats {
  const empty = RATING_CRITERIA.reduce((acc, c) => {
    acc[c.key] = null
    return acc
  }, {} as Record<RatingCriterionKey, number | null>)

  if (!ratings || ratings.length === 0) {
    return { overallAvg: null, raterCount: 0, perCriterionAvg: empty, perAdminAvg: {} }
  }

  const perCriterion: Record<string, number[]> = {}
  const perAdmin: Record<string, number[]> = {}

  for (const r of ratings) {
    (perCriterion[r.criterion] ||= []).push(r.score);
    (perAdmin[r.admin_id] ||= []).push(r.score)
  }

  const perCriterionAvg = { ...empty }
  for (const c of RATING_CRITERIA) {
    const arr = perCriterion[c.key]
    perCriterionAvg[c.key] = arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  }

  const perAdminAvg: Record<string, number> = {}
  for (const adminId of Object.keys(perAdmin)) {
    const arr = perAdmin[adminId]
    perAdminAvg[adminId] = arr.reduce((a, b) => a + b, 0) / arr.length
  }

  const overallAvg = ratings.reduce((a, b) => a + b.score, 0) / ratings.length

  return {
    overallAvg,
    raterCount: Object.keys(perAdmin).length,
    perCriterionAvg,
    perAdminAvg,
  }
}
