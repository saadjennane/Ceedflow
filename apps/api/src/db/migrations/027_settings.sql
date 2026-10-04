-- Le peu que la plateforme sait d'elle-même.
--
-- Une table clé/valeur plutôt qu'une colonne par chose : ce qui vit ici n'est
-- pas un domaine, c'est ce qu'un déploiement apprend de lui-même en tournant —
-- à commencer par sa propre adresse publique, que chaque requête servie lui
-- indique et qu'aucun humain ne devrait avoir à saisir deux fois.
create table if not exists settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
