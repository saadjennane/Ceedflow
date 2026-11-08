-- Funding Intelligence : des appels d'offres analysés, les actions qui en
-- découlent, et les opportunités qu'on choisit de garder. Le document est
-- dans `uploads` ; rien n'entre dans l'annuaire sans un clic.
create table if not exists funding_analyses (
  id              text primary key,
  title           text        not null default '',
  source_kind     text        not null default 'text',
  upload_id       text        references uploads(id) on delete set null,
  filename        text        not null default '',
  -- Le texte extrait, page par page : « [Page 3] … ».
  text            text        not null,
  pages           integer     not null default 0,
  truncated       boolean     not null default false,
  status          text        not null default 'pending',
  result          jsonb,
  error           text        not null default '',
  provider        text        not null default '',
  model           text        not null default '',
  web             jsonb       not null default '{"status": "none", "error": "", "ranAt": null, "findings": [], "sources": []}'::jsonb,
  created_by      text        references records(id) on delete set null,
  created_by_name text        not null default '',
  analysed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status in ('pending', 'done', 'failed')),
  check (source_kind in ('pdf', 'text'))
);
create index if not exists funding_analyses_time on funding_analyses (created_at desc);

create table if not exists funding_actions (
  id              text primary key,
  analysis_id     text        not null references funding_analyses(id) on delete cascade,
  position        integer     not null default 0,
  title           text        not null default '',
  description     text        not null default '',
  priority        text        not null default 'medium',
  opportunity_key text,
  rationale       text        not null default '',
  assignee_id     text        references records(id) on delete set null,
  status          text        not null default 'proposed',
  task_id         text        references tasks(id) on delete set null,
  error           text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status in ('proposed', 'creating', 'created', 'dismissed', 'failed')),
  check (priority in ('high', 'medium', 'low'))
);
create index if not exists funding_actions_analysis on funding_actions (analysis_id, position);

create table if not exists funding_opportunities (
  id              text primary key,
  analysis_id     text        references funding_analyses(id) on delete set null,
  opportunity_key text        not null default '',
  type            text        not null,
  title           text        not null,
  organization    text        not null default '',
  record_id       text        references records(id) on delete set null,
  relevance       text        not null default 'medium',
  summary         text        not null default '',
  -- Tout le reste de l'opportunité, ses sources et sa vérification élément par élément.
  details         jsonb       not null default '{}'::jsonb,
  created_by      text        references records(id) on delete set null,
  created_by_name text        not null default '',
  created_at      timestamptz not null default now(),
  check (type in ('identified_tender', 'future_opportunity', 'strategic_prospecting', 'project_concept')),
  check (relevance in ('high', 'medium', 'low'))
);
create unique index if not exists funding_opportunities_once on funding_opportunities (analysis_id, opportunity_key) where analysis_id is not null;
