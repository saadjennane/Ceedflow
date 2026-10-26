-- L'espace de test : de faux programmes, de fausses startups, de faux comptes,
-- dans la vraie app, sans qu'aucune vraie startup n'en voie ni n'en reçoive rien.

-- Un programme de test : invisible des vrais membres, et ses lettres ne
-- partent que vers des adresses de test.
alter table programs add column if not exists is_test boolean not null default false;

-- Une fiche de test, et le compte du collègue qui la tient : c'est dans sa
-- boîte que ses mails arrivent, et c'est par lui qu'on sait qu'elle est fausse.
alter table records add column if not exists test_owner text;
create index if not exists records_test_owner on records (test_owner) where test_owner is not null;
