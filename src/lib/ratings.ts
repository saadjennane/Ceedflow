import type { ApplicationRating, RatingCriterionKey } from './types'
import { RATING_CRITERIA } from './types'

export interface RatingStats {
  globalAvg: number | null
  globalRaterCount: number
  myAvg: number | null
  myScoreCount: number
  othersAvg: number | null
  othersRaterCount: number
  perCriterionGlobalAvg: Record<RatingCriterionKey, number | null>
  perAdminAvg: Record<string, number>
  // Backwards-compat aliases for the table/Kanban pill
  overallAvg: number | null
  raterCount: number
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

export function computeRatingStats(
  ratings: ApplicationRating[] | undefined | null,
  currentUserId?: string,
): RatingStats {
  const emptyPerCriterion = RATING_CRITERIA.reduce((acc, c) => {
    acc[c.key] = null
    return acc
  }, {} as Record<RatingCriterionKey, number | null>)

  if (!ratings || ratings.length === 0) {
    return {
      globalAvg: null,
      globalRaterCount: 0,
      myAvg: null,
      myScoreCount: 0,
      othersAvg: null,
      othersRaterCount: 0,
      perCriterionGlobalAvg: emptyPerCriterion,
      perAdminAvg: {},
      overallAvg: null,
      raterCount: 0,
    }
  }

  const allScores: number[] = []
  const mineScores: number[] = []
  const otherScores: number[] = []
  const otherAdmins = new Set<string>()
  const adminGroups: Record<string, number[]> = {}
  const criterionGroups: Record<string, number[]> = {}
  const globalAdmins = new Set<string>()

  for (const r of ratings) {
    allScores.push(r.score)
    globalAdmins.add(r.admin_id);
    (adminGroups[r.admin_id] ||= []).push(r.score);
    (criterionGroups[r.criterion] ||= []).push(r.score)
    if (currentUserId && r.admin_id === currentUserId) {
      mineScores.push(r.score)
    } else {
      otherScores.push(r.score)
      otherAdmins.add(r.admin_id)
    }
  }

  const perCriterionGlobalAvg = { ...emptyPerCriterion }
  for (const c of RATING_CRITERIA) {
    perCriterionGlobalAvg[c.key] = avg(criterionGroups[c.key] || [])
  }

  const perAdminAvg: Record<string, number> = {}
  for (const id of Object.keys(adminGroups)) {
    const a = avg(adminGroups[id])
    if (a !== null) perAdminAvg[id] = a
  }

  const globalAvg = avg(allScores)

  return {
    globalAvg,
    globalRaterCount: globalAdmins.size,
    myAvg: avg(mineScores),
    myScoreCount: mineScores.length,
    othersAvg: avg(otherScores),
    othersRaterCount: otherAdmins.size,
    perCriterionGlobalAvg,
    perAdminAvg,
    overallAvg: globalAvg,
    raterCount: globalAdmins.size,
  }
}
