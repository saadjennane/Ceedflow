-- The workspace had no door. Every route behind it — the directory, the
-- programmes, the builder, the funnel — answered anyone who could reach the
-- API, which is how 441 candidacies were imported and three programmes deleted
-- from a script that never signed in.
--
-- Staff is a property of the account, not of the person's record. `CEED team`
-- already exists as a label on a record and stays what it is: something the
-- directory says about somebody, not a permission. Null here means not staff,
-- which is the case for every founder.
alter table accounts add column if not exists staff_role text;
alter table accounts drop constraint if exists accounts_staff_role_check;
alter table accounts add constraint accounts_staff_role_check
  check (staff_role is null or staff_role in ('admin', 'editor', 'observer'));
