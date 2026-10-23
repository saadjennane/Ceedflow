-- Les journées de One to One, comme les séances d'un comité.
--
-- CEED fixe les jours : une date, des plages, la durée d'un rendez-vous, le
-- lieu, et les interlocuteurs qui reçoivent ce jour-là. Les créneaux s'en
-- déduisent — chaque créneau, chez chaque interlocuteur du jour, est une case
-- qu'une startup occupe, placée par l'équipe ou réservée par elle-même.
create table if not exists one_to_one_days (
  id                  text primary key,
  block_id            text        not null references blocks(id) on delete cascade,
  name                text        not null default '',
  held_on             date,
  -- [{ startsAt: 'HH:MM', endsAt: 'HH:MM' }], comme committee_sessions.windows.
  windows             jsonb       not null default '[{"startsAt":"09:00","endsAt":"12:30"}]'::jsonb,
  minutes_per_meeting integer     not null default 45,
  location            text        not null default '',
  -- Les interlocuteurs du jour : des fiches de l'annuaire.
  interlocutors       jsonb       not null default '[]'::jsonb,
  position            integer     not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists one_to_one_days_block on one_to_one_days (block_id, position);

-- Un rendez-vous peut tenir dans une journée ; il en garde la date et l'heure
-- s'il en sort, plutôt que de disparaître avec elle.
alter table one_to_one_meetings add column if not exists day_id text references one_to_one_days(id) on delete set null;

-- Invitée à réserver, une startup peut choisir chez qui : l'interlocuteur
-- reste vide jusqu'à ce qu'elle ait pris son créneau.
alter table one_to_one_meetings alter column person_id drop not null;
