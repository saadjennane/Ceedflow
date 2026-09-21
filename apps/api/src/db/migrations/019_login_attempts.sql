-- Failed sign-ins, kept only long enough to slow a guessing machine down.
--
-- Nothing stopped anyone trying passwords in a loop. With a public address and
-- four hundred accounts, that is the first door somebody leans on.
--
-- Only failures are written, and only what is needed to count them: no
-- password, no body, nothing about the attempt except that one was made. A
-- successful sign-in clears its own trail, so an ordinary person who mistyped
-- twice leaves nothing behind.
create table if not exists login_attempts (
  id          text        primary key,
  -- Lowercased on write, so two spellings of the same address count together.
  email       text        not null,
  -- The address the request came from, as the proxy reports it.
  ip          text        not null,
  at          timestamptz not null default now()
);

create index if not exists login_attempts_email_idx on login_attempts(email, at);
create index if not exists login_attempts_ip_idx on login_attempts(ip, at);
