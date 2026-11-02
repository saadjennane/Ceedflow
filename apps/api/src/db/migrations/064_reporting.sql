-- Le reporting : les indicateurs d'un programme et d'une édition, les moments
-- de mesure, et ce que chaque startup y a répondu — figé à l'envoi.

-- Une ligne par programme (ses indicateurs) et par édition (les siens, ses
-- moments, ses lettres).
create table if not exists reporting_setups (
  scope_id   text        primary key,
  config     jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists kpi_responses (
  moment_id    text        not null,
  edition_id   text        not null,
  candidate_id text        not null references candidates(id) on delete cascade,
  answers      jsonb       not null default '{}'::jsonb,
  submitted_at timestamptz,
  submitted_by text        not null default '',
  updated_at   timestamptz not null default now(),
  primary key (moment_id, candidate_id)
);
create index if not exists kpi_responses_edition on kpi_responses (edition_id);
