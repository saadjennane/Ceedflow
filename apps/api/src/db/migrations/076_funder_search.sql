-- La recherche d'opportunités, bailleur par bailleur.
--
-- Une fiche de recherche par bailleur suivi : ses autres noms, ses facilités,
-- les pays et thèmes qui intéressent CEED, ses sources, et ce qu'on a écarté —
-- chaque refus affine la recherche suivante. Les résultats sont des pistes
-- trouvées sur le web, avec leurs pages : rien n'est suivi sans un clic.
create table if not exists funder_profiles (
  record_id          text primary key references records(id) on delete cascade,
  aliases            jsonb       not null default '[]'::jsonb,
  facilities         jsonb       not null default '[]'::jsonb,
  countries          jsonb       not null default '[]'::jsonb,
  themes             jsonb       not null default '[]'::jsonb,
  instruments        jsonb       not null default '[]'::jsonb,
  sources            jsonb       not null default '[]'::jsonb,
  exclusions         jsonb       not null default '[]'::jsonb,
  search_status      text        not null default 'none',
  search_error       text        not null default '',
  last_search_at     timestamptz,
  updated_at         timestamptz not null default now(),
  check (search_status in ('none', 'pending', 'done', 'failed'))
);

create table if not exists funder_search_results (
  id                    text primary key,
  record_id             text        not null references records(id) on delete cascade,
  -- Le titre ramené à l'essentiel : la même piste ne revient pas deux fois.
  fingerprint           text        not null,
  type                  text        not null,
  title                 text        not null,
  organization          text        not null default '',
  nature                text        not null default '',
  funding_note          text        not null default '',
  summary               text        not null default '',
  deadline              text,
  amount                text,
  published_at          text,
  urls                  jsonb       not null default '[]'::jsonb,
  relevance             text        not null default 'medium',
  relevance_reason      text        not null default '',
  eligibility_to_verify boolean     not null default true,
  status                text        not null default 'new',
  dismiss_reason        text        not null default '',
  opportunity_id        text        references funding_opportunities(id) on delete set null,
  found_at              timestamptz not null default now(),
  check (type in ('identified_tender', 'future_opportunity', 'strategic_prospecting', 'project_concept')),
  check (relevance in ('high', 'medium', 'low')),
  check (status in ('new', 'saved', 'dismissed'))
);
create unique index if not exists funder_search_results_once on funder_search_results (record_id, fingerprint);
create index if not exists funder_search_results_new on funder_search_results (status, found_at desc);
