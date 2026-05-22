import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen relative bg-gradient-to-b from-white via-white to-blue-50/40 flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-40 w-[28rem] h-[28rem] bg-blue-100/40 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-40 left-1/4 w-72 h-72 bg-indigo-100/30 rounded-full blur-3xl" />

      <div className="absolute top-4 right-4 z-10">
        <Link
          href="/admin"
          className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Admin
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="text-center max-w-lg px-6">
          <img src="/The_Bridge_by_CEED.png" alt="The Bridge by CEED" className="h-20 mx-auto mb-8 drop-shadow-sm" />
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
              className="inline-flex items-center justify-center gap-2 border border-blue-200 bg-white/70 backdrop-blur-sm text-blue-700 px-8 py-3.5 rounded-xl font-medium hover:bg-white hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 w-full sm:w-auto"
            >
              <span className="text-lg">🇬🇧</span> Apply
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-4 text-sm">
            <Link href="/program-info?lang=fr" className="text-gray-500 hover:text-blue-700 transition-colors underline-offset-4 hover:underline">
              Infos sur le programme
            </Link>
            <span className="text-gray-300">·</span>
            <Link href="/program-info?lang=en" className="text-gray-500 hover:text-blue-700 transition-colors underline-offset-4 hover:underline">
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
