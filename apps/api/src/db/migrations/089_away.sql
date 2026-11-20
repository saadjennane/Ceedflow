-- Absent jusqu'à une date : chacun le dit pour lui-même, et l'équipe le voit
-- sur la page d'accueil. La date passée, il redevient présent tout seul.
alter table accounts add column if not exists away_until date;
alter table accounts add column if not exists away_note  text not null default '';
