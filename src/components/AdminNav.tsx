'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Settings } from 'lucide-react'

export default function AdminNav({ email, displayName }: { email: string; displayName?: string }) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 items-center">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <img src="/logo-ceed.svg" alt="CEED Morocco" className="h-8" />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{displayName || email}</span>
            <Link
              href="/admin/settings"
              className="text-gray-500 hover:text-blue-700 flex items-center gap-1 text-sm"
            >
              <Settings size={16} />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-blue-700 flex items-center gap-1 text-sm"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
