-- Une priorité pour ranger les tâches : ce qui presse en haut.
alter table tasks add column if not exists priority text not null default 'medium';
alter table tasks drop constraint if exists tasks_priority_check;
alter table tasks add constraint tasks_priority_check check (priority in ('high', 'medium', 'low'));

-- L'assistant de réunion : un compte rendu collé, ce que l'IA y lit, et les
-- tâches qu'elle propose. Les tâches réelles restent dans `tasks` : une
-- proposition créée garde seulement le lien vers la sienne, ce qui empêche de
-- la recréer à un nouvel essai.
create table if not exists meeting_analyses (
  id              text primary key,
  title           text        not null,
  meeting_on      date        not null,
  edition_id      text        references editions(id) on delete set null,
  content         text        not null,
  created_by      text        references records(id) on delete set null,
  created_by_name text        not null default '',
  status          text        not null default 'pending',
  summary         text        not null default '',
  error           text        not null default '',
  provider        text        not null default '',
  model           text        not null default '',
  analysed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status in ('pending', 'done', 'failed'))
);
create index if not exists meeting_analyses_time on meeting_analyses (created_at desc);

create table if not exists meeting_task_suggestions (
  id                text primary key,
  meeting_id        text        not null references meeting_analyses(id) on delete cascade,
  position          integer     not null default 0,
  source            text        not null default 'ai',
  title             text        not null default '',
  description       text        not null default '',
  assignee_id       text        references records(id) on delete set null,
  -- Le nom tel que le compte rendu l'écrit, et pourquoi il n'est pas rapproché.
  assignee_said     text        not null default '',
  assignee_note     text        not null default '',
  due_on            date,
  due_note          text        not null default '',
  priority          text        not null default 'medium',
  source_excerpt    text        not null default '',
  confidence        text        not null default 'medium',
  needs_review      boolean     not null default false,
  review_reason     text        not null default '',
  duplicate_task_id text        references tasks(id) on delete set null,
  -- proposed → creating → created ; dismissed quand on l'écarte ; failed pour réessayer.
  status            text        not null default 'proposed',
  task_id           text        references tasks(id) on delete set null,
  error             text        not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status in ('proposed', 'dismissed', 'creating', 'created', 'failed')),
  check (priority in ('high', 'medium', 'low')),
  check (confidence in ('high', 'medium', 'low'))
);
create index if not exists meeting_suggestions_meeting on meeting_task_suggestions (meeting_id, position);
