-- Taking a juror off a panel used to leave their marks weighing on the
-- average, silently and for ever. Deleting the rows instead would have been
-- worse: a jury's decisions can be contested, and the record of who said what
-- is the thing you need on that day.
--
-- So a withdrawn mark stays where it is and stops counting. The date says
-- when, which is the question anybody asks first.
alter table evaluation_scores
  add column if not exists withdrawn_at timestamptz;

-- Only the counted marks are read on the hot path; the withdrawn ones are
-- history, looked at one candidacy at a time.
create index if not exists evaluation_scores_counted
  on evaluation_scores (block_id)
  where withdrawn_at is null;
