-- Four statuses, of which two were the same thing. Nothing in the product ever
-- read `Published` or `Running` except a counter on the programmes page, so the
-- difference between them was the word on a badge.
--
-- Three that each decide something instead: Draft hides every external door,
-- Live opens them subject to each brick's own window, and Completed leaves the
-- edition readable while nothing more can be filed.
alter table editions drop constraint if exists editions_status_check;

update editions set status = 'Live' where status in ('Published', 'Running');

alter table editions add constraint editions_status_check
  check (status in ('Draft', 'Live', 'Completed'));
