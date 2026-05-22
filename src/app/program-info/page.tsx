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
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; {t.back}
        </Link>
        <div className="flex items-center gap-3 mt-4 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ceed.svg" alt="CEED Morocco" className="h-10" />
        </div>
        <h1 className="text-3xl font-bold mt-4 mb-2">{t.programInfoTitle}</h1>
        <p className="text-gray-600 mb-8">{t.programInfoSubtitle}</p>
        <ProgramInfoTabs lang={lang} />
      </div>
    </div>
  )
}
