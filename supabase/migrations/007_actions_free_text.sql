-- Allow free-text action titles (drop the CHECK constraint on action_type)

ALTER TABLE application_actions
  DROP CONSTRAINT IF EXISTS application_actions_action_type_check;
