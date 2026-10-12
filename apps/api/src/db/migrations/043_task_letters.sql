-- Prévenir qu'on attend quelque chose de quelqu'un.
--
-- Une tâche posée dans l'application est vue par qui ouvre l'application. Pour
-- l'équipe CEED c'est tous les jours ; pour un mentor, un juré ou une
-- fondatrice, c'est une fois par mois — et une tâche qu'on ne découvre qu'en
-- se connectant est une tâche qu'on découvre en retard.
--
-- Deux lettres, donc, et pas une de plus : celle qui dit qu'on vous a confié
-- quelque chose, et celle qui dit que la date est passée.

-- Le courrier qui n'appartient à aucune brique.
--
-- L'objet et le gabarit des lettres du tunnel vivent dans la config de leur
-- brique, parce qu'ils sont ceux de cette étape de ce programme. Les tâches ne
-- sont d'aucun programme : leur courrier est celui de la maison, écrit une
-- fois pour tout l'espace. D'où une table, et non un champ de plus ailleurs.
create table if not exists house_letters (
  key             text primary key,
  subject         text        not null default '',
  body            text        not null default '',
  -- Éteindre plutôt que vider : un gabarit effacé pour arrêter les envois est
  -- un gabarit à réécrire le jour où on les reprend.
  enabled         boolean     not null default true,
  updated_at      timestamptz not null default now(),
  updated_by_name text        not null default ''
);

-- Quand on a prévenu, et non « si » : la date se lit sur la ligne, et c'est
-- elle qui empêche d'écrire deux fois pour la même tâche.
alter table tasks add column if not exists told_at timestamptz;

-- Le dernier rappel de retard parti pour cette tâche. Posé au moment même où
-- la ligne est réclamée, pour que deux ticks qui se chevauchent n'envoient pas
-- deux fois le même récapitulatif.
alter table tasks add column if not exists late_letter_at timestamptz;
