-- Plusieurs interlocuteurs à un même rendez-vous.
--
-- Une brique peut faire recevoir chaque startup par ses interlocuteurs
-- ensemble — deux mentors face à une startup, plutôt que chacun à part. Le
-- rendez-vous garde un interlocuteur principal (person_id), et nomme ici tous
-- ceux qui y sont : chacun le voit dans son espace, reçoit ses lettres, et
-- peut écrire le compte rendu, qui est commun.
alter table one_to_one_meetings add column if not exists with_ids jsonb not null default '[]'::jsonb;
create index if not exists one_to_one_meetings_with on one_to_one_meetings using gin (with_ids);
