'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Check if session already exists (token may have been picked up)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true)
      }
    })

    // Timeout fallback for invalid/expired links
    const timeout = setTimeout(() => {
      setExpired((prev) => {
        // Only set expired if not already ready
        return !ready && !prev
      })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Redirect to admin after a short delay
    setTimeout(() => {
      router.push('/admin')
      router.refresh()
    }, 2000)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-4">Password Updated</h1>
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
            Your password has been updated successfully. Redirecting...
          </div>
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-blue-700 hover:underline"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          {expired ? (
            <>
              <h1 className="text-2xl font-bold mb-4">Link Expired</h1>
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                This reset link may have expired or is invalid.
              </div>
              <Link
                href="/admin/forgot-password"
                className="text-sm text-gray-500 hover:text-blue-700 hover:underline"
              >
                Request a new reset link
              </Link>
            </>
          ) : (
            <>
              <Loader2 size={24} className="animate-spin mx-auto mb-4 text-gray-400" />
              <p className="text-sm text-gray-500">Verifying your reset link...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Reset Password</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm Password</label>
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
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Update Password
          </button>
        </form>
      </div>
    </div>
  )
}
