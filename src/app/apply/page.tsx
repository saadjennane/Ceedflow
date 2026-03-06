import ApplicationForm from '@/components/ApplicationForm'
import Link from 'next/link'
import type { Lang } from '@/lib/translations'
import { getTranslations } from '@/lib/translations'

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const params = await searchParams
  const lang: Lang = params.lang === 'fr' ? 'fr' : 'en'
  const t = getTranslations(lang)

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto mb-8">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; {t.back}
        </Link>
        <div className="flex items-center gap-3 mt-4 mb-2">
          <img src="/logo-ceed.svg" alt="CEED Morocco" className="h-10" />
        </div>
        <h1 className="text-3xl font-bold mt-4 mb-2">{t.applyTitle}</h1>
        <p className="text-gray-600">{t.applySubtitle}</p>
      </div>
      <ApplicationForm lang={lang} />
    </div>
  )
}
