-- The order startups were put on a sitting, stored rather than hoped for.
--
-- Until now nothing recorded it and nothing ordered by it: the rows came back
-- in whatever order the heap held them, which matched the order of addition
-- right up to the first edit — and every placement in a slot and every answer
-- to an invitation is an edit. The list quietly reshuffled itself as soon as
-- you started working.
--
-- Nor could the id stand in for it. It carries a millisecond timestamp, and a
-- batch added from Setup lands inside one millisecond, so the order within a
-- batch was drawn at random.
--
-- This is the same column `committee_sessions` already keeps, for the same
-- reason: an order somebody chose is a fact, not a side effect.
alter table committee_assignments add column if not exists position integer not null default 0;

-- Existing rows keep the order their ids imply, which is the best reading of
-- what happened that we still have.
with ranked as (
  select id, row_number() over (partition by session_id order by id) - 1 as n
  from committee_assignments
)
update committee_assignments a set position = ranked.n
from ranked where ranked.id = a.id;

create index if not exists assignments_order_idx on committee_assignments(session_id, position);
