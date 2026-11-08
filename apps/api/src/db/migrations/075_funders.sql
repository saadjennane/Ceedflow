-- Le suivi des opportunités, bailleur par bailleur : une étape simple, et
-- chaque changement daté.
alter table funding_opportunities add column if not exists stage text not null default 'identified';
alter table funding_opportunities drop constraint if exists funding_opportunities_stage_check;
alter table funding_opportunities add constraint funding_opportunities_stage_check
  check (stage in ('identified', 'exploring', 'preparing', 'submitted', 'won', 'lost', 'dropped'));
alter table funding_opportunities add column if not exists stage_changed_at timestamptz not null default now();

create table if not exists funding_opportunity_events (
  id             text primary key,
  opportunity_id text        not null references funding_opportunities(id) on delete cascade,
  stage          text        not null,
  by_id          text        references records(id) on delete set null,
  by_name        text        not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists funding_opportunity_events_opp on funding_opportunity_events (opportunity_id, created_at);
