'use client'

import { useMemo, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { FileText, GripVertical } from 'lucide-react'
import type { Application, ApplicationStatus, Priority, AdminUser } from '@/lib/types'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

const STATUSES: ApplicationStatus[] = ['New', 'Very interesting', 'Interesting', 'Average', 'Not interesting']

const statusColors: Record<ApplicationStatus, string> = {
  'New': 'bg-blue-100 text-blue-800',
  'Very interesting': 'bg-green-100 text-green-800',
  'Interesting': 'bg-emerald-100 text-emerald-800',
  'Average': 'bg-yellow-100 text-yellow-800',
  'Not interesting': 'bg-gray-100 text-gray-600',
}

const columnAccentColors: Record<ApplicationStatus, string> = {
  'New': 'border-t-blue-400',
  'Very interesting': 'border-t-green-400',
  'Interesting': 'border-t-emerald-400',
  'Average': 'border-t-yellow-400',
  'Not interesting': 'border-t-gray-400',
}

const priorityColors: Record<Priority, string> = {
  'High': 'bg-red-100 text-red-800',
  'Normal': 'bg-gray-100 text-gray-700',
  'Low': 'bg-gray-50 text-gray-500',
}

function getAdminInitials(adminUsers: AdminUser[], adminId?: string): string | null {
  if (!adminId) return null
  const user = adminUsers.find(u => u.id === adminId)
  if (!user) return null
  return `${(user.first_name?.[0] || user.email[0]).toUpperCase()}${(user.last_name?.[0] || '').toUpperCase()}`
}

function getAdminName(adminUsers: AdminUser[], adminId?: string): string {
  if (!adminId) return 'Unassigned'
  const user = adminUsers.find(u => u.id === adminId)
  if (!user) return 'Unknown'
  if (user.first_name || user.last_name) return `${user.first_name || ''} ${user.last_name || ''}`.trim()
  return user.email
}

function KanbanCard({
  application,
  adminUsers,
  onDragStart,
  isDragging,
}: {
  application: Application
  adminUsers: AdminUser[]
  onDragStart: (appId: string) => void
  isDragging: boolean
}) {
  const initials = getAdminInitials(adminUsers, application.assigned_admin_id)
  const docCount = application.documents?.length || 0
  const founderName = application.founders?.[0]?.full_name

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        // Set a custom drag image with slight rotation feel
        const el = e.currentTarget
        e.dataTransfer.setDragImage(el, el.offsetWidth / 2, 20)
        onDragStart(application.id)
      }}
      className={`group relative transition-all duration-200 ${
        isDragging
          ? 'opacity-30 scale-95'
          : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <Link
        href={`/admin/applications/${application.id}`}
        className={`block bg-white border rounded-lg p-3 transition-all duration-150 ${
          isDragging
            ? 'border-dashed border-gray-300 bg-gray-50'
            : 'border-gray-200 hover:shadow-md hover:border-gray-300 group-active:shadow-lg group-active:scale-[1.02] group-active:border-blue-300 group-active:ring-2 group-active:ring-blue-100'
        }`}
      >
        <div className="flex items-start gap-2 mb-1">
          <GripVertical size={14} className="text-gray-300 group-hover:text-gray-400 mt-0.5 flex-shrink-0 -ml-1" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {application.logo_url && (
              <img src={application.logo_url} alt="" className="w-5 h-5 rounded-full object-cover border border-gray-200 flex-shrink-0" />
            )}
            <span className="font-medium text-sm truncate">{application.startup_name}</span>
          </div>
        </div>
        {founderName && (
          <div className="text-xs text-gray-500 mb-1.5 pl-5">{founderName}</div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2 pl-5">
          <span>{application.sector}</span>
          <span>&middot;</span>
          <span>{application.stage}</span>
        </div>
        <div className="flex items-center justify-between pl-5">
          <div className="flex items-center gap-2">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[application.priority]}`}>
              {application.priority}
            </span>
            {docCount > 0 && (
              <span className="flex items-center gap-0.5 text-gray-400">
                <FileText size={12} />
                <span className="text-[10px]">{docCount}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {initials && (
              <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center text-[9px] font-medium" title={getAdminName(adminUsers, application.assigned_admin_id)}>
                {initials}
              </div>
            )}
            <span className="text-xs text-gray-400">
              {formatDate(application.created_at)}
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
}

interface KanbanColumn {
  key: string
  label: string
  apps: Application[]
  accentColor: string
  badgeColor: string
}

export default function KanbanBoard({
  applications,
  adminUsers,
  groupBy,
  onStatusChange,
}: {
  applications: Application[]
  adminUsers: AdminUser[]
  groupBy: 'status' | 'assignee'
  onStatusChange?: (appId: string, newStatus: string, oldStatus: string) => void
}) {
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const dragCountRef = useRef<Record<string, number>>({})

  const columns: KanbanColumn[] = useMemo(() => {
    if (groupBy === 'status') {
      return STATUSES.map(status => ({
        key: status,
        label: status,
        apps: applications.filter(app => app.status === status),
        accentColor: columnAccentColors[status],
        badgeColor: statusColors[status],
      }))
    }

    // Group by assignee
    const assigneeIds = new Set<string | undefined>()
    applications.forEach(app => assigneeIds.add(app.assigned_admin_id || undefined))

    const cols: KanbanColumn[] = []

    const unassigned = applications.filter(app => !app.assigned_admin_id)
    if (unassigned.length > 0 || assigneeIds.has(undefined)) {
      cols.push({
        key: 'unassigned',
        label: 'Unassigned',
        apps: unassigned,
        accentColor: 'border-t-gray-400',
        badgeColor: 'bg-gray-100 text-gray-600',
      })
    }

    const accentColors = ['border-t-blue-400', 'border-t-green-400', 'border-t-purple-400', 'border-t-orange-400', 'border-t-pink-400']
    const badgeColors = ['bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-purple-100 text-purple-800', 'bg-orange-100 text-orange-800', 'bg-pink-100 text-pink-800']

    let colorIdx = 0
    adminUsers.forEach(admin => {
      const apps = applications.filter(app => app.assigned_admin_id === admin.id)
      if (apps.length > 0) {
        cols.push({
          key: admin.id,
          label: admin.first_name || admin.last_name ? `${admin.first_name || ''} ${admin.last_name || ''}`.trim() : admin.email,
          apps,
          accentColor: accentColors[colorIdx % accentColors.length],
          badgeColor: badgeColors[colorIdx % badgeColors.length],
        })
        colorIdx++
      }
    })

    return cols
  }, [applications, adminUsers, groupBy])

  const draggedApp = draggedAppId ? applications.find(a => a.id === draggedAppId) : null
  const draggedFromColumn = draggedApp ? draggedApp.status : null

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragEnter = useCallback((colKey: string) => {
    dragCountRef.current[colKey] = (dragCountRef.current[colKey] || 0) + 1
    setDragOverColumn(colKey)
  }, [])

  const handleDragLeave = useCallback((colKey: string) => {
    dragCountRef.current[colKey] = (dragCountRef.current[colKey] || 0) - 1
    if (dragCountRef.current[colKey] <= 0) {
      dragCountRef.current[colKey] = 0
      setDragOverColumn(prev => prev === colKey ? null : prev)
    }
  }, [])

  const handleDrop = useCallback((colKey: string) => {
    dragCountRef.current[colKey] = 0
    setDragOverColumn(null)

    if (!draggedAppId || groupBy !== 'status' || !onStatusChange) {
      setDraggedAppId(null)
      return
    }

    const app = applications.find(a => a.id === draggedAppId)
    if (app && app.status !== colKey) {
      onStatusChange(draggedAppId, colKey, app.status)
    }

    setDraggedAppId(null)
  }, [draggedAppId, groupBy, applications, onStatusChange])

  const handleDragEnd = useCallback(() => {
    setDraggedAppId(null)
    setDragOverColumn(null)
    dragCountRef.current = {}
  }, [])

  const canDrop = groupBy === 'status' && !!onStatusChange

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" onDragEnd={handleDragEnd}>
      {columns.map(col => {
        const isOver = canDrop && dragOverColumn === col.key
        const isSource = canDrop && draggedFromColumn === col.key
        const isValidTarget = canDrop && draggedAppId && !isSource

        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-72 border rounded-lg border-t-4 transition-all duration-200 ${col.accentColor} ${
              isOver && isValidTarget
                ? 'bg-blue-50/80 border-blue-400 shadow-lg scale-[1.01]'
                : isOver && isSource
                  ? 'bg-gray-50 border-gray-200'
                  : draggedAppId && isValidTarget
                    ? 'bg-gray-50 border-gray-300 border-dashed'
                    : 'bg-gray-50 border-gray-200'
            }`}
            onDragOver={canDrop ? handleDragOver : undefined}
            onDragEnter={canDrop ? () => handleDragEnter(col.key) : undefined}
            onDragLeave={canDrop ? () => handleDragLeave(col.key) : undefined}
            onDrop={canDrop ? () => handleDrop(col.key) : undefined}
          >
            <div className="px-3 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${col.badgeColor}`}>
                  {col.label}
                </span>
                <span className="text-xs text-gray-500">{col.apps.length}</span>
              </div>
            </div>
            <div className={`p-2 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto transition-all duration-200 ${
              isOver && isValidTarget ? 'min-h-[80px]' : ''
            }`}>
              {col.apps.length === 0 ? (
                <div className={`text-center py-6 rounded-lg transition-all duration-200 ${
                  isOver && isValidTarget
                    ? 'bg-blue-100/50 border-2 border-dashed border-blue-300 text-blue-500 text-sm font-medium'
                    : draggedAppId && isValidTarget
                      ? 'border-2 border-dashed border-gray-200 text-gray-400 text-xs'
                      : 'text-gray-400 text-xs'
                }`}>
                  {isOver && isValidTarget ? 'Drop here' : draggedAppId && isValidTarget ? 'Drop here' : 'No applications'}
                </div>
              ) : (
                <>
                  {col.apps.map(app => (
                    <KanbanCard
                      key={app.id}
                      application={app}
                      adminUsers={adminUsers}
                      onDragStart={setDraggedAppId}
                      isDragging={draggedAppId === app.id}
                    />
                  ))}
                  {isOver && isValidTarget && (
                    <div className="border-2 border-dashed border-blue-300 rounded-lg bg-blue-50/50 h-16 flex items-center justify-center">
                      <span className="text-xs text-blue-400 font-medium">Drop here</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
