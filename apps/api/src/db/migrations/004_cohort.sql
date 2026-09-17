-- A cohort member carries facts a candidate does not: who mentors it, and how
-- its time in the program is going.
alter table candidates add column if not exists mentor text not null default '';
alter table candidates add column if not exists cohort_status text not null default 'Active';

alter table candidates drop constraint if exists cohort_status_check;
alter table candidates add constraint cohort_status_check
  check (cohort_status in ('Active','At risk','Graduated'));

-- The edition's mentor bench. Names for now; directory references later.
alter table editions add column if not exists mentors jsonb not null default '[]'::jsonb;
