-- Applications table
CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  startup_name TEXT NOT NULL,
  website TEXT,
  sector TEXT NOT NULL CHECK (sector IN ('Tourism Tech', 'Gaming', 'AI', 'Fintech', 'Health', 'Other')),
  source TEXT NOT NULL CHECK (source IN ('LinkedIn', 'Event', 'Recommendation', 'Google', 'Other')),
  description TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('Idea', 'Prototype', 'MVP', 'Product launched', 'Traction')),
  revenue_last_12_months TEXT,
  employees TEXT,
  users_or_customers TEXT,
  raised_funds BOOLEAN DEFAULT false,
  funds_amount TEXT,
  total_investment TEXT,
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Very interesting', 'Interesting', 'Average', 'Not interesting')),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('High', 'Normal', 'Low')),
  assigned_admin_id UUID REFERENCES auth.users(id),
  next_action TEXT CHECK (next_action IN ('Call founder', 'Schedule meeting', 'Request more information', 'Keep as backup', 'Closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Founders table
CREATE TABLE founders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CEO', 'CTO', 'COO', 'Other')),
  linkedin TEXT,
  is_primary BOOLEAN DEFAULT false
);

-- Documents table
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pitch_deck', 'business_plan', 'additional')),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Notes table
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity log table
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_sector ON applications(sector);
CREATE INDEX idx_applications_stage ON applications(stage);
CREATE INDEX idx_applications_priority ON applications(priority);
CREATE INDEX idx_applications_assigned ON applications(assigned_admin_id);
CREATE INDEX idx_applications_created ON applications(created_at DESC);
CREATE INDEX idx_founders_application ON founders(application_id);
CREATE INDEX idx_founders_email ON founders(email);
CREATE INDEX idx_notes_application ON notes(application_id);
CREATE INDEX idx_activity_log_application ON activity_log(application_id);

-- Enable Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE founders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Public can insert applications, founders, documents
CREATE POLICY "Anyone can insert applications" ON applications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert founders" ON founders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert documents" ON documents
  FOR INSERT WITH CHECK (true);

-- Public can read applications for duplicate checking
CREATE POLICY "Anyone can read applications for duplicate check" ON applications
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read founders for duplicate check" ON founders
  FOR SELECT USING (true);

-- Authenticated users can do everything
CREATE POLICY "Authenticated users can read applications" ON applications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update applications" ON applications
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read founders" ON founders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read documents" ON documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage notes" ON notes
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage activity_log" ON activity_log
  FOR ALL TO authenticated USING (true);

-- Create storage bucket for application documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true);

-- Allow anyone to upload to documents bucket
CREATE POLICY "Anyone can upload documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');

-- Allow anyone to read documents
CREATE POLICY "Anyone can read documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
