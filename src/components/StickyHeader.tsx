'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Lang } from '@/lib/home-copy'

export interface NavItem {
  label: string
  href: string
}

export default function StickyHeader({
  lang,
  applyLabel,
  navItems,
  applicationsClosed = false,
  closedLabel,
}: {
  lang: Lang
  applyLabel: string
  navItems: NavItem[]
  /** When true, hides the Apply CTA and shows a neutral "closed" chip in its place. */
  applicationsClosed?: boolean
  closedLabel?: string
}) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md border-b transition-all duration-300 ${
        scrolled ? 'bg-black/85 border-zinc-900' : 'bg-black/60 border-transparent'
      }`}
    >
      <div
        className={`max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-6 transition-all duration-300 ${
          scrolled ? 'py-3' : 'py-5'
        }`}
      >
        <Link href="/" className="flex items-center flex-shrink-0">
          <img
            src="/Logos/logo%20builders-01.png"
            alt="The Builders"
            className={`w-auto transition-all duration-300 ${scrolled ? 'h-7 md:h-8' : 'h-9 md:h-10'}`}
          />
        </Link>

        {/* Nav links — hidden on mobile, visible from md */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
          {navItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-zinc-300 hover:text-emerald-400 transition whitespace-nowrap"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-full p-0.5">
            <Link
              href="/?lang=fr"
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${lang === 'fr' ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              FR
            </Link>
            <Link
              href="/?lang=en"
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${lang === 'en' ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              EN
            </Link>
          </div>
          {applicationsClosed ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-1.5 rounded-full text-xs font-medium">
              {closedLabel || (lang === 'fr' ? 'Candidatures fermées' : 'Applications closed')}
            </span>
          ) : (
            <Link
              href={`/apply?lang=${lang}`}
              className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-400 text-black px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-emerald-300 transition"
            >
              {applyLabel}
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
