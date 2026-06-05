-- Multi-criteria rating: 1 row per (application, admin, criterion)
-- Scale: 1-5 stars. Comment optional per criterion.

CREATE TABLE application_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL CHECK (criterion IN (
    'innovation',
    'problem_solution_fit',
    'maturity',
    'team',
    'scalability',
    'viability',
    'morocco_impact'
  )),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (application_id, admin_id, criterion)
);

CREATE INDEX idx_application_ratings_app ON application_ratings(application_id);
CREATE INDEX idx_application_ratings_admin ON application_ratings(admin_id);

ALTER TABLE application_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage application_ratings"
  ON application_ratings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER application_ratings_updated_at
  BEFORE UPDATE ON application_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
