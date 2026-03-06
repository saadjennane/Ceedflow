'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [debug, setDebug] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setDebug('')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    setDebug(`URL: ${supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING'}\nKey: ${supabaseKey ? supabaseKey.substring(0, 20) + '...' : 'MISSING'}`)

    if (!supabaseUrl || !supabaseKey) {
      setError('Supabase env vars are missing. Check Vercel environment variables.')
      setLoading(false)
      return
    }

    try {
      setDebug(d => d + '\nCreating client...')
      const supabase = createClient()
      setDebug(d => d + '\nCalling signInWithPassword...')
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      setDebug(d => d + `\nResult: ${error ? 'ERROR: ' + error.message : 'SUCCESS, user=' + data.user?.email}`)

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setDebug(d => d + '\nRedirecting to /admin...')
      router.push('/admin')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError('Connection error: ' + msg)
      setDebug(d => d + '\nCATCH: ' + msg)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <img src="/logo-ceed.svg" alt="CEED Morocco" className="h-14 mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="flex justify-end">
            <Link href="/admin/forgot-password" className="text-sm text-gray-500 hover:text-blue-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Sign In
          </button>
        </form>
        {debug && (
          <pre className="mt-4 p-3 bg-gray-100 text-xs text-gray-700 rounded-lg whitespace-pre-wrap break-all">
            {debug}
          </pre>
        )}
      </div>
    </div>
  )
}
