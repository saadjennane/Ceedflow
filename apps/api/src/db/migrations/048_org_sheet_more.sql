-- La fiche, suite : l'activité, l'équipe, le financement et l'accompagnement.
--
-- Comme la première moitié, tout est ajouté et rien n'est réécrit. Les listes
-- qui s'allongent — produits, opérations de financement, programmes suivis
-- ailleurs — ont chacune leur table : une ligne par chose, qu'on modifie ou
-- retire seule, et qui garde sa date.

-- ---- Activité & produits ----
-- 'product' | 'service' | 'platform' | 'mixed' | ''
alter table records add column if not exists activity_nature  text  not null default '';
alter table records add column if not exists target_markets   jsonb not null default '[]'::jsonb;
alter table records add column if not exists main_offering    text  not null default '';
alter table records add column if not exists catalogue_url    text  not null default '';
-- 'morocco' | 'international' | 'both' | ''
alter table records add column if not exists sales_zone       text  not null default '';
alter table records add column if not exists sales_countries  jsonb not null default '[]'::jsonb;
alter table records add column if not exists demo_url         text  not null default '';

create table if not exists org_products (
  id              text primary key,
  org_id          text        not null references records(id) on delete cascade,
  name            text        not null,
  description     text        not null default '',
  image_upload_id text,
  -- 'in_development' | 'available' | 'commercialised'
  status          text        not null default '',
  -- En texte : « à partir de 200 MAD / mois » est un prix, et pas un nombre.
  price           text        not null default '',
  position        integer     not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists org_products_org on org_products (org_id, position);

-- ---- Équipe ----
alter table records add column if not exists founders_count integer;
alter table records add column if not exists women_count    integer;
-- La personne à joindre pour l'organisation : une au plus, et c'est la
-- relation qui la porte, pas la fiche de la personne — on peut être le contact
-- d'une société et simple membre d'une autre.
alter table affiliations add column if not exists primary_contact boolean not null default false;

-- ---- Financement ----
-- 'yes' | 'no' | ''
alter table records add column if not exists has_funding text not null default '';

create table if not exists org_fundings (
  id          text primary key,
  org_id      text             not null references records(id) on delete cascade,
  on_date     text             not null default '',
  amount      double precision,
  currency    text             not null default 'MAD',
  -- 'equity' | 'debt' | 'grant' | 'honour_loan' | 'other' — jamais mélangés
  -- dans un total : un prêt n'est pas une levée.
  nature      text             not null default '',
  funder_name text             not null default '',
  -- Le financeur quand il est dans l'annuaire ; son nom recopié sinon.
  funder_id   text references records(id) on delete set null,
  created_at  timestamptz      not null default now()
);
create index if not exists org_fundings_org on org_fundings (org_id);

-- ---- Accompagnement ----
-- 'yes' | 'no' | '' — déjà accompagnée, et actuellement.
alter table records add column if not exists past_programs    text not null default '';
alter table records add column if not exists current_programs text not null default '';

-- Les programmes suivis ailleurs. Ceux de CeedFlow ne s'écrivent pas ici : ils
-- se lisent dans les candidatures retenues, et les recopier ferait un doublon
-- qui divergerait au premier changement de statut.
create table if not exists org_programs (
  id           text primary key,
  org_id       text        not null references records(id) on delete cascade,
  name         text        not null,
  organisation text        not null default '',
  starts_on    text        not null default '',
  ends_on      text        not null default '',
  -- 'done' | 'ongoing'
  status       text        not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists org_programs_org on org_programs (org_id);
