export type Lang = 'en' | 'fr'

const translations = {
  en: {
    // Apply page
    applyTitle: 'Apply to the Startup Program',
    applySubtitle: 'Fill in the details below to submit your startup application.',
    back: 'Back',

    // Progress steps
    stepStartupInfo: 'Startup Info',
    stepFounders: 'Founders',
    stepTraction: 'Traction',
    stepDocuments: 'Documents',
    stepSubmit: 'Submit',

    // Step 1
    startupInformation: 'Startup Information',
    startupName: 'Startup Name',
    logo: 'Logo',
    logoHint: 'Upload your startup logo (optional)',
    creationDate: 'Creation Date',
    sector: 'Sector',
    website: 'Website',
    linkedinPage: 'LinkedIn Page',
    shortDescription: 'Short Description',
    whoAreYourCustomers: 'Who are your customers?',
    describeCustomers: 'Describe your target customers...',
    businessModelLabel: 'Business Model',
    businessModelPlaceholder: 'How do you generate revenue?',
    model: 'Model',
    stageMaturity: 'Stage / Maturity',
    next: 'Next',

    // Step 2
    founders: 'Founders',
    leadFounder: 'Lead Founder',
    coFounder: 'Co-founder',
    fullName: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    role: 'Role',
    linkedin: 'LinkedIn',
    addCoFounder: 'Add co-founder',

    // Step 3
    tractionInformation: 'Traction Information',
    tractionHint: 'All fields are optional. All amounts are in MAD (Moroccan Dirham).',
    revenueLast12: 'Revenue (last 12 months) - MAD',
    projectedRevenue: 'Projected revenue (next 12 months) - MAD',
    numberOfEmployees: 'Number of employees',
    numberOfUsers: 'Number of users or customers',
    haveYouRaisedFunds: 'Have you raised funds?',
    no: 'No',
    yes: 'Yes',
    amountRaised: 'Amount raised - MAD',
    planningToRaise: 'Are you planning to raise funds?',
    in6Months: 'In 6 months',
    in12Months: 'In 12 months',
    in18Months: 'In 18 months',
    doYouHavePatent: 'Do you have a patent?',
    inProgress: 'In Progress',
    totalInvestment: 'Total investment to date - MAD',

    // Step 4
    documents: 'Documents',
    pitchDeck: 'Pitch Deck (PDF preferred)',
    businessPlanDoc: 'Business Plan (optional)',
    additionalDocuments: 'Additional Documents',
    addDocument: 'Add Document',
    documentName: 'Document Name',
    documentNamePlaceholder: 'e.g. Financial Projections',
    file: 'File',
    clickToUpload: 'Click to upload',
    add: 'Add',
    remove: 'Remove',

    // Step 5
    submitYourApplication: 'Submit Your Application',
    howDidYouHear: 'How did you hear about us?',
    confidentialityText: 'By submitting this application, you acknowledge that all information provided is accurate and complete. <strong>CEED is committed to preserving the confidentiality of all information submitted through this application.</strong> Your data will only be used for the purpose of evaluating your application and will not be shared with third parties without your prior consent.',
    submitApplication: 'Submit Application',
    submitting: 'Submitting...',

    // Modals
    possibleDuplicate: 'Possible Duplicate',
    duplicateMessage: 'An application with similar information already exists. Please confirm submission.',
    cancel: 'Cancel',
    submitAnyway: 'Submit Anyway',

    // Success
    applicationSubmitted: 'Application Submitted',
    thankYou: "Thank you for applying. We'll review your application and get back to you.",

    // Misc
    selectOption: 'Select...',

    // Errors
    fillRequired: 'Please fill in all required fields.',
    somethingWentWrong: 'Something went wrong. Please try again.',
  },
  fr: {
    // Apply page
    applyTitle: 'Postuler au Programme Startup',
    applySubtitle: 'Remplissez les informations ci-dessous pour soumettre votre candidature.',
    back: 'Retour',

    // Progress steps
    stepStartupInfo: 'Startup',
    stepFounders: 'Fondateurs',
    stepTraction: 'Traction',
    stepDocuments: 'Documents',
    stepSubmit: 'Envoi',

    // Step 1
    startupInformation: 'Informations sur la Startup',
    startupName: 'Nom de la startup',
    logo: 'Logo',
    logoHint: 'Téléchargez le logo de votre startup (optionnel)',
    creationDate: 'Date de création',
    sector: 'Secteur',
    website: 'Site web',
    linkedinPage: 'Page LinkedIn',
    shortDescription: 'Description courte',
    whoAreYourCustomers: 'Qui sont vos clients ?',
    describeCustomers: 'Décrivez vos clients cibles...',
    businessModelLabel: 'Modèle économique',
    businessModelPlaceholder: 'Comment générez-vous du chiffre d\'affaires ?',
    model: 'Modèle',
    stageMaturity: 'Stade / Maturité',
    next: 'Suivant',

    // Step 2
    founders: 'Fondateurs',
    leadFounder: 'Fondateur principal',
    coFounder: 'Co-fondateur',
    fullName: 'Nom complet',
    email: 'Email',
    phone: 'Téléphone',
    role: 'Rôle',
    linkedin: 'LinkedIn',
    addCoFounder: 'Ajouter un co-fondateur',

    // Step 3
    tractionInformation: 'Informations de Traction',
    tractionHint: 'Tous les champs sont optionnels. Tous les montants sont en MAD (Dirham marocain).',
    revenueLast12: 'Chiffre d\'affaires (12 derniers mois) - MAD',
    projectedRevenue: 'CA prévisionnel (12 prochains mois) - MAD',
    numberOfEmployees: 'Nombre d\'employés',
    numberOfUsers: 'Nombre d\'utilisateurs ou clients',
    haveYouRaisedFunds: 'Avez-vous levé des fonds ?',
    no: 'Non',
    yes: 'Oui',
    amountRaised: 'Montant levé - MAD',
    planningToRaise: 'Prévoyez-vous de lever des fonds ?',
    in6Months: 'Dans 6 mois',
    in12Months: 'Dans 12 mois',
    in18Months: 'Dans 18 mois',
    doYouHavePatent: 'Avez-vous un brevet ?',
    inProgress: 'En cours',
    totalInvestment: 'Investissement total à ce jour - MAD',

    // Step 4
    documents: 'Documents',
    pitchDeck: 'Pitch Deck (PDF de préférence)',
    businessPlanDoc: 'Business Plan (optionnel)',
    additionalDocuments: 'Documents supplémentaires',
    addDocument: 'Ajouter un document',
    documentName: 'Nom du document',
    documentNamePlaceholder: 'ex. Projections financières',
    file: 'Fichier',
    clickToUpload: 'Cliquez pour télécharger',
    add: 'Ajouter',
    remove: 'Supprimer',

    // Step 5
    submitYourApplication: 'Soumettre votre candidature',
    howDidYouHear: 'Comment avez-vous entendu parler de nous ?',
    confidentialityText: 'En soumettant cette candidature, vous reconnaissez que toutes les informations fournies sont exactes et complètes. <strong>CEED s\'engage à préserver la confidentialité de toutes les informations soumises via cette candidature.</strong> Vos données ne seront utilisées que dans le cadre de l\'évaluation de votre candidature et ne seront pas partagées avec des tiers sans votre consentement préalable.',
    submitApplication: 'Soumettre la candidature',
    submitting: 'Envoi en cours...',

    // Modals
    possibleDuplicate: 'Doublon possible',
    duplicateMessage: 'Une candidature avec des informations similaires existe déjà. Veuillez confirmer la soumission.',
    cancel: 'Annuler',
    submitAnyway: 'Soumettre quand même',

    // Success
    applicationSubmitted: 'Candidature soumise',
    thankYou: 'Merci pour votre candidature. Nous l\'examinerons et reviendrons vers vous.',

    // Misc
    selectOption: 'Sélectionner...',

    // Errors
    fillRequired: 'Veuillez remplir tous les champs obligatoires.',
    somethingWentWrong: 'Une erreur est survenue. Veuillez réessayer.',
  },
} as const

