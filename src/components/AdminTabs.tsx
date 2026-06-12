'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Users, FolderKanban, Rocket } from 'lucide-react'

const TABS = [
  { href: '/admin', label: 'Applications', icon: FileText, match: (p: string) => p === '/admin' || (p.startsWith('/admin/applications')) },
  { href: '/admin/jurors', label: 'Jury', icon: Users, match: (p: string) => p.startsWith('/admin/jurors') },
  { href: '/admin/committees', label: 'Comités', icon: FolderKanban, match: (p: string) => p.startsWith('/admin/committees') },
  { href: '/admin/startups', label: 'Startups', icon: Rocket, match: (p: string) => p.startsWith('/admin/startups') },
]

export default function AdminTabs() {
  const pathname = usePathname() || ''
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-2">
          {TABS.map(tab => {
            const active = tab.match(pathname)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-700 font-medium'
                    : 'border-transparent text-gray-500 hover:text-blue-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
