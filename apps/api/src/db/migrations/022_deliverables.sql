-- What a startup has handed in against one thing that was asked of it.
--
-- One row per item per candidacy rather than a bag of answers on the
-- candidacy, because the unit being followed here is the item: this document
-- arrived on the 3rd, that figure is still missing, and the question "who has
-- sent what" has to be answerable without reading anything apart.
--
-- A file lands in `uploads` like any other, and its id travels in `value` the
-- way a form's file answer does — the founder's side already draws both.
create table if not exists deliverable_returns (
  block_id     text        not null references blocks(id) on delete cascade,
  candidate_id text        not null references candidates(id) on delete cascade,
  item_id      text        not null,
  value        jsonb       not null default 'null'::jsonb,
  -- When it was handed in. Null while the item is still only asked for, which
  -- is what separates "nothing yet" from "sent and empty".
  returned_at  timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (block_id, candidate_id, item_id)
);

-- The screen that matters reads a whole block at once: every startup, every
-- item, one query.
create index if not exists deliverable_returns_block_idx
  on deliverable_returns (block_id);
