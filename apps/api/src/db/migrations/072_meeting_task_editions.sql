-- Le programme d'une tâche proposée, quand le compte rendu le dit clairement :
-- rattaché tâche par tâche, et non à la réunion entière.
alter table meeting_task_suggestions add column if not exists edition_id text references editions(id) on delete set null;
