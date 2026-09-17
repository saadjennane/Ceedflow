-- How many startups a cohort holds is the outcome of a selection, not a number
-- fixed when the edition is created.
alter table editions drop column if exists seats;
