-- `team` joins the provenances: somebody a founder typed onto their own
-- organisation page. It is the one origin that does not put a person in the
-- people column — not until they come through the door themselves — so it has
-- to be told apart from a row CEED entered.
alter table records drop constraint if exists records_origin_check;
alter table records add constraint records_origin_check
  check (origin in ('import', 'manual', 'signup', 'team'));

-- The rung a permission sits on, guarded in the same place as the rest of the
-- vocabulary rather than only in the schema that writes it.
alter table affiliations drop constraint if exists affiliations_access_check;
alter table affiliations add constraint affiliations_access_check
  check (access in ('member', 'editor', 'admin'));
