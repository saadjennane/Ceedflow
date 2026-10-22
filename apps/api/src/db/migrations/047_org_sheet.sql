-- La fiche d'une organisation, en sections : identité, maturité, performances.
--
-- Le profil tenait en dix faits — assez pour qu'un jury sache de quoi il
-- s'agit, pas assez pour qu'un programme sache où en est la société : sa forme
-- juridique, son capital, ses chiffres d'affaires, ses brevets, ses marchés.
-- Chaque candidature les redemandait, et chacune les perdait avec elle.
--
-- Tout est ajouté, rien n'est réécrit : les colonnes existantes gardent leurs
-- valeurs, et la maturité en sept niveaux part de l'ancien stade en cinq.

-- ---- Identité ----
alter table records add column if not exists org_type          text    not null default '';
alter table records add column if not exists legal_status      text    not null default '';
alter table records add column if not exists founded_on        text    not null default '';
alter table records add column if not exists legal_form        text    not null default '';
alter table records add column if not exists capital_amount    double precision;
alter table records add column if not exists capital_currency  text    not null default 'MAD';
alter table records add column if not exists secondary_sectors jsonb   not null default '[]'::jsonb;
-- Les autres réseaux, une adresse par ligne : LinkedIn a sa colonne.
alter table records add column if not exists socials           jsonb   not null default '[]'::jsonb;

-- ---- Maturité & performances ----
alter table records add column if not exists maturity          text    not null default '';
alter table records add column if not exists active_clients    integer;
-- Au stade MVP : a-t-il déjà des utilisateurs ? 'yes' | 'no' | ''.
alter table records add column if not exists mvp_users         text    not null default '';
-- 'yes' | 'no' | 'pending' | '' — et ce qui va avec, selon la réponse.
alter table records add column if not exists patent            text    not null default '';
alter table records add column if not exists patent_details    jsonb   not null default '{}'::jsonb;
alter table records add column if not exists signed_contracts  text    not null default '';
alter table records add column if not exists contracts_count   integer;
alter table records add column if not exists contracts_amount  double precision;

-- La maturité en sept niveaux, à partir des cinq d'avant. L'ancienne colonne
-- reste telle quelle : rien ne l'écrit plus, mais rien ne l'efface.
update records set maturity = case stage
    when 'idea'      then 'ideation'
    when 'prototype' then 'prototype'
    when 'mvp'       then 'mvp'
    when 'customers' then 'commercialisation'
    when 'growing'   then 'growth'
    else ''
  end
 where kind = 'org' and maturity = '' and stage <> '';

-- Le chiffre d'affaires, une ligne par exercice. Une table et non trois
-- colonnes : « les trois derniers » glissent chaque année, et l'exercice qui
-- sort de la fenêtre doit rester dans l'historique.
create table if not exists org_revenues (
  org_id      text        not null references records(id) on delete cascade,
  year        integer     not null,
  -- Null avec `unavailable` : « je ne l'ai pas ». Zéro est un montant.
  amount      double precision,
  unavailable boolean     not null default false,
  currency    text        not null default 'MAD',
  updated_at  timestamptz not null default now(),
  primary key (org_id, year)
);
