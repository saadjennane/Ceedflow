import Link from 'next/link'
import type { Lang } from '@/lib/translations'
import { getTranslations } from '@/lib/translations'
import ProgramInfoTabs from '@/components/ProgramInfoTabs'

export default async function ProgramInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const params = await searchParams
  const lang: Lang = params.lang === 'fr' ? 'fr' : 'en'
  const t = getTranslations(lang)

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/50 py-12 px-4 overflow-hidden">
      {/* Decorative blobs (top area) */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-[28rem] h-[28rem] bg-blue-300/30 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-0 -right-32 w-[32rem] h-[32rem] bg-indigo-200/40 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-[28rem] left-1/3 w-80 h-80 bg-sky-200/30 rounded-full blur-3xl" />

      {/* Fixed dot pattern overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
            &larr; {t.back}
          </Link>
          <Link
            href={`/apply?lang=${lang}`}
            className="inline-flex items-center justify-center bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/40 hover:-translate-y-0.5 hover:bg-blue-700 transition-all duration-200"
          >
            {lang === 'fr' ? 'Soumettre' : 'Apply'}
          </Link>
        </div>
        <div className="flex items-center gap-3 mt-4 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/The_Bridge_by_CEED.png" alt="The Bridge by CEED" className="h-28 drop-shadow-sm" />
        </div>
        <h1 className="text-3xl font-bold mt-4 mb-2">{t.programInfoTitle}</h1>
        <p className="text-gray-600 mb-8">{t.programInfoSubtitle}</p>
        <ProgramInfoTabs lang={lang} />
      </div>
    </div>
  )
}
