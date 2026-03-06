'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Mail, FileText, ExternalLink, History, X, Trash2 } from 'lucide-react'
import type {
  Application, ApplicationStatus, Priority, NextAction, AdminUser,
} from '@/lib/types'

const STATUSES: ApplicationStatus[] = ['New', 'Very interesting', 'Interesting', 'Average', 'Not interesting']
const PRIORITIES: Priority[] = ['High', 'Normal', 'Low']
const NEXT_ACTIONS: NextAction[] = ['Call founder', 'Schedule meeting', 'Request more information', 'Keep as backup', 'Closed']

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getAdminDisplayName(adminUsers: AdminUser[], userId?: string): string {
  if (!userId) return 'Unknown'
  const user = adminUsers.find(u => u.id === userId)
  if (!user) return 'Admin'
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim()
  }
  return user.email
}

export default function ApplicationDetail({
  application,
  currentUserId,
  currentUserEmail,
  adminUsers,
}: {
  application: Application
  currentUserId: string
  currentUserEmail: string
  adminUsers: AdminUser[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [noteText, setNoteText] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const updateField = async (field: string, value: string | null) => {
    const oldValue = (application as unknown as Record<string, unknown>)[field] as string | undefined

    await supabase
      .from('applications')
      .update({ [field]: value })
      .eq('id', application.id)

    await supabase.from('activity_log').insert({
      application_id: application.id,
      actor_user_id: currentUserId,
      action_type: `${field}_changed`,
      old_value: oldValue || null,
      new_value: value,
    })

    router.refresh()
  }

  const addNote = async () => {
    if (!noteText.trim()) return
    setSubmittingNote(true)

    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: application.id,
        text: noteText,
      }),
    })

    setNoteText('')
    setSubmittingNote(false)
    router.refresh()
  }

  const handleSoftDelete = async () => {
    setDeleting(true)
    await fetch(`/api/applications/${application.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'soft-delete' }),
    })
    router.push('/admin')
    router.refresh()
  }

  const primaryFounder = application.founders?.find(f => f.is_primary)
  const requestInfoEmail = primaryFounder?.email
    ? `mailto:${primaryFounder.email}?subject=Additional Information Needed - ${encodeURIComponent(application.startup_name)}&body=${encodeURIComponent(
        `Dear ${primaryFounder.full_name},\n\nThank you for your application to our startup program.\n\nWe are interested in learning more about ${application.startup_name}. Could you please provide us with the following additional information:\n\n- \n\nBest regards,\nStartup Program Team`
      )}`
    : null

  const notes = [...(application.notes || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const activityLog = [...(application.activity_log || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
          <ArrowLeft size={16} /> Back to applications
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {application.logo_url && (
              <img src={application.logo_url} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
            )}
            <div>
              <h1 className="text-2xl font-bold">{application.startup_name}</h1>
              <p className="text-gray-500 text-sm mt-1">
                Submitted on {formatDate(application.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowActivity(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              title="Activity History"
            >
              <History size={16} />
            </button>
            {requestInfoEmail && (
              <a
                href={requestInfoEmail}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Mail size={16} />
                Request more information
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Main grid: content + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {/* Startup Info */}
          <Section title="Startup Information">
            <InfoRow label="Sector" value={application.sector} />
            <InfoRow label="Stage" value={application.stage} />
            <InfoRow label="Model" value={application.business_model_type || '—'} />
            {application.creation_date && (
              <InfoRow label="Creation Date" value={formatDate(application.creation_date)} />
            )}
            <InfoRow label="Source" value={application.source} />
            {application.website && (
              <InfoRow
                label="Website"
                value={
                  <a href={application.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                    {application.website} <ExternalLink size={12} />
                  </a>
                }
              />
            )}
            {application.linkedin_page && (
              <InfoRow
                label="LinkedIn"
                value={
                  <a href={application.linkedin_page} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                    {application.linkedin_page} <ExternalLink size={12} />
                  </a>
                }
              />
            )}
            <div className="pt-2">
              <p className="text-sm text-gray-500 mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap">{application.description}</p>
            </div>
            {application.customers && (
              <div className="pt-2">
                <p className="text-sm text-gray-500 mb-1">Customers</p>
                <p className="text-sm whitespace-pre-wrap">{application.customers}</p>
              </div>
            )}
            {application.business_model && (
              <div className="pt-2">
                <p className="text-sm text-gray-500 mb-1">Business Model</p>
                <p className="text-sm whitespace-pre-wrap">{application.business_model}</p>
              </div>
            )}
          </Section>

          {/* Founders */}
          <Section title="Founders">
            {application.founders?.map((founder) => (
              <div key={founder.id} className="border border-gray-100 rounded-lg p-3 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{founder.full_name}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{founder.role}</span>
                  {founder.is_primary && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Lead</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 space-y-0.5">
                  <p>{founder.email}</p>
                  <p>{founder.phone}</p>
                  {founder.linkedin && (
                    <a href={founder.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            ))}
          </Section>

          {/* Traction */}
          <Section title="Traction">
            <InfoRow label="Revenue (12m)" value={application.revenue_last_12_months || '—'} />
            <InfoRow label="Projected revenue (next 12m)" value={application.projected_revenue_next_12_months || '—'} />
            <InfoRow label="Employees" value={application.employees || '—'} />
            <InfoRow label="Users / Customers" value={application.users_or_customers || '—'} />
            <InfoRow label="Raised funds" value={application.raised_funds ? 'Yes' : 'No'} />
            {application.raised_funds && (
              <InfoRow label="Amount raised" value={application.funds_amount || '—'} />
            )}
            <InfoRow label="Planning to raise" value={application.fundraising_plan || '—'} />
            <InfoRow label="Patent" value={application.patent_status || '—'} />
            <InfoRow label="Total investment" value={application.total_investment || '—'} />
          </Section>

          {/* Documents */}
          <Section title="Documents">
            {(!application.documents || application.documents.length === 0) ? (
              <p className="text-sm text-gray-500">No documents uploaded.</p>
            ) : (
              application.documents.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline py-1"
                >
                  <FileText size={16} />
                  {doc.custom_name || doc.file_name}
                  <span className="text-xs text-gray-400">({doc.file_type.replace('_', ' ')})</span>
                </a>
              ))
            )}
          </Section>
        </div>

        {/* Sidebar - Admin controls + Notes */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
            <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Admin Controls</h3>

            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={application.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={application.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Assigned to</label>
              <select
                value={application.assigned_admin_id || ''}
                onChange={(e) => updateField('assigned_admin_id', e.target.value || null)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned</option>
                {adminUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Next Action</label>
              <select
                value={application.next_action || ''}
                onChange={(e) => updateField('next_action', e.target.value || null)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="pt-2 border-t border-gray-200">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={16} />
                Move to trash
              </button>
            </div>
          </div>

          {/* Notes - separate block */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
            <div className="mb-3">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <button
                onClick={addNote}
                disabled={submittingNote || !noteText.trim()}
                className="mt-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submittingNote ? 'Adding...' : 'Add Note'}
              </button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-gray-500">No notes yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {notes.map((note) => (
                  <div key={note.id} className="border-l-2 border-gray-200 pl-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span className="font-medium">{getAdminDisplayName(adminUsers, note.author_user_id)}</span>
                      <span>{formatDateTime(note.created_at)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{note.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-lg mb-2">Move to trash?</h2>
            <p className="text-sm text-gray-600 mb-5">
              <strong>{application.startup_name}</strong> will be moved to the trash. You can restore it later from Settings.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSoftDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Move to trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity History Modal */}
      {showActivity && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowActivity(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold">Activity History</h2>
              <button onClick={() => setShowActivity(false)} className="text-gray-400 hover:text-blue-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {activityLog.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {activityLog.map((log) => {
                    const actorName = getAdminDisplayName(adminUsers, log.actor_user_id)
                    const description = formatActivity(log.action_type, log.old_value || undefined, log.new_value || undefined, actorName)
                    return (
                      <div key={log.id} className="flex items-start gap-3 text-sm">
                        <span className="text-gray-400 whitespace-nowrap text-xs mt-0.5">
                          {formatDateTime(log.created_at)}
                        </span>
                        <span className="text-gray-700">{description}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function formatActivity(actionType: string, oldValue?: string, newValue?: string, actor?: string): string {
  const name = actor || 'Someone'

  switch (actionType) {
    case 'status_changed':
      return `${name} changed status from "${oldValue}" to "${newValue}"`
    case 'priority_changed':
      return `${name} changed priority from "${oldValue}" to "${newValue}"`
    case 'assigned_admin_id_changed':
      return `${name} ${newValue ? 'assigned' : 'unassigned'} the application`
    case 'next_action_changed':
      return `${name} set next action to "${newValue || 'None'}"`
    case 'note_added':
      return `${name} added a note`
    default:
      return `${name} performed ${actionType.replace(/_/g, ' ')}`
  }
}
