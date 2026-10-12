-- Qui fait quoi, d'ici quand.
--
-- Trois « à faire » existaient déjà — les pièces qu'une startup doit déposer,
-- le passage devant le jury, ce qu'il reste à noter — et chacun est déduit
-- d'un fait du tunnel. Il manquait celui qu'on écrit à la main : rappeler un
-- document à une fondatrice, demander une relecture à un collègue, charger
-- quelqu'un de convoquer un jury.
--
-- Un destinataire par tâche, et pas plusieurs : donner la même chose à trois
-- personnes en crée trois, sinon « fait » ne veut rien dire — fait par qui ?
-- Le destinataire est une fiche, personne ou organisation : une tâche confiée
-- à une société est vue par tous ceux qui tiennent sa page, et le premier qui
-- s'en occupe la coche.
--
-- Une attache au plus, et elle peut être nulle : ce à quoi la tâche se
-- rapporte — quelqu'un, une société, une édition, une étape, une candidature.
-- Les cascades sont voulues : une candidature supprimée emporte ce qu'on avait
-- à faire pour elle.
create table if not exists tasks (
  id            text primary key,
  title         text        not null,
  detail        text        not null default '',
  due_on        date,
  state         text        not null default 'open' check (state in ('open', 'done', 'dropped')),

  -- À qui.
  owner_id      text        not null references records(id) on delete cascade,

  -- À quoi, au plus une.
  record_id     text references records(id)    on delete cascade,
  edition_id    text references editions(id)   on delete cascade,
  block_id      text references blocks(id)     on delete cascade,
  candidate_id  text references candidates(id) on delete cascade,

  -- Qui l'a donnée, et qui l'a close. Les noms recopiés, comme ailleurs : un
  -- collègue qui part n'efface pas la trace de ce qu'il a demandé.
  created_by      text,
  created_by_name text        not null default '',
  created_at      timestamptz not null default now(),
  done_at         timestamptz,
  done_by         text,
  done_by_name    text        not null default ''
);

create index if not exists tasks_owner on tasks (owner_id) where state = 'open';
create index if not exists tasks_due   on tasks (due_on)   where state = 'open';
create index if not exists tasks_edition on tasks (edition_id);
create index if not exists tasks_record  on tasks (record_id);
