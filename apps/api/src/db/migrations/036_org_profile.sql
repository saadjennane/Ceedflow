-- Le profil d'une startup : ce qu'un jury lit, et ce qui se cherche.
--
-- The organisation record held a CRM's fields — a phone, a city, a line of
-- description — and nothing a jury evaluates. The grid CEED's jurors mark on
-- asks about the market, the product's stage, the founding team and the
-- figures; none of it had anywhere to live, so it was retyped into every
-- application form and lost with it.
--
-- These columns are the durable half: what is true of the company whichever
-- programme it applies to. The answers to a form stay where they are — they
-- are what that call asked, that year.
alter table records add column if not exists logo_upload_id text;
alter table records add column if not exists pitch          text not null default '';
alter table records add column if not exists sector         text not null default '';
alter table records add column if not exists stage          text not null default '';
alter table records add column if not exists founded_year   integer;
alter table records add column if not exists team_size      integer;
alter table records add column if not exists linkedin       text not null default '';
