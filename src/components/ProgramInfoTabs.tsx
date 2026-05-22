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
  if (lang === 'en') {
    return (
      <div className="space-y-8 text-gray-700">
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Criteria related to the company</h3>
          <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
            <li>Company incorporated under Moroccan law, owned by one or several project holders residing in Morocco.</li>
            <li>No more than eight (8) years old, from the date of registration in the Commercial Register.</li>
          </ul>
          <p className="text-sm leading-relaxed mt-4 mb-2">
            Foreign-incorporated startups are also eligible, subject to meeting the following conditions:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
            <li>At least one (1) co-founder or partner is of Moroccan nationality and resides in Morocco.</li>
            <li>Have a business plan for developing operations in Morocco, justified through business flows in Morocco (revenue, OPEX, etc.).</li>
          </ul>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Criteria related to the project</h3>
          <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
            <li>Innovative project in the incubation or structuring phase, ranging from initial concept to the development of a Minimum Viable Product (MVP).</li>
            <li>Project with a demonstrable innovative character<sup>1</sup> and a clear growth and scalability potential.</li>
            <li>Execution capacity of the founding team.</li>
            <li>Commitment of the founding team to dedicate the time and resources required for the successful execution of the program.</li>
            <li>Project operating in an innovative or technological sector, across all industries: Fintech, Artificial Intelligence, HealthTech, GreenTech, CleanTech, AgriTech, EdTech, Industry 4.0, Cybersecurity, DeepTech, Digital Services, E-commerce, Tourism &amp; Hospitality, Transport &amp; Mobility, or any other sector with strong innovation potential.</li>
          </ul>
          <p className="text-xs text-gray-500 mt-4 italic leading-relaxed">
            <sup>1</sup> The notion of innovation is understood in its broad sense. It refers to the implementation of a new or improved product (good or service) or process, a new marketing method, or a new organizational method. It may therefore involve actual innovation (creation) or adaptive innovation.
          </p>
        </section>

        <section className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Article 5 – Non-eligible projects</h3>
          <p className="text-sm leading-relaxed mb-3">The following are notably not eligible:</p>
          <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
            <li>Illegal projects or projects contrary to the regulations in force in Morocco.</li>
            <li>Activities listed on the exclusion list defined by Tamwilcom under the &ldquo;Digital Startup Fund&rdquo;<sup>2</sup>.</li>
            <li>Fictitious projects or projects without a demonstrable innovative character.</li>
            <li>Projects led by persons in a situation of conflict of interest with CEED Morocco or Tamwilcom.</li>
            <li>Incomplete applications or applications submitted after the submission deadline.</li>
          </ul>
          <p className="text-sm leading-relaxed mt-4 text-gray-600 italic">
            CEED Morocco reserves the right to reject any application deemed inconsistent with the objectives and orientations of the program, without being required to justify its decision.
          </p>
          <p className="text-xs text-gray-500 mt-3 italic leading-relaxed">
            <sup>2</sup> The exclusion list is available upon request from CEED Morocco.
          </p>
        </section>
      </div>
    )
  }
  return (
    <div className="space-y-8 text-gray-700">
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Critères relatifs à la structure</h3>
        <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
          <li>Entreprise créée de droit marocain, détenue par un ou plusieurs porteurs de projet résidents au Maroc.</li>
          <li>Ayant au maximum huit (8) ans d&apos;ancienneté à compter de la date d&apos;immatriculation au Registre du Commerce.</li>
        </ul>
        <p className="text-sm leading-relaxed mt-4 mb-2">
          Les startups de droit étranger sont également éligibles sous réserve de satisfaire aux conditions suivantes :
        </p>
        <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
          <li>Au moins un (1) cofondateur ou associé est de nationalité marocaine et résident au Maroc.</li>
          <li>Disposer d&apos;un plan d&apos;affaires de développement de l&apos;activité au Maroc justifié à travers un flux d&apos;affaires au Maroc (chiffre d&apos;affaires, OPEX, etc.).</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Critères relatifs au projet</h3>
        <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
          <li>Projet innovant en phase d&apos;incubation ou de structuration, allant du concept initial au développement du Minimum Viable Product (MVP).</li>
          <li>Projet présentant un caractère innovant<sup>1</sup> et un potentiel de croissance et de scalabilité démontrable.</li>
          <li>Capacité d&apos;exécution de l&apos;équipe fondatrice.</li>
          <li>Engagement de l&apos;équipe fondatrice à consacrer le temps et les ressources nécessaires à la bonne exécution du programme.</li>
          <li>Projet évoluant dans un secteur innovant ou technologique, tous secteurs confondus : Fintech, Intelligence Artificielle, HealthTech, GreenTech, CleanTech, AgriTech, EdTech, Industrie 4.0, Cybersécurité, DeepTech, Digital Services, E-commerce, Tourisme &amp; Hospitalité, Transport &amp; Mobilité, ou tout autre secteur à fort potentiel d&apos;innovation.</li>
        </ul>
        <p className="text-xs text-gray-500 mt-4 italic leading-relaxed">
          <sup>1</sup> La notion d&apos;innovation est appréhendée dans son sens large. Elle correspond à la mise en œuvre d&apos;un produit (bien ou service) ou d&apos;un procédé nouveau ou amélioré, d&apos;une nouvelle méthode de commercialisation ou d&apos;une méthode organisationnelle. Ainsi, il peut s&apos;agir d&apos;une innovation proprement dite (création) ou d&apos;une innovation d&apos;adaptation.
        </p>
      </section>

      <section className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Article 5 – Projets non éligibles</h3>
        <p className="text-sm leading-relaxed mb-3">Ne sont notamment pas éligibles :</p>
        <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
          <li>Les projets illégaux ou contraires à la réglementation en vigueur au Maroc.</li>
          <li>Les activités figurant sur la liste d&apos;exclusion définie par Tamwilcom dans le cadre du Fonds «&nbsp;Digital Startup Fund&nbsp;»<sup>2</sup>.</li>
          <li>Les projets fictifs ou sans caractère innovant démontrable.</li>
          <li>Les projets portés par des personnes en situation de conflit d&apos;intérêts avec CEED Maroc ou Tamwilcom.</li>
          <li>Les candidatures incomplètes ou transmises après la date limite de soumission.</li>
        </ul>
        <p className="text-sm leading-relaxed mt-4 text-gray-600 italic">
          CEED Maroc se réserve le droit de rejeter toute candidature jugée non conforme aux objectifs et orientations du programme, sans être tenu de motiver sa décision.
        </p>
        <p className="text-xs text-gray-500 mt-3 italic leading-relaxed">
          <sup>2</sup> La liste d&apos;exclusion est disponible sur demande auprès de CEED Maroc.
        </p>
      </section>
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
