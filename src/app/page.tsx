import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen relative bg-white">
      <div className="absolute top-4 right-4">
        <Link
          href="/admin"
          className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Admin
        </Link>
      </div>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-lg px-6">
          <img src="/logo-ceed.svg" alt="CEED Morocco" className="h-20 mx-auto mb-8" />
          <p className="text-gray-600 mb-8">
            Apply to our incubation and acceleration program. We support early-stage startups
            with mentorship, funding, and resources.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/apply?lang=fr"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors w-full sm:w-auto"
            >
              <span className="text-lg">🇫🇷</span> Soumettre
            </Link>
            <Link
              href="/apply?lang=en"
              className="inline-flex items-center justify-center gap-2 border border-blue-200 text-blue-700 px-8 py-3 rounded-lg font-medium hover:bg-blue-50 transition-colors w-full sm:w-auto"
            >
              <span className="text-lg">🇬🇧</span> Apply
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
