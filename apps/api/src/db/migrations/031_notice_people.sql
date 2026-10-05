-- Un juré n'est pas une candidature.
--
-- Tout le mécanisme nommait ses cibles par `candidate_id`, parce que la
-- première brique à s'en servir n'écrivait qu'à des startups. Convoquer un
-- comité, c'est écrire à deux populations : les startups programmées, et les
-- jurés du panel — qui sont des personnes de l'annuaire et n'ont pas de
-- candidature.
--
-- Une cible nomme donc l'un ou l'autre, jamais les deux, jamais aucun. Les
-- deux cascades restent : retirer une personne de l'annuaire ou supprimer une
-- candidature emporte ce qui lui était destiné, sans quoi la suppression lève
-- une erreur que personne ne saurait lire.
-- La clé primaire nommait la candidature ; elle devient la personne visée,
-- quelle qu'elle soit. Un index unique plutôt qu'une clé primaire parce qu'une
-- clé primaire ne porte pas sur une expression.
alter table notice_targets drop constraint if exists deliverable_notice_targets_pkey;
alter table notice_targets drop constraint if exists notice_targets_pkey;
alter table notice_targets alter column candidate_id drop not null;
alter table notice_targets add column if not exists record_id text references records(id) on delete cascade;

alter table notice_targets drop constraint if exists notice_target_names_one;
alter table notice_targets add constraint notice_target_names_one
  check ((candidate_id is not null) <> (record_id is not null));

-- L'unicité porte sur la personne visée, quelle que soit sa nature.
drop index if exists notice_told_once;
create unique index if not exists notice_told_once
  on notice_targets (block_id, kind, coalesce(candidate_id, record_id))
  where once and released_at is null;

create unique index if not exists notice_target_one_per_notice
  on notice_targets (notice_id, coalesce(candidate_id, record_id));

create index if not exists notice_targets_record on notice_targets (record_id);
