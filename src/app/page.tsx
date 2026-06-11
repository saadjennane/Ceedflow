import Link from 'next/link'
import { ArrowRight, Calendar } from 'lucide-react'
import { HOME_COPY, type Lang } from '@/lib/home-copy'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const params = await searchParams
  const lang: Lang = params.lang === 'en' ? 'en' : 'fr'
  const t = HOME_COPY[lang]

  return (
    <div className="min-h-screen relative overflow-hidden bg-black text-white">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/image.jpg')" }}
      />
      {/* Dark gradient overlay for text readability on the left */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

      {/* Minimal nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <Link href="/" className="flex items-center">
          <img src="/THE BRIDGE LOGO-02.png" alt="The Bridge" className="h-10 md:h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-4 md:gap-6">
          <Link
            href="/reglement"
            className="text-sm text-zinc-200 hover:text-emerald-400 transition whitespace-nowrap"
          >
            Règlement
          </Link>
          <Link
            href={`/apply?lang=${lang}`}
            className="inline-flex items-center gap-1.5 bg-emerald-400 text-black px-5 py-2 rounded-full text-sm font-semibold hover:bg-emerald-300 transition shadow-[0_0_25px_-5px_rgba(52,211,153,0.6)]"
          >
            {lang === 'fr' ? 'Postuler' : 'Apply now'}
            <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-8 md:pt-16 pb-20">
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight">
          <span className="block animate-fade-up opacity-0" style={{ animationDelay: '0.15s' }}>
            <span className="text-emerald-400">Build</span>
          </span>
          <span className="block animate-fade-up opacity-0" style={{ animationDelay: '0.45s' }}>
            <span className="text-emerald-400">Validate</span>
          </span>
          <span className="block animate-fade-up opacity-0" style={{ animationDelay: '0.75s' }}>
            <span className="text-emerald-400">Scale</span>{' '}
            <span className="text-white">{lang === 'fr' ? 'votre startup' : 'your startup'}</span>
          </span>
        </h1>

        <div className="mt-6 h-1 w-20 bg-emerald-400 rounded-full animate-fade-up opacity-0" style={{ animationDelay: '1.05s' }} />

        <div className="mt-12 animate-fade-up opacity-0" style={{ animationDelay: '1.3s' }}>
          <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl bg-black/40 backdrop-blur-md border border-emerald-400/40">
            <Calendar className="text-emerald-400 flex-shrink-0" size={22} />
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-medium">
                {lang === 'fr' ? 'Clôture des candidatures' : 'Applications close on'}
              </div>
              <div className="text-2xl md:text-3xl font-bold tracking-tight tabular-nums">20/07/2026</div>
            </div>
          </div>
        </div>

        <div className="mt-8 animate-fade-up opacity-0" style={{ animationDelay: '1.5s' }}>
          <Link
            href={`/apply?lang=${lang}`}
            className="group inline-flex items-center gap-3 bg-emerald-400 text-black px-8 py-4 rounded-full text-base md:text-lg font-semibold hover:bg-emerald-300 transition shadow-[0_0_40px_-5px_rgba(52,211,153,0.7)] hover:shadow-[0_0_50px_-5px_rgba(52,211,153,0.9)]"
          >
            {lang === 'fr' ? t.applyFr : t.applyEn}
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition" />
          </Link>
        </div>
      </div>

      {/* Language toggle bottom-right (subtle) */}
      <div className="absolute bottom-6 right-6 z-10 flex items-center gap-0.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-full p-0.5">
        <Link
          href="/?lang=fr"
          className={`px-3 py-1 rounded-full text-xs font-medium transition ${lang === 'fr' ? 'bg-emerald-400 text-black' : 'text-zinc-300 hover:text-white'}`}
        >
          FR
        </Link>
        <Link
          href="/?lang=en"
          className={`px-3 py-1 rounded-full text-xs font-medium transition ${lang === 'en' ? 'bg-emerald-400 text-black' : 'text-zinc-300 hover:text-white'}`}
        >
          EN
        </Link>
      </div>
    </div>
  )
}
