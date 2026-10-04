-- Telling the startups, as an act rather than a side effect.
--
-- Opening the door used to be the only thing that happened, and the moment
-- mail is wired that would write to a list nobody had read back. A notice is
-- the thing somebody launches on purpose, after seeing who it names.
--
-- The target set is frozen when it is launched — that is the whole point of
-- looking at it — and filtered against the present when it goes out. Never a
-- target added afterwards, never one that should no longer hear about it.
create table if not exists deliverable_notices (
  id            text primary key,
  block_id      text not null references blocks(id) on delete cascade,
  kind          text not null,
  -- planned   : written, waiting for its hour
  -- sent      : the letters were written to the outbox
  -- cancelled : somebody called it off before it went
  -- abandoned : its hour came and it could not go. `reason` says why.
  state         text not null default 'planned',
  reason        text not null default '',
  -- The message as it was read back at launch, kept whole: the template may
  -- change afterwards, what went out may not.
  body          text not null default '',
  -- 'Now' is simply now(), so an immediate notice and a scheduled one are one
  -- code path and a crash is a retry rather than a half-sent notice.
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  cancelled_at  timestamptz,
  created_by      text,
  created_by_name text not null default '',
  created_at    timestamptz not null default now()
);

alter table deliverable_notices drop constraint if exists deliverable_notices_kind_check;
alter table deliverable_notices add constraint deliverable_notices_kind_check
  check (kind in ('request', 'reminder'));
alter table deliverable_notices drop constraint if exists deliverable_notices_state_check;
alter table deliverable_notices add constraint deliverable_notices_state_check
  check (state in ('planned', 'sent', 'cancelled', 'abandoned'));

-- One row per startup a notice names. `sent_at` is claimed before the letter
-- is written, which is what makes a send idempotent across a restart and
-- across two ticks that overlap.
create table if not exists deliverable_notice_targets (
  notice_id    text not null references deliverable_notices(id) on delete cascade,
  -- Carried here as well so the index below can exist at all.
  block_id     text not null,
  kind         text not null,
  candidate_id text not null references candidates(id) on delete cascade,
  sent_at      timestamptz,
  letter_id    text,
  -- Why this one got nothing: 'withdrawn', 'no_email', 'no_account',
  -- 'suppressed', 'not_owed'. Empty when it was written to.
  skipped      text not null default '',
  primary key (notice_id, candidate_id)
);

-- A startup is asked once per block, whatever happens — two administrators
-- launching at the same second cannot both win. Reminders repeat by nature.
create unique index if not exists deliverable_asked_once
  on deliverable_notice_targets (block_id, candidate_id) where kind = 'request';

create index if not exists deliverable_notices_block
  on deliverable_notices (block_id, created_at desc);
-- The tick reads this one, so it must never scan every notice of every block.
create index if not exists deliverable_notices_due
  on deliverable_notices (scheduled_for) where state = 'planned';
create index if not exists deliverable_targets_candidate
  on deliverable_notice_targets (candidate_id);
