-- An account CEED opens for somebody else starts on a provisional password.
-- The flag below is what makes it provisional: while it is set, the session
-- opens exactly one door — the screen that replaces the password — and every
-- other member route refuses. Clearing it is the act of choosing a password.
alter table accounts add column if not exists must_change_password boolean not null default false;
