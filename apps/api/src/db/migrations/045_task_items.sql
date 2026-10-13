-- Une tâche découpée en lignes qu'on coche.
--
-- Une table et non un tableau dans la tâche : une tâche confiée à une société
-- est cochée par n'importe lequel de ceux qui tiennent sa page, et deux coches
-- au même instant dans un même champ JSON en effaceraient une. Une ligne par
-- sous-tâche, et chacune dit qui l'a cochée — comme la tâche elle-même.
create table if not exists task_items (
  id           text primary key,
  task_id      text        not null references tasks(id) on delete cascade,
  label        text        not null,
  position     int         not null default 0,
  done         boolean     not null default false,
  done_at      timestamptz,
  done_by      text,
  done_by_name text        not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists task_items_task on task_items (task_id, position);
