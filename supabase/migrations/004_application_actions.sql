-- Multiple actions per application, each assignable to an admin

CREATE TABLE application_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'Call founder', 'Schedule meeting', 'Request more information', 'Keep as backup'
  )),
  assigned_admin_id UUID REFERENCES auth.users(id),
  is_done BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_application_actions_app ON application_actions(application_id);
CREATE INDEX idx_application_actions_assigned ON application_actions(assigned_admin_id);

ALTER TABLE application_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage application_actions"
  ON application_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);
