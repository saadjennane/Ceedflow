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
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Non-eligible projects</h3>
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
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Projets non éligibles</h3>
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

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
        {number}
      </div>
      <div className="flex-1 pt-1 min-w-0">
        <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

function SelectionContent({ lang }: { lang: Lang }) {
  if (lang === 'en') {
    return (
      <div className="space-y-8">
        <Step number={1} title="Application screening & shortlisting">
          <p>The program team reviews all applications received to identify projects with:</p>
          <Bullets items={[
            'a relevant problem statement',
            'strong impact potential',
            'execution capacity',
            'a clear vision',
            'meaningful development potential during the program',
          ]} />
          <p>Shortlisted startups are then invited to pitch to the pre-selection committee.</p>
        </Step>

        <Step number={2} title="Pre-selection committee">
          <p>Shortlisted startups present their project, in person or online, to a committee made up of:</p>
          <Bullets items={['CEED Morocco members', 'sector experts', 'entrepreneurs', 'investors', 'ecosystem partners']} />
          <p className="font-medium text-gray-900 pt-1">Evaluation criteria</p>
          <Bullets items={[
            'relevance of the problem addressed',
            'market potential',
            'team motivation and complementarity',
            'execution capacity',
            'product vision',
            'technical feasibility',
            'ability to deliver tangible results during the program',
          ]} />
        </Step>

        <Step number={3} title="Admission & immediate onboarding">
          <p>Selected startups join the program as soon as their admission is confirmed, in order to:</p>
          <Bullets items={[
            'reduce waiting times',
            'keep the entrepreneurial momentum',
            'kick off the diagnostic and structuring phase quickly',
          ]} />
          <p>
            Each startup then enters the <strong>Diagnostic &amp; Roadmapping</strong> phase (1 month) — an intensive sprint to understand the startup&apos;s real needs, build a tailored roadmap, identify priorities, define KPIs, and set the program objectives.
          </p>
        </Step>

        <Step number={4} title="Diagnostic & Structuring phase (1 month)">
          <p>Each startup receives intensive support including:</p>
          <Bullets items={[
            'individual strategic sessions',
            'product audit',
            'business audit',
            'market structuring',
            'technical and commercial framing',
            'milestone preparation',
          ]} />
          <p className="font-medium text-gray-900 pt-1">Deliverables at the end of the month</p>
          <Bullets items={[
            'a clear roadmap',
            'an execution plan',
            'measurable objectives',
            'a market validation strategy',
            'a prioritized product backlog',
            'tracking KPIs',
          ]} />
        </Step>

        <Step number={5} title="Funding committee">
          <p>At the end of the first month, each startup presents to the funding committee:</p>
          <Bullets items={[
            'diagnostic findings',
            'roadmap',
            'objectives',
            'development strategy',
            'product and market priorities',
            'grant utilization plan',
          ]} />
          <p className="font-medium text-gray-900 pt-1">Committee objectives</p>
          <Bullets items={[
            'validate the startup continuing in the program',
            'confirm alignment with the program objectives',
            'unlock the funding / grant',
            'validate the milestones for the acceleration phase',
          ]} />
        </Step>
      </div>
    )
  }
  return (
    <div className="space-y-8">
      <Step number={1} title="Analyse & présélection des dossiers">
        <p>L&apos;équipe du programme analyse l&apos;ensemble des candidatures reçues pour identifier les projets présentant :</p>
        <Bullets items={[
          'une problématique pertinente',
          'un potentiel d’impact',
          'une capacité d’exécution',
          'une vision claire',
          'un potentiel de développement durant le programme',
        ]} />
        <p>Les startups présélectionnées sont ensuite invitées à pitcher devant le comité de présélection.</p>
      </Step>

      <Step number={2} title="Comité de présélection">
        <p>Les startups présélectionnées présentent leur projet, en présentiel ou en ligne, devant un comité composé de :</p>
        <Bullets items={['membres de CEED Morocco', 'experts sectoriels', 'entrepreneurs', 'investisseurs', 'partenaires de l’écosystème']} />
        <p className="font-medium text-gray-900 pt-1">Critères évalués</p>
        <Bullets items={[
          'pertinence du problème adressé',
          'potentiel marché',
          'motivation et complémentarité de l’équipe',
          'capacité d’exécution',
          'vision produit',
          'faisabilité technique',
          'capacité à atteindre des résultats concrets durant le programme',
        ]} />
      </Step>

      <Step number={3} title="Admission & onboarding immédiat">
        <p>Les startups retenues intègrent le programme dès validation de leur admission, afin de :</p>
        <Bullets items={[
          'réduire les délais d’attente',
          'maintenir la dynamique entrepreneuriale',
          'démarrer rapidement la phase de diagnostic et de structuration',
        ]} />
        <p>
          Chaque startup entre alors dans la phase <strong>Diagnostic &amp; Roadmapping</strong> (1 mois) — une phase intensive pour comprendre les besoins réels de la startup, construire une feuille de route adaptée, identifier les priorités, définir les KPIs et préparer les objectifs du programme.
        </p>
      </Step>

      <Step number={4} title="Phase Diagnostic & Structuration (1 mois)">
        <p>Chaque startup bénéficie d&apos;un accompagnement intensif :</p>
        <Bullets items={[
          'sessions stratégiques individuelles',
          'audit produit',
          'audit business',
          'structuration marché',
          'cadrage technique',
          'cadrage commercial',
          'préparation des milestones',
        ]} />
        <p className="font-medium text-gray-900 pt-1">Livrables à la fin du mois</p>
        <Bullets items={[
          'une roadmap claire',
          'un plan d’exécution',
          'des objectifs mesurables',
          'une stratégie de validation marché',
          'un backlog produit priorisé',
          'des KPIs de suivi',
        ]} />
      </Step>

      <Step number={5} title="Comité de financement">
        <p>À l&apos;issue du premier mois, chaque startup présente au comité :</p>
        <Bullets items={[
          'les enseignements du diagnostic',
          'sa roadmap',
          'ses objectifs',
          'sa stratégie de développement',
          'ses priorités produit et marché',
          'son plan d’utilisation de la subvention',
        ]} />
        <p className="font-medium text-gray-900 pt-1">Objectifs du comité</p>
        <Bullets items={[
          'valider la poursuite de la startup dans le programme',
          'confirmer l’alignement du projet avec les objectifs du programme',
          'débloquer le financement / la subvention',
          'valider les milestones de la phase d’accélération',
        ]} />
      </Step>
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
