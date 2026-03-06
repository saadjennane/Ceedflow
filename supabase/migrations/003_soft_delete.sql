-- Add soft delete column
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering active vs deleted applications
CREATE INDEX idx_applications_deleted_at ON applications(deleted_at);
