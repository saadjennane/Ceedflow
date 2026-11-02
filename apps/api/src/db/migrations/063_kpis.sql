-- Les KPI : un attribut suivi dans le temps, une valeur par période.

-- Un attribut ajouté devient KPI avec sa périodicité ; nul, il ne l'est pas.
alter table org_attributes add column if not exists kpi_period text;

-- Les attributs fixes suivis comme KPI, et leur périodicité — nulle : pas
-- suivi. Sans ligne, le défaut du code (le chiffre d'affaires l'est, par an) :
-- aucune donnée posée ici, pour qu'une restauration retrouve une table vide.
create table if not exists kpi_settings (
  key    text primary key,
  period text
);

-- Une valeur par organisation, par KPI et par période. Le chiffre d'affaires
-- garde sa table annuelle ; le montant levé se lit dans les levées.
create table if not exists org_kpi_points (
  org_id     text        not null references records(id) on delete cascade,
  key        text        not null,
  period     text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, key, period)
);
-- Un fichier de KPI (une version du pitch deck) retrouve son organisation.
create index if not exists org_kpi_points_upload on org_kpi_points ((value->>'uploadId'));
