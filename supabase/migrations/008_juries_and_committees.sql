-- Jurors, committees, committee↔application, committee↔juror, juror decisions, juror ratings

CREATE TABLE jurors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER jurors_updated_at
  BEFORE UPDATE ON jurors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE committees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER committees_updated_at
  BEFORE UPDATE ON committees FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE committee_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  committee_id UUID NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  admin_override_decision TEXT CHECK (admin_override_decision IS NULL OR admin_override_decision IN ('retenu', 'rejete')),
  admin_override_by UUID REFERENCES auth.users(id),
  admin_override_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (committee_id, application_id)
);
CREATE INDEX idx_committee_applications_committee ON committee_applications(committee_id);
CREATE INDEX idx_committee_applications_application ON committee_applications(application_id);

CREATE TABLE committee_jurors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  committee_id UUID NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  juror_id UUID NOT NULL REFERENCES jurors(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (committee_id, juror_id)
);
CREATE INDEX idx_committee_jurors_committee ON committee_jurors(committee_id);
CREATE INDEX idx_committee_jurors_juror ON committee_jurors(juror_id);

CREATE TABLE juror_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  committee_id UUID NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  juror_id UUID NOT NULL REFERENCES jurors(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('retenu', 'rejete')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (committee_id, juror_id, application_id)
);
CREATE INDEX idx_juror_decisions_committee ON juror_decisions(committee_id);
CREATE INDEX idx_juror_decisions_juror ON juror_decisions(juror_id);

CREATE TRIGGER juror_decisions_updated_at
  BEFORE UPDATE ON juror_decisions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE juror_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  committee_id UUID NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  juror_id UUID NOT NULL REFERENCES jurors(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL CHECK (criterion IN (
    'innovation','problem_solution_fit','maturity','team','scalability','viability','morocco_impact'
  )),
  sub_index INTEGER NOT NULL CHECK (sub_index >= 0),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (committee_id, juror_id, application_id, criterion, sub_index)
);
CREATE INDEX idx_juror_ratings_committee ON juror_ratings(committee_id);
CREATE INDEX idx_juror_ratings_juror_app ON juror_ratings(juror_id, application_id);

CREATE TRIGGER juror_ratings_updated_at
  BEFORE UPDATE ON juror_ratings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE juror_rating_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  committee_id UUID NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  juror_id UUID NOT NULL REFERENCES jurors(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL CHECK (criterion IN (
    'innovation','problem_solution_fit','maturity','team','scalability','viability','morocco_impact'
  )),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (committee_id, juror_id, application_id, criterion)
);
CREATE INDEX idx_juror_rating_comments_app ON juror_rating_comments(committee_id, application_id);

CREATE TRIGGER juror_rating_comments_updated_at
  BEFORE UPDATE ON juror_rating_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE jurors ENABLE ROW LEVEL SECURITY;
ALTER TABLE committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_jurors ENABLE ROW LEVEL SECURITY;
ALTER TABLE juror_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE juror_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE juror_rating_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated manage jurors" ON jurors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage committees" ON committees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage committee_applications" ON committee_applications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage committee_jurors" ON committee_jurors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage juror_decisions" ON juror_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage juror_ratings" ON juror_ratings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage juror_rating_comments" ON juror_rating_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
