import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'

export const metadata = {
  title: "Règlement — The Bridge by CEED",
  description: "Règlement de l'appel à projets The Bridge — Segment Incubation",
}

export default function ReglementPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top banner */}
      <div className="w-full bg-white py-6 px-4 flex items-center justify-center border-b border-gray-100">
        <img
          src="/Banner.png"
          alt="Led by Royaume du Maroc, operated by Tamwilcom, as part of Digital Morocco 2030"
          className="max-h-28 md:max-h-32 w-auto"
        />
      </div>

      {/* CEED logo */}
      <div className="w-full py-6 px-4 flex items-center justify-center border-b border-gray-100">
        <img src="/logo-ceed.svg" alt="CEED Morocco" className="h-12 md:h-16 w-auto" />
      </div>

      {/* Back link + download */}
      <div className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition">
          <ArrowLeft size={16} />
          Retour à l&apos;accueil
        </Link>
        <a
          href="/Règlement Appel à projets Ceed v11.06.2026.pdf"
          download
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 text-sm font-medium hover:bg-emerald-500/20 hover:border-emerald-500 transition"
        >
          <Download size={14} />
          Télécharger la version PDF
        </a>
      </div>

      {/* Title */}
      <header className="max-w-4xl mx-auto px-6 pt-10 pb-12 text-center">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Règlement de l&apos;appel à projets</p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">« The Bridge »</h1>
        <p className="text-lg text-gray-700">Segment Incubation</p>
        <p className="text-base text-gray-500 mt-1">Du 12/06/2026 au 20/07/2026</p>
        <div className="mt-6 h-1 w-16 bg-emerald-500 mx-auto rounded-full" />
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 pb-24 space-y-12 text-[15px] leading-relaxed text-gray-700">

        <Section id="preambule" num={1} title="Préambule">
          <p>
            Cet appel à projets s&apos;inscrit dans le cadre de l&apos;initiative <strong>« l&apos;Offre Startup VB »</strong>, financée par le Ministère de la Transition Numérique et de la Réforme de l&apos;Administration (MTNRA), et dont la gestion est confiée à Tamwilcom.
          </p>
          <p>
            Dans ce cadre, <strong>CEED Maroc</strong> — Center for Entrepreneurial and Executive Development Morocco — lance <strong>« The Bridge »</strong>, son programme de venture building et d&apos;accompagnement entrepreneurial.
          </p>
          <p>
            Conçu comme un pont entre l&apos;innovation, l&apos;exécution et l&apos;accès au financement, « The Bridge » a pour ambition d&apos;accompagner des entrepreneurs et startups innovantes à fort potentiel dans la structuration, le développement et l&apos;accélération de leurs projets, à travers un accompagnement stratégique, opérationnel et orienté croissance.
          </p>
          <p>
            Les startups sélectionnées pourront également bénéficier, sous réserve d&apos;éligibilité, de conformité et de validation par les instances concernées, des mécanismes de financement prévus dans le cadre de l&apos;Offre Startup VB.
          </p>
        </Section>

        <Section id="objet" num={2} title="Objet de l'appel à projets">
          <p>
            Cet appel à projets a pour objectif de sélectionner, à la suite d&apos;un processus de sélection, <strong>jusqu&apos;à vingt (20) startups innovantes</strong> afin de bénéficier d&apos;un programme d&apos;accompagnement et d&apos;un financement<sup>1</sup> sous forme d&apos;une <strong>« Bourse d&apos;incubation »</strong><sup>2</sup>.
          </p>
          <Footnotes>
            <p><sup>1</sup> Le financement est accordé sous réserve de validation par Tamwilcom et les instances concernées dans le cadre de l&apos;Offre Startup VB.</p>
            <p><sup>2</sup> Un minimum de 10% du programme d&apos;investissement à financer devra être engagé par la startup comme autofinancement préalablement au décaissement du financement au titre de l&apos;Offre Startup VB.</p>
          </Footnotes>
        </Section>

        <Section id="programme" num={3} title="Programme d'accompagnement">
          <p>
            Les candidats sélectionnés dans le cadre de cet appel à projets auront accès gratuitement<sup>3</sup> à un programme d&apos;accompagnement<sup>4</sup> de <strong>8 mois</strong> comprenant les services suivants :
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Des ateliers collectifs thématiques et sessions de formation (business model, go-to-market, finance, juridique, RH, technologie, etc.) ;</li>
            <li>Des sessions de mentorat et de coaching personnalisé ;</li>
            <li>Un accompagnement à la structuration du business model et du plan de développement ;</li>
            <li>Un accompagnement stratégique, opérationnel et au développement commercial ;</li>
            <li>Un accompagnement à la préparation au financement et à l&apos;investissement ;</li>
            <li>Des sessions de préparation au pitch ;</li>
            <li>Un accès à un réseau d&apos;experts, mentors, partenaires, corporates et investisseurs ;</li>
            <li>Ainsi qu&apos;un suivi opérationnel et stratégique tout au long du programme.</li>
          </ul>
          <p>À l&apos;issue du programme, les startups accompagnées devront disposer des livrables suivants :</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Un <strong>MVP fonctionnel</strong> permettant de démontrer la proposition de valeur de la solution ;</li>
            <li>Un <strong>Business Model</strong> décrivant la création, la délivrance et la captation de valeur ;</li>
            <li>Une <strong>stratégie Go-To-Market</strong> définissant le marché cible, le positionnement, les canaux d&apos;acquisition et le plan de lancement ;</li>
            <li>Un <strong>Business Plan</strong> intégrant la vision de développement, les hypothèses financières et les projections prévisionnelles ;</li>
            <li>Un <strong>Pitch Deck</strong> en français et en anglais destiné aux partenaires, clients et investisseurs.</li>
          </ul>
          <p>Ces livrables seront développés progressivement tout au long du programme avec l&apos;accompagnement des experts, mentors et l&apos;équipe du programme.</p>
          <p>La finalité du programme demeure la création d&apos;un produit viable, la validation du marché et l&apos;identification de premières opportunités commerciales.</p>
          <p>Le contenu, le format et les modalités du programme d&apos;accompagnement pourront être adaptés par CEED Maroc en fonction du niveau de maturité des startups, des besoins identifiés ou des contraintes opérationnelles.</p>
          <Footnotes>
            <p><sup>3</sup> Le programme d&apos;accompagnement est fourni à titre gracieux dans le cadre du dispositif Startup VB. CEED Maroc se réserve toutefois la possibilité de proposer des services complémentaires optionnels et payants ne relevant pas directement du périmètre du programme.</p>
            <p><sup>4</sup> Une startup ne peut bénéficier que d&apos;un seul programme d&apos;accompagnement et de financement de même nature (incubation ou accélération) dans le cadre de l&apos;Offre Startup VB, même si elle est retenue par plusieurs structures d&apos;accompagnement.</p>
          </Footnotes>
        </Section>

        <Section id="eligibilite" num={4} title="Critères d'éligibilité">
          <p>L&apos;appel à projets s&apos;adresse aux entrepreneurs et start-ups établis au Maroc respectant les critères d&apos;éligibilité suivants :</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Entreprise créée de droit marocain, détenue par un ou plusieurs porteur(s) de projet résident(s) au Maroc<sup>5</sup>, ou par une startup de droit étranger. Cette startup de droit étranger doit remplir les critères suivants :
              <ul className="list-[circle] pl-6 mt-2 space-y-1">
                <li>Au moins un (1) associé est de nationalité marocaine et résident au Maroc ;</li>
                <li>Disposer d&apos;un plan d&apos;affaires de développement de l&apos;activité au Maroc justifié à travers un flux d&apos;affaires au Maroc (Chiffres d&apos;affaires ou OPEX…) ;</li>
              </ul>
            </li>
            <li>Ayant <strong>8 ans d&apos;ancienneté au maximum</strong>, à compter de la date d&apos;immatriculation au RC ;</li>
            <li><strong>Types de projets finançables :</strong> Entreprise innovante<sup>6</sup> œuvrant dans le numérique ;</li>
            <li><strong>Stade de maturité :</strong> Entreprise innovante ayant dépassé le stade du POC (proof of concept), et ayant pour finalité le développement du prototype ou du MVP (minimum viable product) ;</li>
            <li><strong>Opérant dans les secteurs d&apos;activité suivants :</strong> AgriTech / HealthTech / CleanTech &amp; GreenTech / Industries 4.0 / EdTech / Cybersécurité / Fintech, etc.</li>
          </ul>
          <Footnotes>
            <p><sup>5</sup> L&apos;associé détenant une minorité de blocage, ainsi que le gérant, doivent être résidents au Maroc.</p>
            <p><sup>6</sup> La notion d&apos;innovation est appréhendée dans son sens large. Elle correspond à la mise en œuvre d&apos;un produit (bien ou service) ou d&apos;un procédé nouveau ou amélioré, d&apos;une nouvelle méthode de commercialisation ou d&apos;une méthode organisationnelle. Ainsi, il peut s&apos;agir d&apos;une innovation proprement dite (création) ou d&apos;une innovation d&apos;adaptation.</p>
          </Footnotes>
        </Section>

        <Section id="candidature" num={5} title="Dossier de candidature : contenu et soumission">
          <p>Le dossier de candidature doit inclure :</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Le formulaire de candidature dûment complété ;</li>
            <li>Une présentation du projet (problème adressé, solution proposée, caractère innovant, marché cible) ;</li>
            <li>Un pitch deck de présentation ;</li>
            <li>Les informations relatives à l&apos;équipe fondatrice ;</li>
            <li>Une présentation du modèle économique ;</li>
            <li>Les éléments financiers disponibles, le cas échéant ;</li>
            <li>Tout document complémentaire jugé utile par le candidat pour appuyer sa candidature.</li>
          </ul>
          <p>
            Le dossier de candidature peut être rédigé en langue arabe, française ou anglaise et transmis via le formulaire de candidature en ligne disponible à l&apos;adresse suivante :{' '}
            <a href="https://www.ceedflow.com" className="text-emerald-600 hover:underline">www.ceedflow.com</a>
          </p>
          <p>Seules les candidatures comportant un dossier complet et transmises suivant les canaux de transmission prévus seront évaluées.</p>
          <p>La date limite de soumission des candidatures est fixée au <strong>20 juillet 2026</strong>. Les candidatures reçues après la date de clôture de l&apos;appel à projets ne seront pas prises en compte.</p>
          <p>Une même entreprise ne peut déposer qu&apos;un seul dossier de candidature.</p>
          <p>Après envoi du dossier de candidature, le contact principal du candidat pourra être sollicité pour des demandes de précisions ou de justificatifs sur sa candidature.</p>
          <p>Toute déclaration inexacte ou mensongère peut entraîner la disqualification du candidat.</p>
          <p>CEED Maroc se réserve le droit de modifier, de décaler, de proroger ou d&apos;annuler purement et simplement le présent appel à projets et ce, sans qu&apos;aucun des candidats ne puisse se prévaloir d&apos;une quelconque indemnisation à ce titre. Le règlement modifié se substituera automatiquement au règlement jusqu&apos;alors en vigueur, celui-ci devenant caduc.</p>
        </Section>

        <Section id="evaluation" num={6} title="Critères d'évaluation du projet">
          <p>L&apos;évaluation des projets présentés dans le cadre de l&apos;appel à projets s&apos;appuie sur l&apos;analyse des dimensions humaines, technologiques, financières et commerciales.</p>
        </Section>

        <Section id="calendrier" num={7} title="Calendrier prévisionnel">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#0f3656] text-white">
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Phases</th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Date (jours calendaires)</th>
                </tr>
              </thead>
              <tbody className="bg-gray-50">
                <tr>
                  <td className="border border-gray-300 px-4 py-3 font-medium">Lancement de l&apos;appel à projets</td>
                  <td className="border border-gray-300 px-4 py-3 text-center">12/06/2026</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 font-medium">Clôture de l&apos;appel à projets</td>
                  <td className="border border-gray-300 px-4 py-3 text-center">20/07/2026</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 font-medium">Présélection des startups</td>
                  <td className="border border-gray-300 px-4 py-3 text-center">Évaluation continue des candidatures pendant toute la période d&apos;ouverture de l&apos;appel à projets.</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 font-medium">Passage devant le comité de sélection (Pitch Day)</td>
                  <td className="border border-gray-300 px-4 py-3 text-center">Organisation en continu de comités de sélection pendant toute la période d&apos;ouverture de l&apos;appel à projets.</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 font-medium">Annonces des résultats</td>
                  <td className="border border-gray-300 px-4 py-3 text-center">15/08/2026</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 font-medium">Démarrage du programme d&apos;accompagnement</td>
                  <td className="border border-gray-300 px-4 py-3 text-center">01/09/2026</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-600 italic mt-4">
            Ce calendrier est prévisionnel et susceptible de modifications. Tout changement sera notifié aux candidats dans les meilleurs délais. CEED Maroc se réserve le droit de modifier les dates sans qu&apos;aucune compensation ne puisse être réclamée à ce titre.
          </p>
        </Section>

        <Section id="confidentialite" num={8} title="Confidentialité et propriété intellectuelle">
          <p>Tout projet comportant des informations à caractère confidentiel devra le mentionner de façon non équivoque. L&apos;intégrité de ces informations fournies par les candidats dans leur dossier de candidature sont confidentielles, à l&apos;usage exclusif du comité de sélection.</p>
          <p>CEED Maroc ainsi que les membres du comité de sélection s&apos;engagent à traiter comme confidentielles les informations renseignées par les candidats et ne pourront les divulguer sans accord préalable écrit de ces derniers.</p>
          <p>CEED Maroc se réserve le droit de communiquer publiquement sur l&apos;appel à projets et les candidatures réceptionnées et/ou retenues à l&apos;issue du processus de sélection. Dans ce cas, seuls les noms des projets et/ou entreprises candidats ou retenus seront communiqués.</p>
        </Section>

        <Section id="conflits" num={9} title="Conflits d'intérêts">
          <p>CEED Maroc s&apos;engage à maintenir une totale indépendance dans son évaluation des projets qui lui sont présentés dans le cadre de l&apos;appel à projets.</p>
          <p>CEED Maroc atteste qu&apos;aucun intérêt personnel ne viendra influencer ses décisions ou ses évaluations.</p>
          <p>En cas de conflit d&apos;intérêts divulgué ou autrement identifié, CEED Maroc se réserve le droit de prendre toutes mesures jugées nécessaires pour assurer l&apos;intégrité de l&apos;évaluation des projets.</p>
          <p>Toutes les informations divulguées dans le cadre de la gestion des conflits d&apos;intérêts seront traitées avec la plus stricte confidentialité et ne seront utilisées que pour assurer l&apos;intégrité du processus d&apos;évaluation.</p>
        </Section>

        <Section id="donnees" num={10} title="Traitement des données à caractère personnel">
          <p>Afin de garantir une sécurité et une confidentialité des données transmises dans le cadre de l&apos;appel à projets, CEED Maroc mettra en place des principes et règles visant à protéger les droits des personnes concernées et à empêcher l&apos;utilisation inappropriée de leurs données à caractère personnel et ce, conformément aux dispositions de la loi 09-08.</p>
        </Section>

        <Section id="contact" num={11} title="Contact">
          <p>
            Veuillez adresser toutes vos demandes d&apos;informations à l&apos;adresse suivante{' '}
            <a href="mailto:info@ceed-morocco.org" className="text-emerald-600 hover:underline">info@ceed-morocco.org</a>{' '}
            ou au numéro <strong>+212 (0)521 37 16 83</strong>.
          </p>
        </Section>
      </main>

      <footer className="border-t border-gray-100 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} The Bridge by CEED — Règlement de l&apos;appel à projets
      </footer>
    </div>
  )
}

function Section({ id, num, title, children }: { id: string; num: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900 border-b border-gray-200 pb-3 mb-5 uppercase tracking-tight flex items-center gap-3">
        <span className="text-emerald-600 font-mono tabular-nums">{String(num).padStart(2, '0')}</span>
        <span className="text-gray-300">—</span>
        <span>{title}</span>
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Footnotes({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1.5">
      {children}
    </div>
  )
}
