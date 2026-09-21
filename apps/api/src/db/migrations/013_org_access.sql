-- An organisation page is held by its people, the way a company page is. Until
-- now belonging to one was the whole permission: any affiliation could edit the
-- page and apply in the organisation's name. That is the hole this closes.
--
-- The right sits on the affiliation rather than on the account, because a person
-- holds several organisations and does not hold them the same way — a founder of
-- one may be a plain listed member of another.
--
-- `role` already exists beside it and keeps its job: the title the jury reads
-- (CEO, CTO, COO). A title is not a permission, and the two are never inferred
-- from one another.
alter table affiliations add column if not exists access text not null default 'member';

-- Every affiliation that exists today came from the import or from the member
-- space, and in both cases it is a founder's link to their own page.
update affiliations set access = 'admin';
