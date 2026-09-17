-- One internal directory. Organisations and people are the same kind of row —
-- what separates them is `kind`, and an affiliation joins one to the other.
create table if not exists records (
  id          text primary key,
  kind        text        not null check (kind in ('org','person')),
  name        text        not null,
  roles       jsonb       not null default '[]'::jsonb,
  -- Who maintains the page. Follows from how the record arrived.
  ownership   text        not null default 'Unclaimed'
                          check (ownership in ('Unclaimed','Invited','Claimed')),
  origin      text        not null default 'manual'
                          check (origin in ('import','manual','signup')),
  email       text        not null default '',
  phone       text        not null default '',
  city        text        not null default '',
  country     text        not null default '',
  website     text        not null default '',
  bio         text        not null default '',
  tags        jsonb       not null default '[]'::jsonb,
  invited_at  timestamptz,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists records_kind_idx on records(kind);

-- A person belongs to zero or several organisations; an organisation is held by
-- one or several people. One row per pair: the role says what they do there.
create table if not exists affiliations (
  id        text primary key,
  person_id text not null references records(id) on delete cascade,
  org_id    text not null references records(id) on delete cascade,
  role      text not null default '',
  since     text not null default '',
  unique (person_id, org_id)
);
create index if not exists affiliations_org_idx on affiliations(org_id);
create index if not exists affiliations_person_idx on affiliations(person_id);
