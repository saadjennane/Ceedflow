-- Un lien vidéo par créneau d'une journée, quand chaque séance a le sien ;
-- sans lui, c'est le lien de la journée qui vaut.
alter table one_to_one_days add column if not exists slot_links jsonb not null default '{}'::jsonb;
