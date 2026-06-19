import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  EmailCampaignAudience, ApplicationCampaignFilters, JurorCampaignFilters,
  CommitteeDecision, RatingCriterionKey,
} from '@/lib/types'

export interface AudienceRecipient {
  id: string
  email: string
  name: string
  subtitle: string // e.g. startup name or role
  do_not_contact: boolean
}

/**
 * POST /api/admin/campaigns/audience
 * Body: { audience_type, filters }
 * Returns: { recipients: AudienceRecipient[] }
 *
 * Resolves the filter object into a list of eligible recipients.
 * Always excludes do_not_contact unless `includeOptedOut` is true.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const audienceType = body.audience_type as EmailCampaignAudience
  const filters = body.filters || {}
  const includeOptedOut = !!body.includeOptedOut

  if (audienceType === 'application') {
    return NextResponse.json({ recipients: await resolveApplicationAudience(supabase, filters, includeOptedOut) })
  }
  if (audienceType === 'juror') {
    return NextResponse.json({ recipients: await resolveJurorAudience(supabase, filters, includeOptedOut) })
  }
  return NextResponse.json({ error: 'audience_type invalide' }, { status: 400 })
}

type SupabaseSrv = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function resolveApplicationAudience(
  supabase: SupabaseSrv,
  f: ApplicationCampaignFilters,
  includeOptedOut: boolean,
): Promise<AudienceRecipient[]> {
  let query = supabase
    .from('applications')
    .select('id, startup_name, status, priority, sector, stage, source, do_not_contact, created_at, founders(full_name, email, is_primary)')
    .is('deleted_at', null)

  if (f.status) query = query.eq('status', f.status)
  if (f.priority) query = query.eq('priority', f.priority)
  if (f.sector) query = query.eq('sector', f.sector)
  if (f.stage) query = query.eq('stage', f.stage)
  if (f.source) query = query.eq('source', f.source)
  if (!includeOptedOut) query = query.eq('do_not_contact', false)

  const { data: apps, error } = await query
  if (error || !apps) return []

  type AppRow = {
    id: string; startup_name: string; do_not_contact: boolean;
    founders: { full_name: string; email: string; is_primary: boolean }[]
  }
  let rows = apps as unknown as AppRow[]

  // Filter on rating threshold
  if (typeof f.minAvgRating === 'number' && f.minAvgRating > 0) {
    const ids = rows.map(r => r.id)
    const { data: ratings } = await supabase
      .from('application_ratings')
      .select('application_id, criterion, score')
      .in('application_id', ids)
    type RatingRow = { application_id: string; criterion: RatingCriterionKey; score: number }
    const byApp = new Map<string, number[]>()
    for (const r of (ratings || []) as RatingRow[]) {
      if (!byApp.has(r.application_id)) byApp.set(r.application_id, [])
      byApp.get(r.application_id)!.push(r.score)
    }
    rows = rows.filter(r => {
      const scores = byApp.get(r.id) || []
      if (scores.length === 0) return false
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      return avg >= (f.minAvgRating ?? 0)
    })
  }

  // Filter on committee decision
  if (f.committeeDecision && f.committeeDecision !== 'any') {
    const ids = rows.map(r => r.id)
    const { data: committeeApps } = await supabase
      .from('committee_applications')
      .select('application_id, admin_override_decision, committee_id')
      .in('application_id', ids)
    type CARow = { application_id: string; admin_override_decision: CommitteeDecision | null; committee_id: string }
    const decisions = new Map<string, CommitteeDecision[]>()
    for (const ca of (committeeApps || []) as CARow[]) {
      if (!decisions.has(ca.application_id)) decisions.set(ca.application_id, [])
      if (ca.admin_override_decision) decisions.get(ca.application_id)!.push(ca.admin_override_decision)
    }
    rows = rows.filter(r => {
      const ds = decisions.get(r.id) || []
      switch (f.committeeDecision) {
        case 'retenu': return ds.includes('retenu')
        case 'rejete': return ds.includes('rejete')
        case 'pending': return committeeApps?.some((ca) => (ca as CARow).application_id === r.id && !(ca as CARow).admin_override_decision) || false
        case 'none': return !(committeeApps?.some((ca) => (ca as CARow).application_id === r.id))
        default: return true
      }
    })
  }

  // Filter on tags
  if (f.tagIds && f.tagIds.length > 0) {
    const ids = rows.map(r => r.id)
    const { data: assignments } = await supabase
      .from('application_tag_assignments')
      .select('application_id, tag_id')
      .in('application_id', ids)
      .in('tag_id', f.tagIds)
    type AssignRow = { application_id: string; tag_id: string }
    const tagsByApp = new Map<string, Set<string>>()
    for (const a of (assignments || []) as AssignRow[]) {
      if (!tagsByApp.has(a.application_id)) tagsByApp.set(a.application_id, new Set())
      tagsByApp.get(a.application_id)!.add(a.tag_id)
    }
    rows = rows.filter(r => {
      const set = tagsByApp.get(r.id) || new Set()
      return f.tagIds!.every(t => set.has(t))
    })
  }

  return rows
    .map(r => {
      const primary = r.founders?.find(f => f.is_primary) || r.founders?.[0]
      if (!primary?.email) return null
      return {
        id: r.id,
        email: primary.email,
        name: primary.full_name,
        subtitle: r.startup_name,
        do_not_contact: r.do_not_contact,
      } as AudienceRecipient
    })
    .filter((r): r is AudienceRecipient => r !== null)
}

async function resolveJurorAudience(
  supabase: SupabaseSrv,
  f: JurorCampaignFilters,
  includeOptedOut: boolean,
): Promise<AudienceRecipient[]> {
  let query = supabase
    .from('jurors')
    .select('id, first_name, last_name, email, role, do_not_contact')

  if (f.roleQuery && f.roleQuery.trim()) query = query.ilike('role', `%${f.roleQuery.trim()}%`)
  if (!includeOptedOut) query = query.eq('do_not_contact', false)

  const { data: jurors, error } = await query
  if (error || !jurors) return []

  type JurorRow = { id: string; first_name: string; last_name: string; email: string; role: string | null; do_not_contact: boolean }
  let rows = jurors as JurorRow[]

  if (f.onlyInActiveCommittee) {
    const { data: cjs } = await supabase
      .from('committee_jurors')
      .select('juror_id, committees!inner(status)')
      .eq('committees.status', 'active')
    type CJRow = { juror_id: string }
    const activeIds = new Set((cjs || []).map(c => (c as CJRow).juror_id))
    rows = rows.filter(r => activeIds.has(r.id))
  }

  return rows.filter(r => !!r.email).map(r => ({
    id: r.id,
    email: r.email,
    name: `${r.first_name} ${r.last_name}`.trim(),
    subtitle: r.role || '',
    do_not_contact: r.do_not_contact,
  }))
}
