export type Sector =
  | 'Tourism Tech' | 'Gaming' | 'AI' | 'Fintech' | 'Health'
  | 'E-commerce' | 'EdTech' | 'CleanTech' | 'AgriTech' | 'PropTech'
  | 'MedTech' | 'Logistics' | 'SaaS' | 'Marketplace' | 'IoT'
  | 'Cybersecurity' | 'RetailTech' | 'Other'

export type Source =
  | 'LinkedIn' | 'Event' | 'Recommendation' | 'Google'
  | 'Social Media' | 'University' | 'Press/Media' | 'Newsletter' | 'Partner'
  | 'Other'

export type Stage = 'Idea' | 'Prototype' | 'MVP' | 'Product launched' | 'Traction'
export type FounderRole = 'CEO' | 'CTO' | 'COO' | 'CFO' | 'CMO' | 'CPO' | 'Business Developer' | 'Developer' | 'Designer' | 'Marketing' | 'Operations' | 'Other'
export type ApplicationStatus = 'New' | 'Very interesting' | 'Interesting' | 'Average' | 'Not interesting'
export type Priority = 'High' | 'Normal' | 'Low'
export type NextAction = 'Call founder' | 'Schedule meeting' | 'Request more information' | 'Keep as backup' | 'Closed'
export interface ApplicationAction {
  id: string
  application_id: string
  action_type: string
  assigned_admin_id?: string | null
  is_done: boolean
  created_by?: string | null
  created_at: string
  completed_at?: string | null
}

export type RatingCriterionKey =
  | 'innovation'
  | 'problem_solution_fit'
  | 'maturity'
  | 'team'
  | 'scalability'
  | 'viability'
  | 'morocco_impact'

export interface RatingCriterion {
  key: RatingCriterionKey
  label: string
  sublabels: string[]
}

export const RATING_CRITERIA: RatingCriterion[] = [
  {
    key: 'innovation',
    label: 'Caractère innovant',
    sublabels: [
      'Originalité et différenciation de la solution vs. concurrents',
      "Existence d'un avantage concurrentiel durable (technologie, brevet…)",
      'Potentiel de disruption dans le secteur adressé',
    ],
  },
  {
    key: 'problem_solution_fit',
    label: 'Adéquation problème / solution',
    sublabels: [
      'Pertinence et réalité du problème identifié (taille, acuité)',
      'Solidité de la réponse apportée au problème — logique produit/marché',
      'Validation par des utilisateurs cibles (interviews, tests, pilotes…)',
    ],
  },
  {
    key: 'maturity',
    label: 'Maturité du projet',
    sublabels: [
      'Stade de développement : PoC validé → prototype → MVP fonctionnel',
      'Qualité et fonctionnalités du prototype / MVP existant',
      'Clarté de la roadmap produit court terme (3-6 mois)',
    ],
  },
  {
    key: 'team',
    label: 'Maîtrise du projet',
    sublabels: [
      "Compétences techniques de l'équipe fondatrice (adéquation métier)",
      'Compétences managériales et entrepreneuriales des porteurs',
      "Complémentarité des profils au sein de l'équipe fondatrice",
      'Engagement et disponibilité à temps plein dans le projet',
    ],
  },
  {
    key: 'scalability',
    label: 'Scalabilité & potentiel de marché',
    sublabels: [
      'Taille adressable du marché (TAM, SAM, SOM)',
      "Potentiel de passage à l'échelle (scalabilité du modèle)",
      'Ambition de développement au-delà du Maroc (régional, international)',
    ],
  },
  {
    key: 'viability',
    label: 'Viabilité économique',
    sublabels: [
      'Cohérence et solidité du modèle économique (sources de revenus)',
      "Clarté des hypothèses financières et du plan d'investissement",
      "Capacité à mobiliser l'autofinancement requis (10% minimum)",
    ],
  },
  {
    key: 'morocco_impact',
    label: 'Impact & valeur ajoutée Maroc',
    sublabels: [
      'Contribution au développement numérique et économique du Maroc',
      "Potentiel de création d'emplois post-accompagnement",
      'Alignement avec les priorités de Digital Morocco 2030',
    ],
  },
]

export interface ApplicationRating {
  id: string
  application_id: string
  admin_id: string
  criterion: RatingCriterionKey
  sub_index: number
  score: number
  created_at: string
  updated_at: string
}

export interface ApplicationRatingComment {
  id: string
  application_id: string
  admin_id: string
  criterion: RatingCriterionKey
  comment: string
  created_at: string
  updated_at: string
}

export interface Founder {
  id?: string
  application_id?: string
  full_name: string
  email: string
  phone: string
  role: FounderRole
  linkedin?: string
  is_primary: boolean
}

export type BusinessModelType = 'B2B' | 'B2C' | 'Both'
export type FundraisingPlan = 'No' | 'In 6 months' | 'In 12 months' | 'In 18 months'
export type PatentStatus = 'No' | 'Yes' | 'In Progress'

