-- Les One to One : une startup, un interlocuteur, un rendez-vous, un compte rendu.
--
-- Une ligne par rendez-vous, et non une ligne par créneau : ce qu'on suit est
-- qui a vu qui, quand, et ce qui s'y est dit. La date et l'heure suivent la
-- convention du comité — un jour et une heure locaux, sans fuseau —, parce
-- qu'un mentor à Casablanca donne rendez-vous à 10 h à Casablanca.
--
-- Le mode d'invitation est porté par le rendez-vous et non par la brique : on
-- laisse une startup réserver chez son mentor et on fixe d'autorité la séance
-- de l'expert juridique, dans la même brique.
create table if not exists one_to_one_series (
  id               text primary key,
  block_id         text        not null references blocks(id) on delete cascade,
  candidate_id     text        not null references candidates(id) on delete cascade,
  person_id        text        not null references records(id) on delete cascade,
  -- 'weekly' | 'biweekly' | 'monthly'
  frequency        text        not null,
  first_on         date        not null,
  start_time       text,
  until_on         date,
  count            integer,
  duration_minutes integer     not null default 45,
  location         text        not null default '',
  created_at       timestamptz not null default now()
);

create table if not exists one_to_one_meetings (
  id                  text primary key,
  block_id            text        not null references blocks(id) on delete cascade,
  candidate_id        text        not null references candidates(id) on delete cascade,
  -- L'interlocuteur : une fiche de l'annuaire, pas forcément un compte.
  person_id           text        not null references records(id) on delete cascade,
  series_id           text references one_to_one_series(id) on delete set null,
  held_on             date,
  start_time          text,
  duration_minutes    integer     not null default 45,
  location            text        not null default '',
  -- 'slots' : la startup réserve ; 'confirm' : proposé, on attend sa réponse ;
  -- 'none' : fixé, sans invitation.
  invite              text        not null default 'confirm' check (invite in ('slots', 'confirm', 'none')),
  token               text        not null unique,
  rsvp_state          text        not null default 'pending' check (rsvp_state in ('pending', 'confirmed', 'declined')),
  responded_at        timestamptz,
  status              text        not null default 'planned' check (status in ('planned', 'held', 'cancelled', 'no_show')),
  -- Le compte rendu : les réponses, par question. Jamais lu par la startup.
  report              jsonb       not null default '{}'::jsonb,
  report_submitted_at timestamptz,
  report_by           text,
  report_by_name      text        not null default '',
  created_at          timestamptz not null default now()
);
create index if not exists one_to_one_meetings_block  on one_to_one_meetings (block_id);
create index if not exists one_to_one_meetings_person on one_to_one_meetings (person_id, held_on);
create index if not exists one_to_one_meetings_cand   on one_to_one_meetings (candidate_id);

-- Les disponibilités qu'un interlocuteur publie, pour qu'une startup réserve.
-- Les créneaux ne sont pas stockés : ils se calculent, comme ceux du comité.
create table if not exists one_to_one_availability (
  id           text primary key,
  block_id     text        not null references blocks(id) on delete cascade,
  person_id    text        not null references records(id) on delete cascade,
  on_date      date        not null,
  start_time   text        not null,
  end_time     text        not null,
  slot_minutes integer     not null default 45,
  created_at   timestamptz not null default now()
);
create index if not exists one_to_one_availability_person on one_to_one_availability (person_id, on_date);
