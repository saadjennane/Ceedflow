-- Somebody leaves the jury, a laptop goes missing, a founder asks to be taken
-- out: the way in has to close without the person leaving the directory. They
-- are still a juror who scored, a founder on a candidacy, a contact on a
-- record — deleting the account would be a different act, and losing the
-- record a third one.
--
-- A date rather than a flag: "since when" is the first thing asked when
-- somebody finds they cannot sign in.
alter table accounts
  add column if not exists disabled_at timestamptz;
