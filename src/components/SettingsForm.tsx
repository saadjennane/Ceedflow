'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  created_at: string
}

interface DeletedApplication {
  id: string
  startup_name: string
  deleted_at: string
  founders: { full_name: string; is_primary: boolean }[]
}

export default function SettingsForm({ currentEmail, initialFirstName, initialLastName, deletedApplications = [] }: { currentEmail: string; initialFirstName?: string; initialLastName?: string; deletedApplications?: DeletedApplication[] }) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(initialFirstName || '')
  const [lastName, setLastName] = useState(initialLastName || '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newAdminFirstName, setNewAdminFirstName] = useState('')
  const [newAdminLastName, setNewAdminLastName] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminSuccess, setAdminSuccess] = useState('')
  const [listLoading, setListLoading] = useState(true)

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { first_name: firstName, last_name: lastName },
    })

    if (error) {
      setProfileError(error.message)
    } else {
      setProfileSuccess('Profile updated successfully.')
    }
    setProfileLoading(false)
  }

  useEffect(() => {
    fetchAdminUsers()
  }, [])

  const fetchAdminUsers = async () => {
    setListLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const data = await res.json()
      setAdminUsers(data.users)
    }
    setListLoading(false)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setPasswordLoading(true)
    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    })

    if (signInError) {
      setPasswordError('Current password is incorrect.')
      setPasswordLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordError(error.message)
    } else {
      setPasswordSuccess('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }

    setPasswordLoading(false)
  }

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError('')
    setAdminSuccess('')
    setAdminLoading(true)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newAdminEmail,
        password: newAdminPassword,
        first_name: newAdminFirstName,
        last_name: newAdminLastName,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setAdminError(data.error)
    } else {
      setAdminSuccess(`Admin ${newAdminFirstName} ${newAdminLastName} (${newAdminEmail}) created.`)
      setNewAdminEmail('')
      setNewAdminPassword('')
      setNewAdminFirstName('')
      setNewAdminLastName('')
      fetchAdminUsers()
    }

    setAdminLoading(false)
  }

  const getDisplayName = (user: AdminUser) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name} ${user.last_name}`.trim()
    }
    return user.email
  }

  return (
    <div className="space-y-8">
      {/* Profile */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>
        <form onSubmit={handleProfileUpdate} className="space-y-4 max-w-md">
          {profileError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {profileError}
            </div>
          )}
          {profileSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">
              {profileSuccess}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={currentEmail}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={profileLoading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {profileLoading && <Loader2 size={16} className="animate-spin" />}
            Save Profile
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          {passwordError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">
              {passwordSuccess}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={passwordLoading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {passwordLoading && <Loader2 size={16} className="animate-spin" />}
            Update Password
          </button>
        </form>
      </div>

      {/* Admin Management */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Admin Users</h2>

        <div className="mb-6">
          {listLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 size={16} className="animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {adminUsers.map(user => (
                <div key={user.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                      {(user.first_name?.[0] || user.email[0]).toUpperCase()}
                      {(user.last_name?.[0] || '').toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-medium">{getDisplayName(user)}</span>
                      {(user.first_name || user.last_name) && (
                        <span className="text-xs text-gray-400 ml-2">{user.email}</span>
                      )}
                      {user.email === currentEmail && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">You</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(user.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-medium mb-3">Add New Admin</h3>
          <form onSubmit={handleAddAdmin} className="space-y-3 max-w-md">
            {adminError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                {adminError}
              </div>
            )}
            {adminSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">
                {adminSuccess}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">First Name</label>
                <input
                  type="text"
                  value={newAdminFirstName}
                  onChange={(e) => setNewAdminFirstName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name</label>
                <input
                  type="text"
                  value={newAdminLastName}
                  onChange={(e) => setNewAdminLastName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Temporary Password</label>
              <input
                type="text"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
                placeholder="Min. 6 characters"
              />
              <p className="text-xs text-gray-500 mt-1">The new admin can change their password after logging in.</p>
            </div>
            <button
              type="submit"
              disabled={adminLoading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {adminLoading && <Loader2 size={16} className="animate-spin" />}
              <UserPlus size={16} />
              Add Admin
            </button>
          </form>
        </div>
      </div>

      {/* Trash */}
      <TrashSection applications={deletedApplications} onRefresh={() => router.refresh()} />
    </div>
  )
}

function TrashSection({ applications, onRefresh }: { applications: DeletedApplication[]; onRefresh: () => void }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleRestore = async (id: string) => {
    setLoadingId(id)
    await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore' }),
    })
    setLoadingId(null)
    onRefresh()
  }

  const handlePermanentDelete = async (id: string) => {
    setLoadingId(id)
    await fetch(`/api/applications/${id}`, { method: 'DELETE' })
    setConfirmDeleteId(null)
    setLoadingId(null)
    onRefresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 size={20} className="text-gray-500" />
        <h2 className="text-lg font-semibold">Trash</h2>
        {applications.length > 0 && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{applications.length}</span>
        )}
      </div>

      {applications.length === 0 ? (
        <p className="text-sm text-gray-500">No deleted applications.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {applications.map(app => {
            const primaryFounder = app.founders?.find(f => f.is_primary) || app.founders?.[0]
            return (
              <div key={app.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium">{app.startup_name}</span>
                  {primaryFounder && (
                    <span className="text-xs text-gray-400 ml-2">{primaryFounder.full_name}</span>
                  )}
                  <p className="text-xs text-gray-400">
                    Deleted on {formatDate(app.deleted_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(app.id)}
                    disabled={loadingId === app.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    title="Restore"
                  >
                    <RotateCcw size={14} />
                    Restore
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(app.id)}
                    disabled={loadingId === app.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    title="Delete permanently"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Permanent delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-red-600" />
              <h3 className="font-semibold">Delete permanently?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              This action cannot be undone. The application and all related data (founders, documents, notes) will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePermanentDelete(confirmDeleteId)}
                disabled={loadingId === confirmDeleteId}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {loadingId === confirmDeleteId ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
