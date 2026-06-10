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
      reglement: 'Règlement',
    },

    hero: {
      badge: 'Date limite de candidature · 20 juillet 2026',
      tagline: 'Construisez. Validez. Accélérez.',
      lead: "The Bridge vous permet d'accélérer le lancement de vos projets innovants, rencontrer vos clients et valider votre marché.",
    },

    why: {
      title: 'Pourquoi The Bridge ?',
      body: "The Bridge a été conçu pour accompagner les entrepreneurs dans la construction de solutions concrètes, la validation de leur marché et le développement de leurs premières opportunités commerciales.",
      intro: 'Notre approche privilégie :',
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
        intro: 'Les startups sélectionnées peuvent bénéficier de :',
        grant: { title: 'Subvention de 200k MAD', desc: "Destinée à accélérer le développement du projet et sa mise sur le marché." },
        stipend: { title: 'Bourse de Vie', desc: "Un soutien financier temporaire pouvant être accordé pendant une durée allant jusqu'à 12 mois afin de permettre aux entrepreneurs de se consacrer pleinement au développement de leur startup." },
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
            "Présentation du projet devant un comité composé d'experts, d'investisseurs, de membres de SID et de partenaires de l'écosystème.",
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
        { title: 'BUILD', text: 'Construire rapidement des solutions concrètes et des MVPs testables.' },
        { title: 'VALIDATE', text: 'Confronter les solutions au marché dès les premières semaines.' },
        { title: 'AUTONOMIZE', text: "Développer l'autonomie des entrepreneurs grâce au Vibe Coding et aux outils IA modernes." },
        { title: 'SCALE', text: 'Transformer les validations marché en opportunités business réelles.' },
      ],
    },

    whoFor: {
      title: "À qui s'adresse The Bridge ?",
      paragraphs: [
        "The Bridge s'adresse aux startups innovantes marocaines, détenues par des entrepreneurs marocains ou étrangers, créées depuis moins de 8 ans et en phase d'incubation, de structuration ou de développement de MVP.",
        "Nous recherchons des projets à fort potentiel de croissance et de scalabilité, portés par une équipe fondatrice engagée, capable d'exécution et pleinement disponible pour s'investir dans le programme.",
      ],
      cta: 'En savoir plus',
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

    partners: {
      title: 'Ce programme est soutenu par',
    },

    finalCta: {
      title: 'Prêt à construire le prochain chapitre de votre startup ?',
      sub: "Rejoignez The Bridge by CEED et bénéficiez d'un accompagnement conçu pour transformer des idées en produits, des produits en clients et des clients en croissance.",
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
      reglement: 'Rules',
    },

    hero: {
      badge: 'Application deadline · 20 July 2026',
      tagline: 'Build. Validate. Accelerate.',
      lead: 'The Bridge helps you accelerate the launch of your innovative projects, meet your customers, and validate your market.',
    },

    why: {
      title: 'Why The Bridge?',
      body: 'The Bridge was designed to support entrepreneurs in building concrete solutions, validating their market, and developing their first business opportunities.',
      intro: 'Our approach favors:',
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
        intro: 'Selected startups may benefit from:',
        grant: { title: '200k MAD grant', desc: "To accelerate the project's development and market launch." },
        stipend: { title: 'Living stipend', desc: 'Temporary financial support that may be granted for up to 12 months so entrepreneurs can fully dedicate themselves to building their startup.' },
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
            'Project pitch in front of a committee of experts, investors, SID members and ecosystem partners.',
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
        { title: 'BUILD', text: 'Quickly build concrete solutions and testable MVPs.' },
        { title: 'VALIDATE', text: 'Confront solutions with the market from the very first weeks.' },
        { title: 'AUTONOMIZE', text: "Develop entrepreneurs' autonomy through Vibe Coding and modern AI tools." },
        { title: 'SCALE', text: 'Turn market validations into real business opportunities.' },
      ],
    },

    whoFor: {
      title: 'Who is The Bridge for?',
      paragraphs: [
        'The Bridge is built for innovative Moroccan startups, owned by Moroccan or foreign entrepreneurs, less than 8 years old and at the incubation, structuring or MVP-development stage.',
        "We look for projects with strong growth and scalability potential, led by a founding team that is committed, execution-driven, and fully available to invest themselves in the program.",
      ],
      cta: 'Learn more',
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

    partners: {
      title: 'This program is supported by',
    },

    finalCta: {
      title: 'Ready to build the next chapter of your startup?',
      sub: 'Join The Bridge by CEED and benefit from support designed to turn ideas into products, products into customers, and customers into growth.',
    },
  },
} as const
