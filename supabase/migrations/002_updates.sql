-- Add logo_url column to applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add new fields to applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS creation_date DATE;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS linkedin_page TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS customers TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS business_model TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS business_model_type TEXT DEFAULT 'B2B'
  CHECK (business_model_type IN ('B2B', 'B2C', 'Both'));

-- Add projected revenue column
ALTER TABLE applications ADD COLUMN IF NOT EXISTS projected_revenue_next_12_months TEXT;

-- Add fundraising_plan and patent_status columns
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fundraising_plan TEXT DEFAULT 'No'
  CHECK (fundraising_plan IN ('No', 'In 6 months', 'In 12 months', 'In 18 months'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS patent_status TEXT DEFAULT 'No'
  CHECK (patent_status IN ('No', 'Yes', 'In Progress'));

-- Add custom_name column to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS custom_name TEXT;

-- Update sector CHECK constraint to include new sectors
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_sector_check;
ALTER TABLE applications ADD CONSTRAINT applications_sector_check
  CHECK (sector IN (
    'Tourism Tech', 'Gaming', 'AI', 'Fintech', 'Health',
    'E-commerce', 'EdTech', 'CleanTech', 'AgriTech', 'PropTech',
    'MedTech', 'Logistics', 'SaaS', 'Marketplace', 'IoT',
    'Cybersecurity', 'RetailTech', 'Other'
  ));

-- Update source CHECK constraint to include new sources
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_source_check;
ALTER TABLE applications ADD CONSTRAINT applications_source_check
  CHECK (source IN (
    'LinkedIn', 'Event', 'Recommendation', 'Google',
    'Social Media', 'University', 'Press/Media', 'Newsletter', 'Partner',
    'Other'
  ));

-- Update founder role CHECK constraint to include new roles
ALTER TABLE founders DROP CONSTRAINT IF EXISTS founders_role_check;
ALTER TABLE founders ADD CONSTRAINT founders_role_check
  CHECK (role IN (
    'CEO', 'CTO', 'COO', 'CFO', 'CMO', 'CPO',
    'Business Developer', 'Developer', 'Designer',
    'Marketing', 'Operations', 'Other'
  ));
