-- Prévenir n'est pas propre aux livrables.
--
-- Le mécanisme a été écrit pour une brique — figer la liste, la relire, la
-- filtrer à l'heure dite, réclamer chaque cible, dire pourquoi une lettre n'est
-- pas partie. Rien là-dedans ne parle de livrables : une Selection qui annonce
-- ses issues en a besoin mot pour mot, et un comité qui convoque son jury
-- aussi. Deux mécanismes parallèles auraient fini par diverger, et c'est
-- l'historique — « est-ce que cette startup a été prévenue » — qui aurait eu
-- deux réponses.
alter table deliverable_notices rename to notices;
alter table deliverable_notice_targets rename to notice_targets;

-- `kind` cesse d'être une liste fermée de deux mots. Un nouveau genre de
-- message est une ligne de code, pas une migration — la même raison qui fait
-- que `outbox.kind` est du texte libre.
alter table notices drop constraint if exists deliverable_notices_kind_check;
alter table notices drop constraint if exists notices_kind_check;

-- Dire deux fois la même chose à la même startup est un défaut pour une
-- demande de livrables comme pour une annonce de résultat ; une relance, elle,
-- est faite pour être répétée. La différence appartient donc à celui qui lance,
-- pas à une liste de mots inscrite dans un index.
alter table notice_targets add column if not exists once boolean not null default true;
update notice_targets set once = (kind <> 'reminder');

drop index if exists deliverable_asked_once;
create unique index if not exists notice_told_once
  on notice_targets (block_id, kind, candidate_id)
  where once and released_at is null;

alter index if exists deliverable_notices_block rename to notices_block;
alter index if exists deliverable_notices_due rename to notices_due;
alter index if exists deliverable_targets_candidate rename to notice_targets_candidate;