export interface Application {
  id: string
  startup_name: string
  creation_date?: string
  website?: string
  linkedin_page?: string
  logo_url?: string
  sector: Sector
  source: Source
  description: string
  customers?: string
  business_model?: string
  business_model_type?: BusinessModelType
  stage: Stage
  revenue_last_12_months?: string
  projected_revenue_next_12_months?: string
  employees?: string
  users_or_customers?: string
  raised_funds?: boolean
  funds_amount?: string
  fundraising_plan?: FundraisingPlan
  patent_status?: PatentStatus
  total_investment?: string
  status: ApplicationStatus
  priority: Priority
  assigned_admin_id?: string
  next_action?: NextAction
  created_at: string
  updated_at?: string
  deleted_at?: string
  founders?: Founder[]
  documents?: Document[]
  notes?: Note[]
  activity_log?: ActivityLog[]
  application_actions?: ApplicationAction[]
  application_ratings?: ApplicationRating[]
  application_rating_comments?: ApplicationRatingComment[]
}

export interface Document {
  id: string
  application_id: string
  file_url: string
  file_name: string
  file_type: 'pitch_deck' | 'business_plan' | 'additional'
  custom_name?: string
  uploaded_at: string
}

export interface Note {
  id: string
  application_id: string
  author_user_id: string
  author_email?: string
  text: string
  created_at: string
}

export interface ActivityLog {
  id: string
  application_id: string
  actor_user_id: string
  actor_email?: string
  action_type: string
  old_value?: string
  new_value?: string
  created_at: string
}

export interface ApplicationFormData {
  startup_name: string
  creation_date?: string
  website?: string
  linkedin_page?: string
  logo_url?: string
  sector: Sector
  source: Source
  description: string
  customers?: string
  business_model?: string
  business_model_type?: BusinessModelType
  stage: Stage
  revenue_last_12_months?: string
  projected_revenue_next_12_months?: string
  employees?: string
  users_or_customers?: string
  raised_funds?: boolean
  funds_amount?: string
  fundraising_plan?: FundraisingPlan
  patent_status?: PatentStatus
  total_investment?: string
  founders: Founder[]
}

export interface AdminUser {
  id: string
  email: string
  first_name?: string
  last_name?: string
}

export interface Juror {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  role?: string | null
  created_at: string
}

export type CommitteeStatus = 'draft' | 'active' | 'closed'
export type CommitteeDecision = 'retenu' | 'rejete'

export interface Committee {
  id: string
  name: string
  description?: string | null
  status: CommitteeStatus
  created_at: string
  updated_at: string
}

export interface CommitteeApplication {
  id: string
  committee_id: string
  application_id: string
  admin_override_decision?: CommitteeDecision | null
  admin_override_by?: string | null
  admin_override_at?: string | null
  created_at: string
}

export interface CommitteeJuror {
  id: string
  committee_id: string
  juror_id: string
  access_token: string
  created_at: string
}

export interface JurorDecision {
  id: string
  committee_id: string
  juror_id: string
  application_id: string
  decision: CommitteeDecision
  created_at: string
  updated_at: string
}

export interface JurorRating {
  id: string
  committee_id: string
  juror_id: string
  application_id: string
  criterion: RatingCriterionKey
  sub_index: number
  score: number
  created_at: string
  updated_at: string
}

export interface JurorRatingComment {
  id: string
  committee_id: string
  juror_id: string
  application_id: string
  criterion: RatingCriterionKey
  comment: string
  created_at: string
  updated_at: string
}

export type ExternalStartupStatus = 'new' | 'reviewed' | 'interested' | 'contacted' | 'not_relevant'

export interface ExternalStartupFounder {
  name: string
  role?: string
}

export interface ExternalStartup {
  id: string
  source: string
  external_id: string
  source_url?: string | null

  name: string
  logo_url?: string | null
  description?: string | null
  sectors: string[]
  stage?: string | null
  status?: string | null
  city?: string | null
  country?: string | null
  founding_year?: number | null
  employee_count?: string | null
  maturity_pct?: number | null

  total_funding?: string | null
  latest_round?: string | null
  latest_round_date?: string | null
  lead_investor?: string | null
  other_investors: string[]

  founders: ExternalStartupFounder[]

  website?: string | null
  linkedin?: string | null

  notable_clients: string[]

  raw_data?: Record<string, unknown>

  first_scraped_at: string
  last_scraped_at: string

  status_internal: ExternalStartupStatus
  notes?: string | null
  contacted_at?: string | null
  contacted_by?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
}

export interface ExternalStartupSyncRun {
  id: string
  source: string
  started_at: string
  finished_at?: string | null
  pages_scanned: number
  startups_seen: number
  startups_inserted: number
  startups_updated: number
  errors: number
  status: 'running' | 'completed' | 'failed'
  error_log?: string | null
}
