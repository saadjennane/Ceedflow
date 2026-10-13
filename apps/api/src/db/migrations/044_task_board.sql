-- Où en est une tâche, et pas seulement si elle est faite.
--
-- Deux états de plus pour que la page Tasks puisse se lire en tableau : « en
-- cours » et « bloquée ». Ni l'un ni l'autre ne la close — elle reste dans ce
-- qu'on attend de quelqu'un, et en retard si sa date est passée.
alter table tasks drop constraint if exists tasks_state_check;
alter table tasks add constraint tasks_state_check
  check (state in ('open', 'doing', 'stuck', 'done', 'dropped'));

-- Les index partiels suivent : ils servaient « ce qui est ouvert ».
drop index if exists tasks_owner;
drop index if exists tasks_due;
create index if not exists tasks_owner on tasks (owner_id) where state in ('open', 'doing', 'stuck');
create index if not exists tasks_due   on tasks (due_on)   where state in ('open', 'doing', 'stuck');
