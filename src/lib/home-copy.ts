export type Lang = 'fr' | 'en'

export const HOME_COPY = {
  fr: {
    langToggle: { fr: 'FR', en: 'EN' },
    applyFr: 'Déposer ma candidature',
    applyEn: 'Apply',

    nav: {
      pourquoi: 'Pourquoi',
      pourQui: 'Pour qui',
      programme: 'Le programme',
      timeline: 'Timeline',
      faq: 'FAQ',
      reglement: 'Règlement',
    },

    hero: {
      badge: 'Date limite de candidature · 20 juillet 2026',
      tagline: 'Construisez. Validez. Accélérez.',
      lead: "The Builders vous permet d'accélérer le lancement de vos projets innovants, rencontrer vos clients et valider votre marché.",
    },

    why: {
      title: 'Pourquoi The Builders ?',
      body: "Construire vite. Valider tôt. Décrocher ses premiers clients. The Builders accompagne les startups marocaines, de l'idée jusqu'au marché.",
      intro: 'Notre approche :',
      bullets: ['Moins de théorie', "Plus d'exécution", 'Plus de terrain', "Plus d'autonomie", 'Plus de résultats'],
    },

    benefits: {
      title: 'Ce que vous obtenez',
      subtitle: "De votre MVP à vos premiers clients, jusqu'au roadshow investisseurs : un accompagnement de bout en bout.",
      mentoring: {
        title: 'Accompagnement personnalisé',
        intro: 'Un suivi régulier assuré par :',
        items: ['Des mentors', 'Des experts sectoriels', 'Des entrepreneurs expérimentés', "L'équipe d'accompagnement du programme"],
        outro: "L'objectif est simple : accélérer l'exécution et lever rapidement les blocages.",
      },
      workshops: {
        title: 'Ateliers concrets & Peer Learning',
        intro: 'Des ateliers et sessions collaboratives, conçus autour des défis concrets des startups.',
        topicsLabel: 'Exemples de thématiques :',
        topics: ['Product Market Fit', 'Acquisition B2B', 'Juridique', 'Automatisation', 'Analytics', 'Vibe Coding', '…'],
        outro: 'Tous les ateliers sont orientés pratique et directement applicables à votre projet.',
      },
      networking: {
        title: 'Networking',
        intro: 'Des rencontres régulières avec :',
        items: ['Mentors', 'Investisseurs', 'Partenaires stratégiques', 'Clients potentiels', '…'],
        outro: 'Construisez votre réseau dès le premier mois et accédez aux bons interlocuteurs au bon moment.',
      },
      funding: {
        title: 'Financement',
        intro: 'Les startups sélectionnées peuvent bénéficier :',
        grant: { title: 'Subvention de 200k MAD', desc: 'Pour accélérer le développement et la mise sur le marché.' },
        stipend: { title: 'Bourse de Vie', desc: "Un soutien financier jusqu'à 12 mois pour se consacrer pleinement au développement de la startup." },
      },
    },

    midCta1: { title: 'Vous vous reconnaissez ?', sub: 'Déposez votre candidature dès maintenant.' },
    midCta2: { title: 'Prêt à candidater ?', sub: 'Quelques minutes suffisent pour soumettre votre projet.' },

    how: {
      title: 'Comment fonctionne le programme ?',
      phases: [
        {
          tag: 'Mois 0', title: 'Sélection',
          items: [
            "Préselection par l'équipe du programme.",
            "Présentation du projet devant un comité composé d'experts, d'investisseurs, de membres de CEED Maroc et de partenaires de l'écosystème.",
            'Présentation de la feuille de route devant un comité de financement afin de valider le financement et la poursuite dans le programme.',
          ],
        },
        {
          tag: 'Mois 1', title: 'Diagnostic & Structuration',
          items: ['Diagnostic 360°', 'Analyse produit, marché et business', 'Définition des priorités', 'Construction de la roadmap'],
          note: "Ce premier mois permet également d'adapter les contenus du programme et certaines thématiques d'ateliers aux besoins réels des startups sélectionnées.",
        },
        {
          tag: 'Mois 2 à 4', title: 'Build & MVP',
          items: ['Développement du MVP', 'Validation des hypothèses', 'Tests utilisateurs', 'Premières démonstrations'],
        },
        {
          tag: 'Mois 5 à 7', title: 'Go-To-Market & Traction',
          items: ['Acquisition', 'Développement commercial', 'Partenariats', 'Premiers clients'],
        },
        {
          tag: 'Mois 8', title: 'Demo Day',
          intro: 'Présentation devant :',
          items: ['Investisseurs', 'Corporates', 'Partenaires', "Acteurs de l'écosystème"],
          note: "Avec pour objectif d'accélérer les opportunités commerciales et de financement.",
        },
      ],
    },

    dna: {
      title: 'Notre ADN',
      cards: [
        { title: 'BUILD', text: 'Des MVPs concrets, testables, déployés vite.' },
        { title: 'VALIDATE', text: 'Au contact du marché dès les premières semaines.' },
        { title: 'AUTONOMIZE', text: 'Vibe Coding et IA pour avancer seul, plus vite.' },
        { title: 'SCALE', text: 'De la validation marché aux premières ventes.' },
      ],
    },

    whoFor: {
      title: "À qui s'adresse The Builders ?",
      paragraphs: [
        "Pour les startups innovantes marocaines, du POC aux premiers clients.",
        "Portées par une équipe fondatrice engagée et à fort potentiel.",
        "Quel que soit votre stade, nous adaptons l'accompagnement à votre maturité et à vos priorités.",
      ],
      cta: "Voir les critères d'éligibilité",
    },

    expectations: {
      title: 'Ce que nous attendons à la fin du programme',
      items: [
        'Un MVP fonctionnel et déployé',
        "Une validation marché concrète auprès d'utilisateurs ou de clients",
        'Des premières opportunités commerciales, pilotes ou bons de commande identifiés',
        'Des rencontres avec des investisseurs pour votre levée de fonds',
      ],
    },

    faq: {
      title: 'Questions fréquentes',
      items: [
        {
          q: 'Qui peut postuler à The Builders ?',
          blocks: [
            "Les startups innovantes marocaines, détenues par des entrepreneurs marocains ou étrangers, créées depuis moins de 8 ans, dont la finalité est le développement d'un prototype ou d'un MVP — du POC validé jusqu'au MVP fonctionnel.",
          ],
        },
        {
          q: 'Combien coûte le programme ?',
          blocks: [
            "Le programme est entièrement gratuit pour les startups sélectionnées. Aucun frais d'inscription, aucun coût caché.",
          ],
        },
        {
          q: 'Comment se déroule la sélection ?',
          blocks: [
            'La sélection se déroule en trois étapes :',
            { ordered: true, list: [
              "Présélection sur dossier par l'équipe du programme.",
              "Pitch devant un comité d'experts, d'investisseurs, de membres de CEED Maroc et de partenaires de l'écosystème.",
              "Validation finale : présentation de la feuille de route devant un comité de financement, qui valide le financement et l'entrée dans le programme.",
            ] },
          ],
        },
        {
          q: 'Quelle subvention est proposée ?',
          blocks: [
            "Une subvention pouvant aller jusqu'à 200 000 MAD pour les startups sélectionnées, destinée à accélérer le développement et la mise sur le marché.",
          ],
        },
        {
          q: 'Comment fonctionne la bourse de vie ?',
          blocks: [
            "Un soutien financier mensuel accordé pendant 3 mois, renouvelable 3 fois (soit jusqu'à 12 mois maximum).",
            "Montant : 70 % de la moyenne brute des 12 dernières fiches de paie, plafonné à 40 000 MAD brut/mois.",
            "Conditions d'éligibilité :",
            { list: [
              "Minimum 5 ans d'expérience en tant que salarié ou gérant non-associé.",
              "Toujours en poste, ou avoir quitté son emploi depuis moins de 12 mois.",
            ] },
          ],
        },
        {
          q: 'Quelle est la durée du programme ?',
          blocks: [
            "8 mois — du diagnostic 360° (Mois 1) jusqu'au Demo Day final (Mois 8), précédés d'une phase de sélection (Mois 0).",
          ],
        },
        {
          q: 'Pourquoi un premier mois consacré au diagnostic ?',
          blocks: [
            "Le premier mois permet d'adapter les contenus du programme et certaines thématiques d'ateliers aux besoins réels des startups sélectionnées. Chaque parcours est ajusté à la maturité, aux priorités et aux blocages de chaque équipe.",
          ],
        },
        {
          q: 'Quelles sont les attentes côté fondateurs ?',
          blocks: [
            "Une équipe fondatrice engagée, exécutante et active dans le programme — présente aux ateliers, mentorats, comités et sessions collectives. The Builders est conçu pour des équipes qui veulent passer rapidement de l'idée au marché.",
          ],
        },
      ],
    },

    partners: {
      title: 'Ce programme est soutenu par',
    },

    finalCta: {
      title: 'Prêt à construire le prochain chapitre de votre startup ?',
      sub: "Rejoignez The Builders by CEED et bénéficiez d'un accompagnement conçu pour transformer des idées en produits, des produits en clients et des clients en croissance.",
    },
  },

  en: {
    langToggle: { fr: 'FR', en: 'EN' },
    applyFr: 'Déposer ma candidature',
    applyEn: 'Apply',

    nav: {
      pourquoi: 'Why',
      pourQui: 'For who',
      programme: 'Program',
      timeline: 'Timeline',
      faq: 'FAQ',
      reglement: 'Rules',
    },

    hero: {
      badge: 'Application deadline · 20 July 2026',
      tagline: 'Build. Validate. Accelerate.',
      lead: 'The Builders helps you accelerate the launch of your innovative projects, meet your customers, and validate your market.',
    },

    why: {
      title: 'Why The Builders?',
      body: 'Build fast. Validate early. Land your first customers. The Builders supports Moroccan startups, from idea to market.',
      intro: 'Our approach:',
      bullets: ['Less theory', 'More execution', 'More fieldwork', 'More autonomy', 'More results'],
    },

    benefits: {
      title: 'What you get',
      subtitle: 'From your MVP to your first customers, all the way to investor roadshows — end-to-end support.',
      mentoring: {
        title: 'Personalized support',
        intro: 'Regular guidance from:',
        items: ['Mentors', 'Industry experts', 'Experienced entrepreneurs', "The program's support team"],
        outro: 'The goal is simple: accelerate execution and quickly remove blockers.',
      },
      workshops: {
        title: 'Concrete workshops & Peer Learning',
        intro: 'Workshops and collaborative sessions, designed around the real challenges of startups.',
        topicsLabel: 'Example topics:',
        topics: ['Product Market Fit', 'B2B Acquisition', 'Legal', 'Automation', 'Analytics', 'Vibe Coding', '…'],
        outro: 'All workshops are practice-oriented and directly applicable to your project.',
      },
      networking: {
        title: 'Networking',
        intro: 'Regular encounters with:',
        items: ['Mentors', 'Investors', 'Strategic partners', 'Potential customers', '…'],
        outro: 'Build your network from day one and meet the right people at the right time.',
      },
      funding: {
        title: 'Funding',
        intro: 'Selected startups may receive:',
        grant: { title: '200k MAD grant', desc: 'To accelerate development and market launch.' },
        stipend: { title: 'Living stipend', desc: 'Financial support for up to 12 months to focus fully on building the startup.' },
      },
    },

    midCta1: { title: 'Does this sound like you?', sub: 'Apply now.' },
    midCta2: { title: 'Ready to apply?', sub: 'It only takes a few minutes to submit your project.' },

    how: {
      title: 'How does the program work?',
      phases: [
        {
          tag: 'Month 0', title: 'Selection',
          items: [
            'Pre-selection by the program team.',
            'Project pitch in front of a committee of experts, investors, CEED Maroc members and ecosystem partners.',
            'Roadmap presentation in front of a funding committee to validate funding and continued participation.',
          ],
        },
        {
          tag: 'Month 1', title: 'Diagnostic & Structuring',
          items: ['360° diagnostic', 'Product, market and business analysis', 'Priority setting', 'Roadmap building'],
          note: "This first month also allows us to adapt the program's content and certain workshop topics to the real needs of the selected startups.",
        },
        {
          tag: 'Months 2-4', title: 'Build & MVP',
          items: ['MVP development', 'Hypothesis validation', 'User testing', 'First demos'],
        },
        {
          tag: 'Months 5-7', title: 'Go-To-Market & Traction',
          items: ['Acquisition', 'Business development', 'Partnerships', 'First customers'],
        },
        {
          tag: 'Month 8', title: 'Demo Day',
          intro: 'Pitch in front of:',
          items: ['Investors', 'Corporates', 'Partners', 'Ecosystem players'],
          note: 'With the goal of accelerating business and funding opportunities.',
        },
      ],
    },

    dna: {
      title: 'Our DNA',
      cards: [
        { title: 'BUILD', text: 'Concrete MVPs, testable and shipped fast.' },
        { title: 'VALIDATE', text: 'In front of the market from the first weeks.' },
        { title: 'AUTONOMIZE', text: 'Vibe Coding and AI to move forward solo, faster.' },
        { title: 'SCALE', text: 'From market validation to first sales.' },
      ],
    },

    whoFor: {
      title: 'Who is The Builders for?',
      paragraphs: [
        'For innovative Moroccan startups, from POC to first customers.',
        'Led by a committed, high-potential founding team.',
        'Whatever your stage, we tailor the support to your maturity and priorities.',
      ],
      cta: 'See eligibility criteria',
    },

    expectations: {
      title: 'What we expect at the end of the program',
      items: [
        'A functional, deployed MVP',
        'Concrete market validation with users or customers',
        'First business opportunities, pilots or purchase orders identified',
        'Meetings with investors for your fundraising round',
      ],
    },

    faq: {
      title: 'Frequently asked questions',
      items: [
        {
          q: 'Who can apply to The Builders?',
          blocks: [
            'Innovative Moroccan startups, owned by Moroccan or foreign entrepreneurs, less than 8 years old, whose goal is to develop a prototype or MVP — from a validated POC to a functional MVP.',
          ],
        },
        {
          q: 'How much does the program cost?',
          blocks: [
            'The program is entirely free for selected startups. No registration fees, no hidden costs.',
          ],
        },
        {
          q: 'How does the selection work?',
          blocks: [
            'The selection runs in three steps:',
            { ordered: true, list: [
              'Document-based pre-selection by the program team.',
              'Pitch in front of a committee of experts, investors, CEED Morocco members and ecosystem partners.',
              'Final validation: roadmap presentation to a funding committee, which validates funding and entry into the program.',
            ] },
          ],
        },
        {
          q: 'What grant is offered?',
          blocks: [
            'A grant of up to 200,000 MAD for selected startups, designed to accelerate development and market launch.',
          ],
        },
        {
          q: 'How does the living stipend work?',
          blocks: [
            'A monthly stipend paid for 3 months, renewable 3 times (up to 12 months total).',
            'Amount: 70% of the gross average of the last 12 payslips, capped at 40,000 MAD gross/month.',
            'Eligibility:',
            { list: [
              'Minimum 5 years of experience as employee or non-associate manager.',
              'Currently employed, or having left employment less than 12 months ago.',
            ] },
          ],
        },
        {
          q: 'How long does the program last?',
          blocks: [
            '8 months — from the 360° diagnostic (Month 1) to the final Demo Day (Month 8), preceded by a selection phase (Month 0).',
          ],
        },
        {
          q: 'Why a first month dedicated to diagnostic?',
          blocks: [
            "The first month allows us to adapt the program's content and certain workshop topics to the real needs of selected startups. Each journey is tailored to the maturity, priorities and blockers of each team.",
          ],
        },
        {
          q: 'What are the expectations for founders?',
          blocks: [
            'A committed, execution-driven founding team, actively engaged in the program — present at workshops, mentoring, committees and collective sessions. The Builders is built for teams that want to move fast from idea to market.',
          ],
        },
      ],
    },

    partners: {
      title: 'This program is supported by',
    },

    finalCta: {
      title: 'Ready to build the next chapter of your startup?',
      sub: 'Join The Builders by CEED and benefit from support designed to turn ideas into products, products into customers, and customers into growth.',
    },
  },
} as const
