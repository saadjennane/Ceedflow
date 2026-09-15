-- CEED — core programme model.
-- Program -> Edition -> Track -> Phase -> Block, with polymorphic block config in JSONB.

create table if not exists programs (
  id          text primary key,
  name        text        not null,
  code        text        not null default '',
  type        text        not null default 'Incubation',
  summary     text        not null default '',
  partner     text        not null default '',
  colour      text        not null default '#2F5BFF',
  created_at  timestamptz not null default now()
);

create table if not exists editions (
  id          text primary key,
  program_id  text        not null references programs(id) on delete cascade,
  name        text        not null,
  status      text        not null default 'Draft',
  starts_on   date,
  ends_on     date,
  city        text        not null default '',
  seats       integer     not null default 0,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  constraint editions_status_check check (status in ('Draft','Published','Running','Completed'))
);
create index if not exists editions_program_idx on editions(program_id, position);

create table if not exists tracks (
  id          text primary key,
  edition_id  text        not null references editions(id) on delete cascade,
  name        text        not null,
  is_default  boolean     not null default false,
  position    integer     not null default 0
);
create index if not exists tracks_edition_idx on tracks(edition_id, position);

create table if not exists phases (
  id          text primary key,
  track_id    text        not null references tracks(id) on delete cascade,
  name        text        not null,
  starts_on   date,
  ends_on     date,
  position    integer     not null default 0
);
create index if not exists phases_track_idx on phases(track_id, position);

create table if not exists blocks (
  id          text primary key,
  phase_id    text        not null references phases(id) on delete cascade,
  type        text        not null,
  name        text        not null,
  position    integer     not null default 0,
  config      jsonb       not null default '{}'::jsonb
);
create index if not exists blocks_phase_idx on blocks(phase_id, position);

-- Candidates enter through an application block and move through the funnel.
create table if not exists candidates (
  id              text primary key,
  edition_id      text        not null references editions(id) on delete cascade,
  track_id        text        not null references tracks(id) on delete cascade,
  origin_block_id text,
  org_name        text        not null,
  contact_name    text        not null default '',
  email           text        not null default '',
  phone           text        not null default '',
  source          text        not null default '',
  status          text        not null default 'Applied',
  answers         jsonb       not null default '{}'::jsonb,
  submitted_at    timestamptz not null default now()
);
create index if not exists candidates_edition_idx on candidates(edition_id);
create index if not exists candidates_track_idx on candidates(track_id);

create table if not exists evaluation_scores (
  id             text primary key,
  block_id       text        not null references blocks(id) on delete cascade,
  candidate_id   text        not null references candidates(id) on delete cascade,
  evaluator_id   text        not null,
  evaluator_name text        not null default '',
  marks          jsonb       not null default '{}'::jsonb,
  comment        text        not null default '',
  submitted_at   timestamptz,
  unique (block_id, candidate_id, evaluator_id)
);
create index if not exists scores_block_idx on evaluation_scores(block_id);

create table if not exists selection_outcomes (
  block_id     text        not null references blocks(id) on delete cascade,
  candidate_id text        not null references candidates(id) on delete cascade,
  outcome      text        not null,
  overridden   boolean     not null default false,
  decided_at   timestamptz not null default now(),
  primary key (block_id, candidate_id),
  constraint outcome_check check (outcome in ('pass','fail'))
);
