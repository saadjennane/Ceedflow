-- Où un programme est proposé dans le réseau : son centre seulement (comme
-- tous ceux d'aujourd'hui), des centres choisis, ou tous. Proposer n'est pas
-- publier : chaque centre destinataire accepte ou refuse, dans
-- program_distributions.
alter table programs add column if not exists visibility text not null default 'center';
alter table programs drop constraint if exists programs_visibility_check;
alter table programs add constraint programs_visibility_check check (visibility in ('center', 'selected', 'all'));
