'use client'

import { useState } from 'react'
import type { Lang } from '@/lib/translations'
import { getTranslations } from '@/lib/translations'

type TabKey = 'eligibility' | 'selection' | 'timeline'

export default function ProgramInfoTabs({ lang }: { lang: Lang }) {
  const t = getTranslations(lang)
  const [active, setActive] = useState<TabKey>('eligibility')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'eligibility', label: t.tabEligibility },
    { key: 'selection', label: t.tabSelection },
    { key: 'timeline', label: t.tabTimeline },
  ]

  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active === tab.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 min-h-[300px]">
        {active === 'eligibility' && <EligibilityContent lang={lang} />}
        {active === 'selection' && <SelectionContent lang={lang} />}
        {active === 'timeline' && <TimelineContent lang={lang} />}
      </div>
    </div>
  )
}

function EligibilityContent({ lang }: { lang: Lang }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <p className="text-gray-400 italic">
        {lang === 'fr' ? 'Contenu à venir…' : 'Content coming soon…'}
      </p>
    </div>
  )
}

function SelectionContent({ lang }: { lang: Lang }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <p className="text-gray-400 italic">
        {lang === 'fr' ? 'Contenu à venir…' : 'Content coming soon…'}
      </p>
    </div>
  )
}

function TimelineContent({ lang }: { lang: Lang }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <p className="text-gray-400 italic">
        {lang === 'fr' ? 'Contenu à venir…' : 'Content coming soon…'}
      </p>
    </div>
  )
}
