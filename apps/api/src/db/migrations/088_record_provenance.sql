-- D'où vient une fiche, et comment elle est arrivée dans chaque communauté.
--
-- `records.created_by` dit déjà qui l'a ajoutée quand quelqu'un l'a fait ; il
-- manque le programme quand elle est née d'une candidature. Et une fiche qui
-- rejoint un deuxième centre y arrive à sa façon : par qui, par quel programme.
alter table records add column if not exists source_program_id text references programs(id) on delete set null;

alter table center_members add column if not exists program_id    text references programs(id) on delete set null;
alter table center_members add column if not exists added_by      text;
alter table center_members add column if not exists added_by_name text not null default '';
