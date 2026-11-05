-- Le modèle qu'une question « fichier » propose de télécharger : déposé par
-- CEED, rempli puis renvoyé par qui répond. Il n'est à personne et n'a rien de
-- confidentiel — il s'ouvre pour quiconque voit le formulaire.
alter table uploads add column if not exists is_template boolean not null default false;
