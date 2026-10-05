-- Étaler un envoi dans le temps.
--
-- Un domaine d'envoi neuf n'a aucune réputation. Quatre cents invitations le
-- premier jour est le scénario classique du domaine classé en spam — et une
-- fois classé, ce sont toutes les autres lettres du programme qui partent au
-- même endroit, y compris les convocations et les résultats.
--
-- Une colonne plutôt qu'un ordonnanceur : la file est déjà vidée par un
-- minuteur, qui n'a qu'à ignorer ce qui n'est pas encore dû.
alter table outbox add column if not exists send_after timestamptz;

drop index if exists outbox_queue_idx;
create index if not exists outbox_queue_idx
  on outbox (send_after nulls first, created_at) where state = 'queued';
