-- Une tâche appartient à l'équipe CEED, et peut être confiée à quelqu'un d'autre.
--
-- `owner_id` reste l'owner principal — toujours quelqu'un de l'équipe ;
-- `task_owners` les liste tous (une tâche partagée, terminée une fois pour
-- tous) ; `delegate_id` est la personne ou l'organisation extérieure à qui la
-- tâche est confiée, et qui la voit dans son espace membre.
--
-- Avec un programme ET un sujet (une startup, une personne, une organisation),
-- un historique de tout ce qui lui arrive, le blocage et sa raison, la
-- validation et son valideur, et des pièces jointes.

create table if not exists task_owners (
  task_id       text        not null references tasks(id) on delete cascade,
  record_id     text        not null references records(id) on delete cascade,
  added_by_name text        not null default '',
  added_at      timestamptz not null default now(),
  primary key (task_id, record_id)
);
create index if not exists task_owners_record on task_owners (record_id);

alter table tasks add column if not exists delegate_id text references records(id) on delete set null;
create index if not exists tasks_delegate on tasks (delegate_id) where delegate_id is not null;

/* Les tâches existantes : un responsable de l'équipe reste owner ; un
   responsable extérieur devient celui à qui la tâche est confiée, et l'owner
   est le collègue qui l'avait donnée — sinon un administrateur. */
update tasks t set delegate_id = t.owner_id
 where not exists (select 1 from accounts a where a.record_id = t.owner_id and a.staff_role is not null);
update tasks t
   set owner_id = coalesce(
         (select a.record_id from accounts a where a.id = t.created_by and a.staff_role is not null),
         (select a.record_id from accounts a where a.record_id = t.created_by and a.staff_role is not null),
         (select a.record_id from accounts a where a.staff_role = 'admin' and a.disabled_at is null order by a.created_at limit 1),
         t.owner_id)
 where t.delegate_id is not null;
insert into task_owners (task_id, record_id)
  select id, owner_id from tasks
  where exists (select 1 from accounts a where a.record_id = tasks.owner_id and a.staff_role is not null)
  on conflict do nothing;

alter table tasks drop constraint if exists tasks_state_check;
alter table tasks add constraint tasks_state_check
  check (state in ('open', 'doing', 'stuck', 'to_validate', 'done', 'dropped'));

alter table tasks add column if not exists stuck_reason     text not null default '';
alter table tasks add column if not exists unblocker_id     text references records(id) on delete set null;
alter table tasks add column if not exists validator_id     text references records(id) on delete set null;
alter table tasks add column if not exists validation_note  text not null default '';

create table if not exists task_events (
  id         text primary key,
  task_id    text        not null references tasks(id) on delete cascade,
  kind       text        not null,
  actor_id   text        references records(id) on delete set null,
  actor_name text        not null default '',
  note       text        not null default '',
  meta       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists task_events_task on task_events (task_id, created_at);

create table if not exists task_attachments (
  id            text primary key,
  task_id       text        not null references tasks(id) on delete cascade,
  upload_id     text        not null references uploads(id) on delete cascade,
  filename      text        not null default '',
  mime          text        not null default '',
  size          integer     not null default 0,
  added_by_name text        not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists task_attachments_task on task_attachments (task_id, created_at);

-- Le rappel de retard, par tâche et par personne : une tâche partagée prévient
-- chacun de ses owners, et celui à qui elle est confiée.
create table if not exists task_late_letters (
  task_id   text        not null references tasks(id) on delete cascade,
  record_id text        not null references records(id) on delete cascade,
  sent_at   timestamptz not null default now(),
  primary key (task_id, record_id)
);
