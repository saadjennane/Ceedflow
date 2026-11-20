-- Le centre de notifications : ce qui demande quelque chose à une personne, ou
-- la concerne directement — une ligne par personne et par événement.
create table if not exists notifications (
  id          text        primary key,
  record_id   text        not null references records(id) on delete cascade,
  -- Le centre où c'est arrivé ; vide pour ce qui ne tient à aucun (son compte).
  center_id   text        references centers(id) on delete cascade,
  kind        text        not null,
  title       text        not null,
  body        text        not null default '',
  href        text        not null default '',
  -- Qui l'a déclenchée, quand quelqu'un l'a fait.
  actor_name  text        not null default '',
  -- Une même chose ne se notifie qu'une fois (une liste finalisée, un retard du jour).
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_inbox on notifications (record_id, created_at desc);
create index if not exists notifications_unread on notifications (record_id) where read_at is null;
create unique index if not exists notifications_once on notifications (record_id, dedupe_key) where dedupe_key is not null;