export type Translations = { [K in keyof typeof translations['en']]: string }

export function getTranslations(lang: Lang): Translations {
  return translations[lang] as Translations
}

// Dropdown label translations
const dropdownLabels = {
  en: {
    // Sectors
    sectors: {
      'AI': 'AI', 'Fintech': 'Fintech', 'Health': 'Health', 'E-commerce': 'E-commerce',
      'EdTech': 'EdTech', 'Gaming': 'Gaming', 'Tourism Tech': 'Tourism Tech', 'CleanTech': 'CleanTech',
      'AgriTech': 'AgriTech', 'PropTech': 'PropTech', 'MedTech': 'MedTech', 'Logistics': 'Logistics',
      'SaaS': 'SaaS', 'Marketplace': 'Marketplace', 'IoT': 'IoT', 'Cybersecurity': 'Cybersecurity',
      'RetailTech': 'RetailTech', 'Other': 'Other',
    },
    // Stages
    stages: {
      'Idea': 'Idea', 'Prototype': 'Prototype', 'MVP': 'MVP',
      'Product launched': 'Product launched', 'Traction': 'Traction',
    },
    // Roles
    roles: {
      'CEO': 'CEO', 'CTO': 'CTO', 'COO': 'COO', 'CFO': 'CFO', 'CMO': 'CMO', 'CPO': 'CPO',
      'Business Developer': 'Business Developer', 'Developer': 'Developer', 'Designer': 'Designer',
      'Marketing': 'Marketing', 'Operations': 'Operations', 'Other': 'Other',
    },
    // Sources
    sources: {
      'LinkedIn': 'LinkedIn', 'Google': 'Google', 'Social Media': 'Social Media',
      'Event': 'Event', 'Recommendation': 'Recommendation', 'University': 'University',
      'Press/Media': 'Press/Media', 'Newsletter': 'Newsletter', 'Partner': 'Partner', 'Other': 'Other',
    },
    // Business model types
    businessModelTypes: { 'B2B': 'B2B', 'B2C': 'B2C', 'Both': 'Both' },
    // Fundraising plan
    fundraisingPlans: {
      'No': 'No', 'In 6 months': 'In 6 months', 'In 12 months': 'In 12 months', 'In 18 months': 'In 18 months',
    },
    // Patent status
    patentStatuses: { 'No': 'No', 'Yes': 'Yes', 'In Progress': 'In Progress' },
  },
  fr: {
    sectors: {
      'AI': 'IA', 'Fintech': 'Fintech', 'Health': 'Santé', 'E-commerce': 'E-commerce',
      'EdTech': 'EdTech', 'Gaming': 'Jeux vidéo', 'Tourism Tech': 'Tourisme Tech', 'CleanTech': 'CleanTech',
      'AgriTech': 'AgriTech', 'PropTech': 'PropTech', 'MedTech': 'MedTech', 'Logistics': 'Logistique',
      'SaaS': 'SaaS', 'Marketplace': 'Marketplace', 'IoT': 'IoT', 'Cybersecurity': 'Cybersécurité',
      'RetailTech': 'RetailTech', 'Other': 'Autre',
    },
    stages: {
      'Idea': 'Idée', 'Prototype': 'Prototype', 'MVP': 'MVP',
      'Product launched': 'Produit lancé', 'Traction': 'Traction',
    },
    roles: {
      'CEO': 'CEO', 'CTO': 'CTO', 'COO': 'COO', 'CFO': 'CFO', 'CMO': 'CMO', 'CPO': 'CPO',
      'Business Developer': 'Développeur d\'affaires', 'Developer': 'Développeur', 'Designer': 'Designer',
      'Marketing': 'Marketing', 'Operations': 'Opérations', 'Other': 'Autre',
    },
    sources: {
      'LinkedIn': 'LinkedIn', 'Google': 'Google', 'Social Media': 'Réseaux sociaux',
      'Event': 'Événement', 'Recommendation': 'Recommandation', 'University': 'Université',
      'Press/Media': 'Presse/Médias', 'Newsletter': 'Newsletter', 'Partner': 'Partenaire', 'Other': 'Autre',
    },
    businessModelTypes: { 'B2B': 'B2B', 'B2C': 'B2C', 'Both': 'Les deux' },
    fundraisingPlans: {
      'No': 'Non', 'In 6 months': 'Dans 6 mois', 'In 12 months': 'Dans 12 mois', 'In 18 months': 'Dans 18 mois',
    },
    patentStatuses: { 'No': 'Non', 'Yes': 'Oui', 'In Progress': 'En cours' },
  },
} as const

export type DropdownLabels = typeof dropdownLabels['en']

export function getDropdownLabels(lang: Lang): DropdownLabels {
  return dropdownLabels[lang] as DropdownLabels
}
