-- La fiche dit aussi le problème qu'une startup résout et sa réponse, et ses
-- identifiants légaux (ICE, registre de commerce).
alter table records add column if not exists problem   text not null default '';
alter table records add column if not exists solution  text not null default '';
alter table records add column if not exists ice       text not null default '';
alter table records add column if not exists rc_number text not null default '';
