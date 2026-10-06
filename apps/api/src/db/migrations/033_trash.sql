-- La corbeille à trente jours.
--
-- Supprimer était immédiat et définitif, et la suppression en cascade a rendu
-- ça plus grave qu'avant : effacer un fondateur emporte sa page, sa
-- candidature, ses pièces et les notes que le jury lui a données. Une erreur
-- d'un clic ne se répare pas en lisant une sauvegarde de la semaine dernière.
--
-- Rien ne part donc plus : la ligne est marquée, elle disparaît de toutes les
-- listes, et elle revient entière tant que les trente jours ne sont pas passés.
--
-- `deleted_batch` est ce qui rend « entière » possible : ce qui a été effacé
-- d'un geste porte le même identifiant et revient d'un geste. Sans lui,
-- restaurer un fondateur rendrait la personne et laisserait sa candidature au
-- fond du tiroir.
alter table records    add column if not exists deleted_at    timestamptz;
alter table records    add column if not exists deleted_batch text;
alter table records    add column if not exists deleted_by    text;

alter table candidates add column if not exists deleted_at    timestamptz;
alter table candidates add column if not exists deleted_batch text;
alter table candidates add column if not exists deleted_by    text;

alter table programs   add column if not exists deleted_at    timestamptz;
alter table programs   add column if not exists deleted_batch text;
alter table programs   add column if not exists deleted_by    text;

alter table editions   add column if not exists deleted_at    timestamptz;
alter table editions   add column if not exists deleted_batch text;
alter table editions   add column if not exists deleted_by    text;

-- Le compte est suspendu, pas détruit : restaurer quelqu'un sans lui rendre sa
-- porte serait rendre une fiche et pas une personne. Le lot est noté dessus
-- pour ne réveiller que les comptes que la corbeille a endormis — pas celui
-- qu'un administrateur avait désactivé la veille pour une autre raison.
alter table accounts   add column if not exists deleted_batch text;

create index if not exists records_deleted    on records    (deleted_at) where deleted_at is not null;
create index if not exists candidates_deleted on candidates (deleted_at) where deleted_at is not null;
create index if not exists programs_deleted   on programs   (deleted_at) where deleted_at is not null;
create index if not exists editions_deleted   on editions   (deleted_at) where deleted_at is not null;
