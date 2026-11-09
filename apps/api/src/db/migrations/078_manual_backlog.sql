-- Le backlog accueille aussi des tâches écrites à la main, sans compte rendu :
-- elles se rangent sous un groupe « Added by hand », qui n'est pas une réunion
-- et n'apparaît pas dans l'historique des réunions.
alter table meeting_analyses add column if not exists kind text not null default 'meeting';
alter table meeting_analyses drop constraint if exists meeting_analyses_kind_check;
alter table meeting_analyses add constraint meeting_analyses_kind_check check (kind in ('meeting', 'manual'));
