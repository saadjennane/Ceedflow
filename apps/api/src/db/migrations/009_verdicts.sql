-- An evaluator either marks a grid or names a status. The marks were already
-- here; this is where the status goes, alongside rather than inside them.
alter table evaluation_scores add column if not exists verdict text not null default '';
