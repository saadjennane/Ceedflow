-- A send goes out through one channel, so what it produced can be told apart
-- from what a link posted elsewhere brought in.
alter table outreach_sends add column if not exists channel_id text not null default '';
