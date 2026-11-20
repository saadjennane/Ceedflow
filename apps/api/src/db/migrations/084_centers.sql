-- Le réseau CEED : des centres (CEED Maroc, CEED Tunisie…) sous CEED Global.
--
-- Additive only. Every row that exists today belongs to CEED Maroc, the one
-- centre the platform has served so far; nothing is renamed, dropped or moved.
-- Identity stays single: a person or an organisation is one row of `records`,
-- however many centres it belongs to — `center_members` is the link, never a
-- copy.

create table if not exists centers (
  id             text        primary key,
  name           text        not null,
  country        text        not null default '',
  city           text        not null default '',
  logo_upload_id text,
  description    text        not null default '',
  status         text        not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now()
);

insert into centers (id, name, country, city)
values ('ctr_maroc', 'CEED Maroc', 'Morocco', 'Casablanca')
on conflict (id) do nothing;

-- L'équipe d'un centre : un compte, un centre, un rôle. Le même compte peut
-- travailler pour plusieurs centres, avec un rôle différent dans chacun.
create table if not exists center_staff (
  account_id text        not null references accounts(id) on delete cascade,
  center_id  text        not null references centers(id) on delete cascade,
  role       text        not null check (role in ('admin', 'editor', 'observer')),
  created_at timestamptz not null default now(),
  primary key (account_id, center_id)
);
create index if not exists center_staff_center on center_staff (center_id);

insert into center_staff (account_id, center_id, role)
select id, 'ctr_maroc', staff_role from accounts where staff_role is not null
on conflict do nothing;

-- CEED Global : au-dessus des centres. Les administrateurs d'aujourd'hui le sont.
alter table accounts add column if not exists global_role text check (global_role in ('admin'));
update accounts set global_role = 'admin' where staff_role = 'admin' and global_role is null;

-- Qui appartient à quelle communauté. Une ligne par paire : candidater dix
-- fois à CEED Maroc ne rattache qu'une fois.
create table if not exists center_members (
  record_id  text        not null references records(id) on delete cascade,
  center_id  text        not null references centers(id) on delete cascade,
  -- Comment le rattachement est venu : 'migration', 'manual', 'import',
  -- 'signup', 'application'.
  origin     text        not null default 'manual',
  created_at timestamptz not null default now(),
  primary key (record_id, center_id)
);
create index if not exists center_members_center on center_members (center_id);

insert into center_members (record_id, center_id, origin)
select id, 'ctr_maroc', 'migration' from records
on conflict do nothing;

-- Les colonnes center_id gardent pour l'instant CEED Maroc par défaut : le code
-- d'aujourd'hui insère sans les nommer, et doit continuer de marcher. Le
-- contexte de centre les remplira explicitement ; le défaut partira ensuite.

-- Un programme appartient à son centre organisateur. Tout ce qui pend sous lui
-- — éditions, briques, candidatures, rendez-vous — en hérite par jointure.
alter table programs add column if not exists center_id text references centers(id);
update programs set center_id = 'ctr_maroc' where center_id is null;
alter table programs alter column center_id set default 'ctr_maroc';
alter table programs alter column center_id set not null;
create index if not exists programs_center on programs (center_id);

-- Un programme proposé à un autre centre : la demande, et la réponse de ce
-- centre. Jamais une copie du programme.
create table if not exists program_distributions (
  program_id  text        not null references programs(id) on delete cascade,
  center_id   text        not null references centers(id) on delete cascade,
  status      text        not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  proposed_by text,
  proposed_at timestamptz not null default now(),
  decided_by  text,
  decided_at  timestamptz,
  primary key (program_id, center_id)
);
create index if not exists program_distributions_center on program_distributions (center_id, status);

-- Les modules propres à chaque centre : tâches, base de connaissances,
-- Funding, notes d'équipe, comptes rendus de réunion.
alter table tasks add column if not exists center_id text references centers(id);
update tasks set center_id = 'ctr_maroc' where center_id is null;
alter table tasks alter column center_id set default 'ctr_maroc';
alter table tasks alter column center_id set not null;
create index if not exists tasks_center on tasks (center_id);

alter table kb_categories add column if not exists center_id text references centers(id);
update kb_categories set center_id = 'ctr_maroc' where center_id is null;
alter table kb_categories alter column center_id set default 'ctr_maroc';
alter table kb_categories alter column center_id set not null;

alter table kb_entries add column if not exists center_id text references centers(id);
update kb_entries set center_id = 'ctr_maroc' where center_id is null;
alter table kb_entries alter column center_id set default 'ctr_maroc';
alter table kb_entries alter column center_id set not null;
create index if not exists kb_entries_center on kb_entries (center_id);

alter table funding_analyses add column if not exists center_id text references centers(id);
update funding_analyses set center_id = 'ctr_maroc' where center_id is null;
alter table funding_analyses alter column center_id set default 'ctr_maroc';
alter table funding_analyses alter column center_id set not null;

alter table funding_opportunities add column if not exists center_id text references centers(id);
update funding_opportunities set center_id = 'ctr_maroc' where center_id is null;
alter table funding_opportunities alter column center_id set default 'ctr_maroc';
alter table funding_opportunities alter column center_id set not null;

alter table org_notes add column if not exists center_id text references centers(id);
update org_notes set center_id = 'ctr_maroc' where center_id is null;
alter table org_notes alter column center_id set default 'ctr_maroc';
alter table org_notes alter column center_id set not null;

alter table meeting_analyses add column if not exists center_id text references centers(id);
update meeting_analyses set center_id = 'ctr_maroc' where center_id is null;
alter table meeting_analyses alter column center_id set default 'ctr_maroc';
alter table meeting_analyses alter column center_id set not null;
