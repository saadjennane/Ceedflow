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
