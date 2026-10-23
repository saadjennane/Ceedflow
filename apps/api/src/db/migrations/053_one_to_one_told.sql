-- Quand chacun a été prévenu d'un rendez-vous : la startup, et l'interlocuteur.
--
-- Une date et non un drapeau : elle se lit sur la fiche du rendez-vous, et dit
-- si la lettre partie précède ou suit le dernier changement d'heure.
alter table one_to_one_meetings add column if not exists told_startup_at timestamptz;
alter table one_to_one_meetings add column if not exists told_person_at  timestamptz;
