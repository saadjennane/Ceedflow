-- Reading a file, not just receiving it.
--
-- A document arrives, somebody at CEED looks at it, and one of two things
-- follows: it is in order, or it has to be sent again — an expired registre,
-- an unreadable scan, the wrong year. Without this the only thing the screens
-- could say was "arrived", which is the smaller half of a due diligence.
--
-- `received` is the state a thing is in the moment it lands, so it is the
-- default: a row exists only because something was handed in.
alter table deliverable_returns
  add column if not exists state text not null default 'received';

alter table deliverable_returns
  drop constraint if exists deliverable_returns_state_check;
alter table deliverable_returns
  add constraint deliverable_returns_state_check
  check (state in ('received', 'accepted', 'rejected'));

-- Why it was refused, in the words whoever refused it used. Shown to the
-- startup: "send it again" with no reason is how a file goes round twice.
alter table deliverable_returns
  add column if not exists reason text not null default '';

-- When it was looked at, which is what tells a file nobody has read yet from
-- one that has been read and is in order.
alter table deliverable_returns
  add column if not exists reviewed_at timestamptz;
