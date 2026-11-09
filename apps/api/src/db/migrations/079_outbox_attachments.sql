-- Ce qu'une lettre porte en plus de son texte : l'invitation .ics d'un
-- rendez-vous réservé, pour qu'il entre dans l'agenda d'un clic.
alter table outbox add column if not exists attachments jsonb not null default '[]'::jsonb;
