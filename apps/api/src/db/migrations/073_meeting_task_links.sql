-- Ce à quoi une tâche proposée se rapporte, comme une tâche donnée à la main :
-- une personne, une organisation, un programme (edition_id) ou une startup
-- dans un programme — une seule de ces attaches à la fois.
alter table meeting_task_suggestions add column if not exists record_id text references records(id) on delete set null;
alter table meeting_task_suggestions add column if not exists candidate_id text references candidates(id) on delete set null;
-- Le nom tel que le compte rendu l'écrit, quand il n'a pas pu être rapproché.
alter table meeting_task_suggestions add column if not exists about_said text not null default '';
