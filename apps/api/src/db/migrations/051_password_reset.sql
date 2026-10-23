-- Un mot de passe oublié.
--
-- Le mot de passe provisoire envoyé par mail ne remplace pas l'ancien : il
-- s'y ajoute, pour une heure. Sinon n'importe qui connaissant une adresse
-- pourrait en couper l'accès à son propriétaire, rien qu'en demandant un
-- nouveau mot de passe. Le premier des deux qui sert gagne ; s'en servir oblige
-- à en choisir un à soi.
alter table accounts add column if not exists reset_hash         text;
alter table accounts add column if not exists reset_expires_at   timestamptz;
-- Quand le dernier a été demandé : une demande toutes les quelques minutes au
-- plus, pour qu'une boîte ne se remplisse pas de mots de passe.
alter table accounts add column if not exists reset_requested_at timestamptz;
