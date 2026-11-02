-- Les indicateurs que CEED saisit lui-même pour une édition (budget consommé,
-- événements, partenaires…), un moment après l'autre.
create table if not exists team_indicator_values (
  edition_id   text        not null,
  moment_id    text        not null,
  indicator_id text        not null,
  value        jsonb       not null,
  by_name      text        not null default '',
  updated_at   timestamptz not null default now(),
  primary key (edition_id, moment_id, indicator_id)
);
