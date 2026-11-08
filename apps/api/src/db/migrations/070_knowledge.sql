-- La Knowledge Base : le référentiel interne de CEED.
--
-- Une connaissance (kb_entries) garde un identifiant stable ; ce qui change,
-- ce sont ses versions (kb_versions). Une seule est officielle à la fois : celle
-- que l'entrée désigne. Une version publiée ne se réécrit jamais — la modifier,
-- c'est en ouvrir une nouvelle, qui refait tout le circuit.
--
-- L'IA analyse et recommande (kb_analyses, kb_findings), les membres relisent,
-- le président valide. Tout se trace dans kb_activity.
--
-- L'API est le seul accès à ces tables : chaque droit se vérifie dans le service.

create table if not exists kb_categories (
  id         text primary key,
  name       text        not null,
  position   integer     not null default 0,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

-- Les catégories de départ se posent depuis le code, à la première lecture :
-- une ligne amorcée ici gênerait la restauration d'une sauvegarde.

create table if not exists kb_entries (
  id                  text primary key,
  category_id         text        not null references kb_categories(id),
  created_by          text        references records(id) on delete set null,
  -- La version officielle : nulle tant que rien n'est publié.
  official_version_id text,
  created_at          timestamptz not null default now()
);

create table if not exists kb_versions (
  id              text primary key,
  entry_id        text        not null references kb_entries(id) on delete cascade,
  number          integer     not null,
  title           text        not null,
  body            text        not null default '',
  -- L'empreinte du titre et du contenu : ce qu'une review et une validation visent.
  content_hash    text        not null,
  change_summary  text        not null default '',
  status          text        not null default 'analysis_pending',
  author_id       text        references records(id) on delete set null,
  -- Chaque enregistrement l'incrémente : deux personnes ne s'écrasent pas.
  revision        integer     not null default 1,
  reviewed_by     text        references records(id) on delete set null,
  reviewed_at     timestamptz,
  reviewed_hash   text,
  review_comment  text        not null default '',
  validated_by    text        references records(id) on delete set null,
  validated_at    timestamptz,
  decision        text,
  decision_note   text        not null default '',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (entry_id, number),
  check (status in ('draft', 'analysis_pending', 'analysis_failed', 'to_review', 'changes_requested',
                    'to_validate', 'published', 'rejected', 'archived'))
);
create index if not exists kb_versions_entry on kb_versions (entry_id, number desc);
create index if not exists kb_versions_status on kb_versions (status);
-- Une seule version en cours par connaissance : on ne prépare pas deux mises à jour concurrentes.
create unique index if not exists kb_versions_one_open on kb_versions (entry_id)
  where status in ('draft', 'analysis_pending', 'analysis_failed', 'to_review', 'changes_requested', 'to_validate');

create table if not exists kb_analyses (
  id          text primary key,
  version_id  text        not null references kb_versions(id) on delete cascade,
  -- L'empreinte analysée : une analyse ne vaut que pour ce texte-là.
  content_hash text       not null,
  provider    text        not null default '',
  model       text        not null default '',
  status      text        not null default 'pending',
  result      jsonb       not null default '{}'::jsonb,
  error       text        not null default '',
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  check (status in ('pending', 'done', 'failed'))
);
create index if not exists kb_analyses_version on kb_analyses (version_id, created_at desc);

create table if not exists kb_findings (
  id               text primary key,
  -- Nulle pour un constat signalé à la main par un relecteur.
  analysis_id      text        references kb_analyses(id) on delete cascade,
  version_id       text        not null references kb_versions(id) on delete cascade,
  -- Le texte exact visé : une décision prise sur un ancien texte ne vaut pas pour le nouveau.
  content_hash     text        not null,
  -- 'ai' ou 'member'.
  source           text        not null default 'ai',
  -- La version exacte à laquelle elle est comparée.
  other_version_id text        references kb_versions(id) on delete set null,
  kind             text        not null,
  confidence       integer     not null default 0,
  excerpt          text        not null default '',
  other_excerpt    text        not null default '',
  explanation      text        not null default '',
  recommendation   text        not null default '',
  -- Ouvert, il bloque la publication.
  state            text        not null default 'open',
  justification    text        not null default '',
  decided_by       text        references records(id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  check (kind in ('duplicate', 'conflict', 'clarification')),
  check (state in ('open', 'not_a_conflict', 'resolved', 'acknowledged'))
);
create index if not exists kb_findings_version on kb_findings (version_id);

create table if not exists kb_comments (
  id         text primary key,
  version_id text        not null references kb_versions(id) on delete cascade,
  author_id  text        references records(id) on delete set null,
  body       text        not null,
  created_at timestamptz not null default now()
);
create index if not exists kb_comments_version on kb_comments (version_id, created_at);

create table if not exists kb_activity (
  id         text primary key,
  entry_id   text        not null references kb_entries(id) on delete cascade,
  version_id text        references kb_versions(id) on delete set null,
  action     text        not null,
  actor_id   text        references records(id) on delete set null,
  note       text        not null default '',
  meta       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists kb_activity_entry on kb_activity (entry_id, created_at);
create index if not exists kb_activity_time on kb_activity (created_at desc);
