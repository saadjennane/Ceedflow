-- Plusieurs adresses pour la même fiche.
--
-- Une société a un contact@ et la boîte de son dirigeant ; une personne a son
-- adresse professionnelle et celle qu'elle relève vraiment. La fiche n'en
-- gardait qu'une, et c'est la raison pour laquelle on en a ajouté une seconde
-- en double le 24 septembre — deux fiches pour la même collègue, à deux
-- minutes d'intervalle, parce que la première portait un domaine fautif.
--
-- Même forme que les numéros et les lieux : la liste est la vérité, `email`
-- devient ce qu'elle a de premier, calculé par la base. La douzaine d'endroits
-- qui n'ont la place que d'une adresse continuent de la lire — et la
-- recherche, elle, les trouve toutes.
alter table records add column if not exists emails jsonb not null default '[]'::jsonb;

update records set emails = jsonb_build_array(email)
 where coalesce(email, '') <> '' and emails = '[]'::jsonb;

alter table records drop column if exists email;
alter table records add column email text generated always as (coalesce(emails->>0, '')) stored;
