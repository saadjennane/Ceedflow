-- Plusieurs villes pour la même société.
--
-- Une startup a un siège à Casablanca et une équipe à Agadir ; un partenaire
-- a trois bureaux. La fiche n'en gardait qu'un, et le reste s'écrivait dans la
-- description — c'est-à-dire nulle part où l'on puisse chercher.
--
-- Même forme que les numéros : la liste est la vérité, `city` et `country`
-- deviennent ce qu'elle a de premier. Une douzaine d'endroits n'ont la place
-- que d'un lieu — un tableau, un export, une recherche — et ils continuent de
-- lire les mêmes colonnes, qui ne peuvent plus diverger puisqu'elles sont
-- calculées.
alter table records add column if not exists places jsonb not null default '[]'::jsonb;

update records
   set places = jsonb_build_array(jsonb_build_object('city', city, 'country', coalesce(country, '')))
 where coalesce(city, '') <> '' and places = '[]'::jsonb;

-- Un pays sans ville n'est pas un lieu : tout le monde est à Morocco par
-- défaut, et une liste qui le répéterait ne dirait rien.
alter table records drop column if exists city;
alter table records drop column if exists country;
alter table records add column city    text generated always as (coalesce(places->0->>'city', '')) stored;
alter table records add column country text generated always as (coalesce(places->0->>'country', '')) stored;
