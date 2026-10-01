-- Every message the platform means to send, before and after it goes.
--
-- Not a log written after the fact: the row is made first and the sending
-- fills it in. A jury day turns on "was the invitation actually sent", and the
-- honest answer to that cannot be reconstructed from a provider's dashboard
-- three weeks later.
--
-- It is also what makes sending safe to switch on. Nothing leaves outside
-- production; the row is written and marked held, so the whole chain can be
-- exercised against four hundred real addresses without one of them hearing
-- about it.
create table if not exists outbox (
  id          text        primary key,
  -- What this message is, as the product thinks of it: 'password_reset',
  -- 'account_invite', 'deliverable_rejected'. Kept as text rather than an
  -- enum because a new kind of message is a new line of code, not a migration.
  kind        text        not null,
  to_email    text        not null,
  to_name     text        not null default '',
  subject     text        not null,
  body        text        not null,
  -- The act it belongs to, so a screen can ask "what went out about this
  -- candidacy" without joining through three tables.
  record_id   text,
  block_id    text,
  candidate_id text,
  -- queued  : waiting to go
  -- held    : written, deliberately not sent (anywhere that is not production)
  -- sent    : the provider took it
  -- failed  : the provider refused it, `error` says why
  -- bounced : it came back, which retires the address
  state       text        not null default 'queued',
  error       text        not null default '',
  -- What the provider calls it, so a bounce landing on a webhook can find
  -- its way back to this row.
  provider_id text,
  attempts    integer     not null default 0,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  updated_at  timestamptz not null default now()
);

alter table outbox drop constraint if exists outbox_state_check;
alter table outbox add constraint outbox_state_check
  check (state in ('queued', 'held', 'sent', 'failed', 'bounced'));

-- The sender reads the queue; everything else reads one recipient's history.
create index if not exists outbox_queue_idx on outbox (state, created_at) where state = 'queued';
create index if not exists outbox_to_idx on outbox (to_email, created_at desc);
create unique index if not exists outbox_provider_idx on outbox (provider_id) where provider_id is not null;

-- An address that came back for good. Nothing is sent to it again: writing to
-- a dead address for months is how a sending reputation is lost, and how a
-- founder is thought to have been told something they never heard.
create table if not exists email_suppressions (
  email      text        primary key,
  reason     text        not null default '',
  created_at timestamptz not null default now()
);
