-- La fiche startup, administrable : des attributs que CEED ajoute, leurs
-- valeurs par organisation, et le journal de tout ce qui change sur une fiche.

-- Un attribut ajouté par CEED. Retiré, il est archivé : ses valeurs et son
-- historique restent lisibles.
create table if not exists org_attributes (
  id          text        primary key,
  label       text        not null,
  label_en    text        not null default '',
  type        text        not null,
  options     jsonb       not null default '[]'::jsonb,
  currency    text        not null default 'MAD',
  -- La startup le voit et le remplit dans son espace ; sinon il reste à CEED.
  visible     boolean     not null default true,
  position    integer     not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists org_attribute_values (
  org_id       text        not null references records(id) on delete cascade,
  attribute_id text        not null references org_attributes(id) on delete cascade,
  value        jsonb       not null,
  updated_at   timestamptz not null default now(),
  primary key (org_id, attribute_id)
);
-- Un fichier d'attribut retrouve son organisation par là (droit d'ouvrir).
create index if not exists org_attribute_values_upload on org_attribute_values ((value->>'uploadId'));

-- Ce qui a changé sur une fiche : quoi, avant, après, qui, d'où.
create table if not exists org_history (
  id           text        primary key,
  org_id       text        not null references records(id) on delete cascade,
  field        text        not null,
  label        text        not null default '',
  before       jsonb,
  after        jsonb,
  by_kind      text        not null default 'system',
  by_id        text,
  by_name      text        not null default '',
  source       text        not null default 'sheet',
  source_label text        not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists org_history_org on org_history (org_id, created_at desc);
