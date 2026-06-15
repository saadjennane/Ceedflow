-- Simplify ratings: one score per (admin/juror × application × criterion) instead of per sub-criterion.
-- Existing per-sub_index scores are averaged into one per criterion.

-- ===== application_ratings (admin self-ratings) =====
CREATE TABLE application_ratings_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL CHECK (criterion IN (
    'innovation','problem_solution_fit','maturity','team','scalability','viability','morocco_impact'
  )),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (application_id, admin_id, criterion)
);

INSERT INTO application_ratings_v2 (application_id, admin_id, criterion, score, created_at, updated_at)
SELECT
  application_id,
  admin_id,
  criterion,
  GREATEST(1, LEAST(5, ROUND(AVG(score))::int)) AS score,
  MIN(created_at),
  MAX(updated_at)
FROM application_ratings
GROUP BY application_id, admin_id, criterion;

DROP TABLE application_ratings CASCADE;
ALTER TABLE application_ratings_v2 RENAME TO application_ratings;

CREATE INDEX idx_application_ratings_app ON application_ratings(application_id);
CREATE INDEX idx_application_ratings_admin ON application_ratings(admin_id);

ALTER TABLE application_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage application_ratings"
  ON application_ratings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER application_ratings_updated_at
  BEFORE UPDATE ON application_ratings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== juror_ratings (jury committee ratings) =====
CREATE TABLE juror_ratings_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  committee_id UUID NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  juror_id UUID NOT NULL REFERENCES jurors(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL CHECK (criterion IN (
    'innovation','problem_solution_fit','maturity','team','scalability','viability','morocco_impact'
  )),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (committee_id, juror_id, application_id, criterion)
);

INSERT INTO juror_ratings_v2 (committee_id, juror_id, application_id, criterion, score, created_at, updated_at)
SELECT
  committee_id,
  juror_id,
  application_id,
  criterion,
  GREATEST(1, LEAST(5, ROUND(AVG(score))::int)) AS score,
  MIN(created_at),
  MAX(updated_at)
FROM juror_ratings
GROUP BY committee_id, juror_id, application_id, criterion;

DROP TABLE juror_ratings CASCADE;
ALTER TABLE juror_ratings_v2 RENAME TO juror_ratings;

CREATE INDEX idx_juror_ratings_committee ON juror_ratings(committee_id);
CREATE INDEX idx_juror_ratings_juror_app ON juror_ratings(juror_id, application_id);

ALTER TABLE juror_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage juror_ratings"
  ON juror_ratings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER juror_ratings_updated_at
  BEFORE UPDATE ON juror_ratings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
