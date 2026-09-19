-- Applying is done signed in, as one of your organisations — so a candidacy is
-- a link between an organisation and an edition, not a second copy of a startup.
alter table candidates add column if not exists org_id    text references records(id) on delete restrict;
alter table candidates add column if not exists person_id text references records(id) on delete set null;

alter table candidates drop column if exists org_name;
alter table candidates drop column if exists contact_name;
alter table candidates drop column if exists email;
alter table candidates drop column if exists phone;

create index if not exists candidates_org_idx on candidates(org_id);
-- One application per organisation per block, when the block asks for it.
create unique index if not exists candidates_once_idx
  on candidates(origin_block_id, org_id) where origin_block_id is not null;

-- Attachments live here rather than on a disk nobody has yet. A real object
-- store replaces this table without touching what points at it: the answer
-- holds an upload id either way.
create table if not exists uploads (
  id           text primary key,
  candidate_id text        references candidates(id) on delete cascade,
  field_id     text        not null default '',
  filename     text        not null,
  mime         text        not null default 'application/octet-stream',
  size         integer     not null default 0,
  bytes        bytea       not null,
  created_at   timestamptz not null default now()
);
