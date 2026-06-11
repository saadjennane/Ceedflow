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
    <div className="min-h-screen relative overflow-hidden bg-black text-white flex flex-col">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/image.jpg')" }}
      />
      {/* Dark gradient overlay for text readability on the left */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />

      {/* Minimal nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <Link href="/" className="flex items-center">
          <img src="/THE BRIDGE LOGO-04.png" alt="The Bridge" className="h-12 md:h-16 w-auto" />
        </Link>
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex items-center gap-0.5 bg-black/40 backdrop-blur-md border border-white/15 rounded-full p-0.5">
            <Link
              href="/?lang=fr"
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${lang === 'fr' ? 'bg-emerald-400 text-black' : 'text-zinc-300 hover:text-white'}`}
            >
              FR
            </Link>
            <Link
              href="/?lang=en"
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${lang === 'en' ? 'bg-emerald-400 text-black' : 'text-zinc-300 hover:text-white'}`}
            >
              EN
            </Link>
          </div>
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
      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-7xl w-full mx-auto px-6 md:px-12 py-6">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight">
          <span className="block animate-fade-up opacity-0" style={{ animationDelay: '0.15s' }}>
            <span className="text-emerald-400">Build</span>
          </span>
          <span className="block animate-fade-up opacity-0" style={{ animationDelay: '0.45s' }}>
            <span className="text-emerald-400">Validate</span>
          </span>
          <span className="block animate-fade-up opacity-0" style={{ animationDelay: '0.75s' }}>
            <span className="text-emerald-400">Scale</span>{' '}
            <span className="text-white">your startup</span>
          </span>
        </h1>

        <div className="mt-4 h-1 w-16 bg-emerald-400 rounded-full animate-fade-up opacity-0" style={{ animationDelay: '1.05s' }} />

        <div className="mt-8 animate-fade-up opacity-0" style={{ animationDelay: '1.3s' }}>
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-black/40 backdrop-blur-md border border-emerald-400/40">
            <Calendar className="text-emerald-400 flex-shrink-0" size={20} />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-medium">
                {lang === 'fr' ? 'Clôture des candidatures' : 'Applications close on'}
              </div>
              <div className="text-xl md:text-2xl font-bold tracking-tight tabular-nums">20/07/2026</div>
            </div>
          </div>
        </div>

        <div className="mt-6 animate-fade-up opacity-0" style={{ animationDelay: '1.5s' }}>
          <Link
            href={`/apply?lang=${lang}`}
            className="group inline-flex items-center gap-3 bg-emerald-400 text-black px-7 py-3.5 rounded-full text-base md:text-lg font-semibold hover:bg-emerald-300 transition shadow-[0_0_40px_-5px_rgba(52,211,153,0.7)] hover:shadow-[0_0_50px_-5px_rgba(52,211,153,0.9)]"
          >
            {lang === 'fr' ? t.applyFr : t.applyEn}
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition" />
          </Link>
        </div>
      </div>

      {/* Partner logos */}
      <div className="relative z-10 px-4 md:px-12 pb-6 pt-2 animate-fade-up opacity-0" style={{ animationDelay: '1.75s' }}>
        <div className="max-w-7xl mx-auto bg-white rounded-2xl px-6 md:px-10 py-5 md:py-6 flex items-center justify-around gap-4 md:gap-8 flex-wrap shadow-2xl">
          <img src="/Logo MTNRA.png" alt="Ministère de la Transition Numérique et de la Réforme de l'Administration" className="h-24 md:h-32 w-auto object-contain" />
          <img src="/Logo Tamwilcom h.png" alt="Tamwilcom" className="h-10 md:h-14 w-auto object-contain" />
          <img src="/Logo Strategie.png" alt="Stratégie" className="h-10 md:h-14 w-auto object-contain" />
          <img src="/logo-ceed.svg" alt="CEED Morocco" className="h-10 md:h-14 w-auto object-contain" />
        </div>
      </div>
    </div>
  )
}
