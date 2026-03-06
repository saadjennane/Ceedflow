'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Search, Download, Filter, LayoutList, LayoutGrid, FileText, User } from 'lucide-react'
import type { Application, ApplicationStatus, Sector, Stage, Priority, AdminUser } from '@/lib/types'
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
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [groupBy, setGroupBy] = useState<'status' | 'assignee'>('status')

  const filtered = useMemo(() => {
    return applications.filter(app => {
      const searchLower = search.toLowerCase()
      const matchesSearch = !search ||
        app.startup_name.toLowerCase().includes(searchLower) ||
        app.founders?.some(f => f.email.toLowerCase().includes(searchLower))

      const matchesStatus = !filterStatus || app.status === filterStatus
      const matchesSector = !filterSector || app.sector === filterSector
      const matchesStage = !filterStage || app.stage === filterStage
      const matchesPriority = !filterPriority || app.priority === filterPriority

      return matchesSearch && matchesStatus && matchesSector && matchesStage && matchesPriority
    })
  }, [applications, search, filterStatus, filterSector, filterStage, filterPriority])

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
            <button
              onClick={() => {
                setFilterStatus('')
                setFilterSector('')
                setFilterStage('')
                setFilterPriority('')
              }}
              className="text-sm text-gray-500 hover:text-blue-700 underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Startup</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Founder</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sector</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-10" title="Assigned"><User size={14} /></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-10" title="Documents"><FileText size={14} /></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500">
                      No applications found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((app) => (
                    <tr key={app.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/applications/${app.id}`)}>
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
    </div>
  )
}
