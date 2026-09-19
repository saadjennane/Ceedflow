-- A person's name is structured now that they type it themselves. `name` stays
-- the display form every other table already points at, derived on write.
alter table records add column if not exists first_name text not null default '';
alter table records add column if not exists last_name  text not null default '';

-- An account is a way to sign in to one directory record. The profile a member
-- fills in IS that record — there is no second copy of a person.
create table if not exists accounts (
  id            text primary key,
  record_id     text        not null references records(id) on delete cascade,
  email         text        not null unique,
  password_hash text        not null,
  created_at    timestamptz not null default now()
);
create unique index if not exists accounts_record_idx on accounts(record_id);

-- Only the hash of a session token is stored: reading this table is not enough
-- to impersonate anybody.
create table if not exists sessions (
  token_hash text primary key,
  account_id text        not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_account_idx on sessions(account_id);
