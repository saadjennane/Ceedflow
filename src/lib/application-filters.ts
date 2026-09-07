import type { SupabaseClient } from '@supabase/supabase-js'
import { computeRatingStats } from '@/lib/ratings'
import type { Application, Founder, ApplicationRating } from '@/lib/types'

export interface ApplicationExportFilters {
  status?: string | null
  sector?: string | null
  stage?: string | null
  priority?: string | null
  q?: string | null
  minRating?: string | null
  tagIds?: string[]
}

export function readFiltersFromParams(searchParams: URLSearchParams): ApplicationExportFilters {
  const tagIds = searchParams.getAll('tag')
  return {
    status: searchParams.get('status'),
    sector: searchParams.get('sector'),
    stage: searchParams.get('stage'),
    priority: searchParams.get('priority'),
    q: searchParams.get('q'),
    minRating: searchParams.get('minRating'),
    tagIds: tagIds.length ? tagIds : undefined,
  }
}

type AppRow = Application & {
  founders?: Founder[]
  application_ratings?: ApplicationRating[]
}

/**
 * Fetch and filter applications applying the exact same rules as the list UI:
 * DB-side filters (status/sector/stage/priority + deleted_at IS NULL) plus
 * in-memory filters for text search, minimum average rating and tag AND-match.
 */
export async function fetchFilteredApplications(
  supabase: SupabaseClient,
  filters: ApplicationExportFilters,
): Promise<AppRow[]> {
  let query = supabase
    .from('applications')
    .select('*, founders(*), application_ratings(*)')
    .is('deleted_at', null)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.sector) query = query.eq('sector', filters.sector)
  if (filters.stage) query = query.eq('stage', filters.stage)
  if (filters.priority) query = query.eq('priority', filters.priority)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  let rows = (data || []) as AppRow[]

  // Text search matches startup_name or any founder email (mirrors ApplicationsList).
  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter(app =>
      app.startup_name.toLowerCase().includes(q) ||
      (app.founders || []).some(f => (f.email || '').toLowerCase().includes(q)),
    )
  }

  // Minimum average rating (skip apps with no ratings).
  if (filters.minRating) {
    const threshold = parseFloat(filters.minRating)
    if (!Number.isNaN(threshold) && threshold > 0) {
      rows = rows.filter(app => {
        const stats = computeRatingStats(app.application_ratings)
        return stats.overallAvg !== null && stats.overallAvg >= threshold
      })
    }
  }

  // Tag AND-match (app must have every selected tag).
  if (filters.tagIds && filters.tagIds.length > 0) {
    const ids = rows.map(r => r.id)
    const { data: assignments } = await supabase
      .from('application_tag_assignments')
      .select('application_id, tag_id')
      .in('application_id', ids)
      .in('tag_id', filters.tagIds)
    type AssignRow = { application_id: string; tag_id: string }
    const byApp = new Map<string, Set<string>>()
    for (const a of (assignments || []) as AssignRow[]) {
      if (!byApp.has(a.application_id)) byApp.set(a.application_id, new Set())
      byApp.get(a.application_id)!.add(a.tag_id)
    }
    rows = rows.filter(r => {
      const set = byApp.get(r.id) || new Set()
      return filters.tagIds!.every(t => set.has(t))
    })
  }

  return rows
}

/** Extract the primary founder for a row, falling back to the first one listed. */
export function pickPrimaryFounder(app: AppRow): Founder | null {
  const founders = app.founders || []
  return founders.find(f => f.is_primary) || founders[0] || null
}
