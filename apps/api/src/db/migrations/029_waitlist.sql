-- Une troisième réponse : la liste d'attente.
--
-- Une sélection n'en rendait que deux, et c'est ce qui obligeait à mentir : une
-- startup qu'un comité garde sous la main était soit « retenue » — ce qu'elle
-- n'est pas — soit « non retenue », qu'on ne pouvait pas lui dire sans avoir à
-- se dédire huit jours plus tard. Elle restait donc sans statut et sans mot,
-- pendant que les retenues recevaient le leur.
--
-- Seul `pass` ouvre la porte en aval. `wait` est une décision prise, pas une
-- décision ajournée : elle s'affiche, elle se compte, et elle a sa lettre.
alter table selection_outcomes drop constraint if exists outcome_check;
alter table selection_outcomes add constraint outcome_check
  check (outcome in ('pass', 'wait', 'fail'));
