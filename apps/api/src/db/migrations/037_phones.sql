-- Plusieurs numéros pour la même personne, et pour une société.
--
-- Un fondateur a un portable et un fixe au bureau ; une société a un standard
-- et un numéro qu'on donne aux clients. La colonne n'en gardait qu'un, alors
-- le second s'écrivait dans la description, ou nulle part.
--
-- La liste est la vérité, et `phone` devient ce qu'elle a de premier : une
-- douzaine d'endroits n'ont la place que d'un numéro — le tableau des
-- candidatures, un export, une recherche — et ils continuent de lire la même
-- colonne, qui ne peut plus diverger puisqu'elle est calculée.
alter table records add column if not exists phones jsonb not null default '[]'::jsonb;

update records set phones = jsonb_build_array(phone)
 where coalesce(phone, '') <> '' and phones = '[]'::jsonb;

alter table records drop column if exists phone;
alter table records add column phone text generated always as (coalesce(phones->>0, '')) stored;
