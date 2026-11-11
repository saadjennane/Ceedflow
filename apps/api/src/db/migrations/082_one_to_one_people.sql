-- Les personnes derrière la startup, dans un One to One : celle qui a reçu
-- l'invitation (son nom et son adresse, tels qu'au moment de l'envoi), et celle
-- qui y a répondu — confirmé, réservé ou refusé.
alter table one_to_one_meetings add column if not exists told_startup_name  text not null default '';
alter table one_to_one_meetings add column if not exists told_startup_email text not null default '';
alter table one_to_one_meetings add column if not exists answered_by_name   text not null default '';
