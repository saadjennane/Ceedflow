-- Being named by a notice is not the same as having been told.
--
-- `deliverable_asked_once` exists so that twenty clicks on "ask them" write to
-- each startup once. It does that by holding a slot per startup from the moment
-- a notice names one — which is right while the notice is in flight, and wrong
-- for good afterwards in the two cases where nobody actually heard anything:
--
--   · the notice was called off before it went out;
--   · the startup was named and then left out at the hour — no address, a dead
--     address, no account.
--
-- Without this, calling off a notice would permanently bar every startup it
-- had named from ever being asked again, and the second launch would die on a
-- unique violation rather than say so. A startup that had no address in
-- October could never be asked in November, after somebody typed one in.
--
-- So the slot is released explicitly, and the index stops counting it. The
-- target row stays: this product does not erase an act, and "named, then left
-- out because the address bounced" is exactly the sort of thing somebody asks
-- about three weeks later.
alter table deliverable_notice_targets add column if not exists released_at timestamptz;

drop index if exists deliverable_asked_once;
create unique index deliverable_asked_once
  on deliverable_notice_targets (block_id, candidate_id)
  where kind = 'request' and released_at is null;

-- Anything already recorded as skipped was never told. Catching those up here
-- rather than leaving them barred is the whole point of the column.
update deliverable_notice_targets t
   set released_at = now()
 where t.released_at is null
   and (t.skipped <> ''
        or exists (select 1 from deliverable_notices n
                    where n.id = t.notice_id and n.state in ('cancelled', 'abandoned')));
