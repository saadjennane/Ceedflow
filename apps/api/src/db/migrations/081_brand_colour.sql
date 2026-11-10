-- La couleur d'une organisation, quand elle en choisit une. Vide : celle de son logo.
alter table records add column if not exists brand_colour text not null default '';
