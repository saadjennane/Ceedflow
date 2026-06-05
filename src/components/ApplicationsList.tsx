'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Download, Filter, LayoutList, LayoutGrid, FileText, User, Trash2, X, Star } from 'lucide-react'
import type { Application, ApplicationStatus, Sector, Stage, Priority, AdminUser } from '@/lib/types'
import { computeRatingStats } from '@/lib/ratings'
import RatingPill from './RatingPill'
import KanbanBoard from './KanbanBoard'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

const STATUSES: ApplicationStatus[] = ['New', 'Very interesting', 'Interesting', 'Average', 'Not interesting']
const SECTORS: Sector[] = [
  'Tourism Tech', 'Gaming', 'AI', 'Fintech', 'Health',
  'E-commerce', 'EdTech', 'CleanTech', 'AgriTech', 'PropTech',
  'MedTech', 'Logistics', 'SaaS', 'Marketplace', 'IoT',
  'Cybersecurity', 'RetailTech', 'Other',
]
const STAGES: Stage[] = ['Idea', 'Prototype', 'MVP', 'Product launched', 'Traction']
const PRIORITIES: Priority[] = ['High', 'Normal', 'Low']

const statusColors: Record<ApplicationStatus, string> = {
  'New': 'bg-blue-100 text-blue-800',
  'Very interesting': 'bg-green-100 text-green-800',
  'Interesting': 'bg-emerald-100 text-emerald-800',
  'Average': 'bg-yellow-100 text-yellow-800',
  'Not interesting': 'bg-gray-100 text-gray-600',
}

const priorityColors: Record<Priority, string> = {
  'High': 'bg-red-100 text-red-800',
  'Normal': 'bg-gray-100 text-gray-700',
  'Low': 'bg-gray-50 text-gray-500',
}

function AdminAvatar({ adminUsers, adminId }: { adminUsers: AdminUser[]; adminId?: string }) {
  if (!adminId) return <span className="text-gray-300">—</span>
  const user = adminUsers.find(u => u.id === adminId)
  if (!user) return <span className="text-gray-300">—</span>
  const initials = `${(user.first_name?.[0] || user.email[0]).toUpperCase()}${(user.last_name?.[0] || '').toUpperCase()}`
  const name = user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : user.email
  return (
    <div className="flex items-center gap-1.5" title={name}>
      <div className="w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center text-[10px] font-medium">
        {initials}
      </div>
    </div>
  )
}

