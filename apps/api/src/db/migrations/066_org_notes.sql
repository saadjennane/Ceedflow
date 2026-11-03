-- Les notes de l'équipe CEED sur une organisation : ce qu'on apprend en dehors
-- de la plateforme — un appel, une rencontre. Jamais montrées à la startup.
create table if not exists org_notes (
  id         text        primary key,
  org_id     text        not null references records(id) on delete cascade,
  body       text        not null,
  by_id      text,
  by_name    text        not null default '',
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists org_notes_org on org_notes (org_id, created_at desc);
