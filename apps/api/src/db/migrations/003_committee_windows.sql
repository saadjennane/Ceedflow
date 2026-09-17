-- A sitting can run several stretches of the day, not one block of hours.
alter table committee_sessions add column if not exists windows jsonb;

update committee_sessions
   set windows = jsonb_build_array(jsonb_build_object('startsAt', starts_at, 'endsAt', ends_at))
 where windows is null;

alter table committee_sessions alter column windows set not null;
alter table committee_sessions alter column windows set default '[]'::jsonb;
alter table committee_sessions drop column if exists starts_at;
alter table committee_sessions drop column if exists ends_at;
