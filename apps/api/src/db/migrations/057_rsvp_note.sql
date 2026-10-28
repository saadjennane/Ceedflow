-- Un mot, quand on refuse.
--
-- Une startup qui ne peut pas venir dit souvent pourquoi, et quand elle le
-- pourrait : « absents cette semaine, libres la suivante ». Sans ce mot,
-- l'équipe rappelle pour l'apprendre. Facultatif, et effacé si elle confirme.
alter table committee_assignments add column if not exists rsvp_note text not null default '';
alter table one_to_one_meetings add column if not exists rsvp_note text not null default '';
