-- Per-juror to-do actions (mirror of application_actions, scoped to a juror).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS juror_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  juror_id UUID NOT NULL REFERENCES jurors(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_juror_actions_juror ON juror_actions(juror_id);
CREATE INDEX IF NOT EXISTS idx_juror_actions_assigned ON juror_actions(assigned_admin_id);

ALTER TABLE juror_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage juror_actions"
    ON juror_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
