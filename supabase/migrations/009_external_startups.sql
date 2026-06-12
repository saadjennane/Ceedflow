-- External startups scraped from sources like thepulse.ma — internal CRM

CREATE TYPE external_startup_status AS ENUM ('new', 'reviewed', 'interested', 'contacted', 'not_relevant');

CREATE TABLE external_startups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'thepulse.ma',
  external_id TEXT NOT NULL,
  source_url TEXT,

  -- Scraped data
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  sectors TEXT[] DEFAULT '{}',
  stage TEXT,
  status TEXT,
  city TEXT,
  country TEXT,
  founding_year INTEGER,
  employee_count TEXT,
  maturity_pct INTEGER,

  -- Funding
  total_funding TEXT,
  latest_round TEXT,
  latest_round_date TEXT,
  lead_investor TEXT,
  other_investors TEXT[] DEFAULT '{}',

  -- Team
  founders JSONB DEFAULT '[]'::jsonb,

  -- Web presence
  website TEXT,
  linkedin TEXT,

  -- Business
  notable_clients TEXT[] DEFAULT '{}',

  -- Backup of full scraped data
  raw_data JSONB DEFAULT '{}'::jsonb,

  -- Scrape metadata
  first_scraped_at TIMESTAMPTZ DEFAULT now(),
  last_scraped_at TIMESTAMPTZ DEFAULT now(),

  -- Internal CRM
  status_internal external_startup_status NOT NULL DEFAULT 'new',
  notes TEXT,
  contacted_at TIMESTAMPTZ,
  contacted_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  UNIQUE (source, external_id)
);

CREATE INDEX idx_external_startups_status ON external_startups(status_internal);
CREATE INDEX idx_external_startups_sectors ON external_startups USING GIN(sectors);
CREATE INDEX idx_external_startups_stage ON external_startups(stage);
CREATE INDEX idx_external_startups_city ON external_startups(city);
CREATE INDEX idx_external_startups_name ON external_startups(name);

ALTER TABLE external_startups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read external_startups"
  ON external_startups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update external_startups"
  ON external_startups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Sync log (track scrape runs)
CREATE TABLE external_startups_sync_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  pages_scanned INTEGER DEFAULT 0,
  startups_seen INTEGER DEFAULT 0,
  startups_inserted INTEGER DEFAULT 0,
  startups_updated INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_log TEXT
);

ALTER TABLE external_startups_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read sync runs" ON external_startups_sync_runs FOR SELECT TO authenticated USING (true);
