-- Every block carries an action. This adds what those actions record.

-- A sitting of a Selection committee block. One block, N sittings.
create table if not exists committee_sessions (
  id                  text primary key,
  block_id            text        not null references blocks(id) on delete cascade,
  name                text        not null,
  held_on             date,
  starts_at           text        not null default '09:00',
  ends_at             text        not null default '13:00',
  minutes_per_startup integer     not null default 25,
  location            text        not null default '',
  jury                jsonb       not null default '[]'::jsonb,
  position            integer     not null default 0
);
create index if not exists sessions_block_idx on committee_sessions(block_id, position);

-- Which startup is seen at which sitting, and how they answered.
create table if not exists committee_assignments (
  id           text primary key,
  session_id   text        not null references committee_sessions(id) on delete cascade,
  candidate_id text        not null references candidates(id) on delete cascade,
  token        text        not null unique,
  rsvp_state   text        not null default 'pending',
  slot_index   integer,
  responded_at timestamptz,
  unique (session_id, candidate_id),
  constraint rsvp_state_check check (rsvp_state in ('pending','confirmed','declined'))
);
create index if not exists assignments_session_idx on committee_assignments(session_id);
create index if not exists assignments_candidate_idx on committee_assignments(candidate_id);

-- The status an evaluation or a committee puts on a candidate.
create table if not exists block_outcomes (
  block_id     text        not null references blocks(id) on delete cascade,
  candidate_id text        not null references candidates(id) on delete cascade,
  outcome_id   text        not null,
  overridden   boolean     not null default false,
  decided_at   timestamptz not null default now(),
  primary key (block_id, candidate_id)
);

-- A prospecting send from a Sourcing block. Composed and recorded here; no mail
-- leaves the system until a routing provider is wired in.
create table if not exists outreach_sends (
  id         text        primary key,
  block_id   text        not null references blocks(id) on delete cascade,
  subject    text        not null default '',
  body       text        not null default '',
  recipients jsonb       not null default '[]'::jsonb,
  sent_at    timestamptz not null default now()
);
create index if not exists outreach_block_idx on outreach_sends(block_id, sent_at);

-- Scores now hang off a sitting as well as a block, so a jury's marks are
-- attributable to the committee they sat on.
alter table evaluation_scores add column if not exists session_id text
  references committee_sessions(id) on delete set null;
