import Link from 'next/link'
import { Info } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen relative bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/50 flex flex-col overflow-hidden">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-[28rem] h-[28rem] bg-blue-300/30 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-32 w-[32rem] h-[32rem] bg-indigo-200/40 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-32 left-1/4 w-80 h-80 bg-sky-200/40 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 w-[20rem] h-[20rem] bg-blue-100/40 rounded-full blur-3xl" />

      {/* Dot pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="absolute top-4 right-4 z-20">
        <Link
          href="/admin"
          className="inline-flex items-center px-3 py-1.5 rounded-full text-sm text-gray-600 bg-white/70 backdrop-blur-sm border border-gray-200 hover:bg-white hover:text-gray-900 hover:border-gray-300 hover:shadow-sm transition-all"
        >
          Admin
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="text-center max-w-lg px-6">
          <img src="/The_Bridge_by_CEED.png" alt="The Bridge by CEED" className="h-52 mx-auto mb-8 drop-shadow-sm" />
          <p className="text-gray-600 mb-10 leading-relaxed">
            Apply to our incubation and acceleration program. We support early-stage startups
            with mentorship, funding, and resources.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/apply?lang=fr"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-xl font-medium shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/40 hover:-translate-y-0.5 hover:bg-blue-700 transition-all duration-200 w-full sm:w-auto"
            >
              <span className="text-lg">🇫🇷</span> Soumettre
            </Link>
            <Link
              href="/apply?lang=en"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-xl font-medium shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/40 hover:-translate-y-0.5 hover:bg-blue-700 transition-all duration-200 w-full sm:w-auto"
            >
              <span className="text-lg">🇬🇧</span> Apply
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
            <Link
              href="/program-info?lang=fr"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm text-blue-700 bg-white/70 backdrop-blur-sm border border-blue-200 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <Info size={14} />
              Infos sur le programme
            </Link>
            <Link
              href="/program-info?lang=en"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm text-blue-700 bg-white/70 backdrop-blur-sm border border-blue-200 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <Info size={14} />
              Program info
            </Link>
          </div>
        </div>
      </div>
      <footer className="w-full px-4 py-6 flex justify-center relative z-10">
        <img
          src="/Banner.png"
          alt="Led by Royaume du Maroc, operated by Tamwilcom, as part of Digital Morocco 2030"
          className="max-h-28 max-w-full w-auto h-auto"
        />
      </footer>
    </div>
  )
}
