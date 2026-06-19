-- Campaigns v2: multi-audience (application | juror), togglable unsubscribe/tracking,
-- persisted filter snapshot. Plus a flexible tag system for applications.
-- Idempotent: safe to re-run. Also self-healing: creates the base 012 schema
-- (email_campaigns / email_sends / status enums / opt-out flags) if missing.

-- 0) Base schema (mirrors 012). Idempotent.
DO $$ BEGIN
  CREATE TYPE email_campaign_status AS ENUM ('draft', 'sending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_send_status AS ENUM ('queued', 'sent', 'failed', 'bounced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status email_campaign_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created ON email_campaigns(created_at DESC);

-- updated_at trigger (uses the shared update_updated_at function from earlier migrations)
DO $$ BEGIN
  CREATE TRIGGER email_campaigns_updated_at
    BEFORE UPDATE ON email_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS email_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  startup_name TEXT,
  tracking_token TEXT NOT NULL UNIQUE,
  status email_send_status NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_token ON email_sends(tracking_token);
CREATE INDEX IF NOT EXISTS idx_email_sends_application ON email_sends(application_id);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage email_campaigns"
    ON email_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage email_sends"
    ON email_sends FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) New enum for who the campaign targets
DO $$ BEGIN
  CREATE TYPE email_campaign_audience AS ENUM ('application', 'juror');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend email_campaigns
DO $$ BEGIN
  ALTER TABLE email_campaigns ADD COLUMN audience_type email_campaign_audience NOT NULL DEFAULT 'application';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE email_campaigns ADD COLUMN include_unsubscribe BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE email_campaigns ADD COLUMN include_tracking_pixel BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE email_campaigns ADD COLUMN filters_json JSONB;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3) Extend email_sends to support juror audience
DO $$ BEGIN
  ALTER TABLE email_sends ADD COLUMN audience_type email_campaign_audience NOT NULL DEFAULT 'application';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE email_sends ADD COLUMN juror_id UUID REFERENCES jurors(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_email_sends_juror ON email_sends(juror_id);

-- 4) Opt-out flag on jurors (parallel to applications.do_not_contact)
ALTER TABLE jurors ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jurors ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- 5) Flexible tag system for applications
CREATE TABLE IF NOT EXISTS application_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS application_tag_assignments (
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES application_tags(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (application_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_application_tag_assignments_app ON application_tag_assignments(application_id);
CREATE INDEX IF NOT EXISTS idx_application_tag_assignments_tag ON application_tag_assignments(tag_id);

ALTER TABLE application_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_tag_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage application_tags"
    ON application_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage application_tag_assignments"
    ON application_tag_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