export default function ApplicationsList({ applications, adminUsers, currentUserId }: { applications: Application[]; adminUsers: AdminUser[]; currentUserId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterMinRating, setFilterMinRating] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'rating'>('date')
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [groupBy, setGroupBy] = useState<'status' | 'assignee'>('status')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const ratingByApp = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeRatingStats>>()
    for (const app of applications) {
      map.set(app.id, computeRatingStats(app.application_ratings))
    }
    return map
  }, [applications])

  const filtered = useMemo(() => {
    const minRating = filterMinRating ? parseFloat(filterMinRating) : 0
    const result = applications.filter(app => {
      const searchLower = search.toLowerCase()
      const matchesSearch = !search ||
        app.startup_name.toLowerCase().includes(searchLower) ||
        app.founders?.some(f => f.email.toLowerCase().includes(searchLower))

      const matchesStatus = !filterStatus || app.status === filterStatus
      const matchesSector = !filterSector || app.sector === filterSector
      const matchesStage = !filterStage || app.stage === filterStage
      const matchesPriority = !filterPriority || app.priority === filterPriority

      const avg = ratingByApp.get(app.id)?.overallAvg ?? 0
      const matchesRating = minRating === 0 || avg >= minRating

      return matchesSearch && matchesStatus && matchesSector && matchesStage && matchesPriority && matchesRating
    })

    if (sortBy === 'rating') {
      result.sort((a, b) => {
        const aAvg = ratingByApp.get(a.id)?.overallAvg ?? -1
        const bAvg = ratingByApp.get(b.id)?.overallAvg ?? -1
        return bAvg - aAvg
      })
    }

    return result
  }, [applications, search, filterStatus, filterSector, filterStage, filterPriority, filterMinRating, sortBy, ratingByApp])

  const exportCSV = () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterSector) params.set('sector', filterSector)
    if (filterStage) params.set('stage', filterStage)
    if (filterPriority) params.set('priority', filterPriority)

    window.open(`/api/applications/export?${params.toString()}`, '_blank')
  }

  const updateField = async (appId: string, field: string, value: string, oldValue: string) => {
    if (value === oldValue) return
    await supabase.from('applications').update({ [field]: value }).eq('id', appId)
    await supabase.from('activity_log').insert({
      application_id: appId,
      actor_user_id: currentUserId,
      action_type: `${field}_changed`,
      old_value: oldValue,
      new_value: value,
    })
    router.refresh()
  }

  const visibleSelectedIds = useMemo(
    () => filtered.map(a => a.id).filter(id => selectedIds.has(id)),
    [filtered, selectedIds]
  )
  const allSelected = filtered.length > 0 && visibleSelectedIds.length === filtered.length
  const someSelected = visibleSelectedIds.length > 0

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(a => a.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const bulkUpdateField = async (field: 'status' | 'priority', value: string) => {
    const ids = visibleSelectedIds
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const oldValues = new Map(
      applications
        .filter(a => idSet.has(a.id))
        .map(a => [a.id, field === 'status' ? a.status : a.priority])
    )
    await supabase.from('applications').update({ [field]: value }).in('id', ids)
    const logs = ids
      .filter(id => oldValues.get(id) !== value)
      .map(id => ({
        application_id: id,
        actor_user_id: currentUserId,
        action_type: `${field}_changed`,
        old_value: oldValues.get(id) ?? null,
        new_value: value,
      }))
    if (logs.length > 0) await supabase.from('activity_log').insert(logs)
    clearSelection()
    router.refresh()
  }

  const bulkSoftDelete = async () => {
    const ids = visibleSelectedIds
    if (ids.length === 0) return
    setBulkDeleting(true)
    const results = await Promise.all(
      ids.map(id =>
        fetch(`/api/applications/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'soft-delete' }),
        })
      )
    )
    const failed = results.filter(r => !r.ok)
    setBulkDeleting(false)
    setShowBulkDeleteConfirm(false)
    if (failed.length > 0) {
      alert(`Failed to delete ${failed.length} application${failed.length > 1 ? 's' : ''}.`)
    }
    clearSelection()
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Applications</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{filtered.length} applications</span>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title="List view"
            >
              <LayoutList size={16} />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 ${viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title="Kanban view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'rating')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2"
            title="Sort"
          >
            <option value="date">Sort: Newest</option>
            <option value="rating">Sort: Top rated</option>
          </select>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'status' | 'assignee')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="status">Group by Status</option>
            <option value="assignee">Group by Assigned</option>
          </select>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by startup name or founder email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border rounded-lg ${
              showFilters ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter size={16} />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 bg-white border border-gray-200 rounded-lg">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterSector}
              onChange={(e) => setFilterSector(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="">All Sectors</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="">All Stages</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterMinRating}
              onChange={(e) => setFilterMinRating(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="">Min rating: any</option>
              <option value="2">★ 2+</option>
              <option value="3">★ 3+</option>
              <option value="3.5">★ 3.5+</option>
              <option value="4">★ 4+</option>
              <option value="4.5">★ 4.5+</option>
            </select>
            <button
              onClick={() => {
                setFilterStatus('')
                setFilterSector('')
                setFilterStage('')
                setFilterPriority('')
                setFilterMinRating('')
              }}
              className="text-sm text-gray-500 hover:text-blue-700 underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {viewMode === 'list' && visibleSelectedIds.length > 0 && (
        <div className="mb-3 flex items-center gap-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-900">{visibleSelectedIds.length} selected</span>
          <div className="h-4 w-px bg-blue-200" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Set status</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) bulkUpdateField('status', e.target.value) }}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white"
            >
              <option value="">—</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Set priority</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) bulkUpdateField('priority', e.target.value) }}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white"
            >
              <option value="">—</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              title="Clear selection"
            >
              <X size={14} />
              Clear
            </button>
          </div>
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Startup</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Founder</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sector</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-20" title="Team rating"><Star size={14} /></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-10" title="Assigned"><User size={14} /></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-10" title="Documents"><FileText size={14} /></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500">
                      No applications found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((app) => (
                    <tr
                      key={app.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedIds.has(app.id) ? 'bg-blue-50/50' : ''}`}
                      onClick={() => router.push(`/admin/applications/${app.id}`)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(app.id)}
                          onChange={() => toggleOne(app.id)}
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                          aria-label={`Select ${app.startup_name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium text-black">
                          {app.logo_url && (
                            <img src={app.logo_url} alt="" className="w-6 h-6 rounded-full object-cover border border-gray-200" />
                          )}
                          {app.startup_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {app.founders?.[0]?.full_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{app.sector}</td>
                      <td className="px-4 py-3 text-gray-600">{app.stage}</td>
                      <td className="px-4 py-3">
                        <select
                          value={app.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateField(app.id, 'status', e.target.value, app.status)}
                          className={`appearance-none cursor-pointer px-3 py-0.5 rounded-full text-xs font-medium border-0 text-center focus:ring-2 focus:ring-blue-500 ${statusColors[app.status]}`}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={app.priority}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateField(app.id, 'priority', e.target.value, app.priority)}
                          className={`appearance-none cursor-pointer px-3 py-0.5 rounded-full text-xs font-medium border-0 text-center focus:ring-2 focus:ring-blue-500 ${priorityColors[app.priority]}`}
                        >
                          {PRIORITIES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const s = ratingByApp.get(app.id)
                          return <RatingPill avg={s?.overallAvg ?? null} count={s?.raterCount ?? 0} />
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <AdminAvatar adminUsers={adminUsers} adminId={app.assigned_admin_id} />
                      </td>
                      <td className="px-4 py-3">
                        {app.documents && app.documents.length > 0 ? (
                          <span className="flex items-center gap-1 text-gray-500" title={`${app.documents.length} document(s)`}>
                            <FileText size={14} />
                            <span className="text-xs">{app.documents.length}</span>
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(app.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <KanbanBoard applications={filtered} adminUsers={adminUsers} groupBy={groupBy} onStatusChange={(appId, newStatus, oldStatus) => updateField(appId, 'status', newStatus, oldStatus)} />
      )}

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Move {visibleSelectedIds.length} application{visibleSelectedIds.length > 1 ? 's' : ''} to trash?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              The selected application{visibleSelectedIds.length > 1 ? 's' : ''} will be moved to trash. You can restore {visibleSelectedIds.length > 1 ? 'them' : 'it'} later from Settings.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={bulkSoftDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 size={14} />
                {bulkDeleting ? 'Deleting...' : 'Move to trash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
