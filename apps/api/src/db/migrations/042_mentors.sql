-- Un mentor est quelqu'un, pas un nom.
--
-- « Names for now », disait le modèle, et c'est tenable tant qu'on se contente
-- de les afficher. Dès qu'on veut leur confier une tâche, leur écrire ou
-- compter ce qu'ils suivent, une chaîne de caractères ne suffit plus : on ne
-- peut pas donner quelque chose à faire à « Reda ».
--
-- Rien à reprendre : aucune édition ni aucune candidature n'en porte encore,
-- et sept fiches de l'annuaire ont déjà le rôle Mentor. La colonne `mentors`
-- d'une édition tient donc désormais des identifiants de fiches, et la
-- candidature pointe la fiche plutôt que de recopier un nom qui se démentira.
alter table candidates add column if not exists mentor_id text references records(id) on delete set null;
alter table candidates drop column if exists mentor;

create index if not exists candidates_mentor on candidates (mentor_id);
