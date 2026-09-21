-- When the invitation went out. Recorded rather than delivered, the way an
-- outreach send is: no mail provider is wired in yet, and the act of inviting is
-- worth keeping either way — it is what separates an account nobody has been
-- told about from one whose owner simply has not come to claim it.
alter table accounts add column if not exists invited_at timestamptz;
