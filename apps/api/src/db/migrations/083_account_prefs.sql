-- Ce qu'une personne a réglé pour elle-même — la disposition d'une grille, par
-- exemple — gardé sur son compte : elle le retrouve sur n'importe quel poste,
-- et ne touche jamais la vue d'un collègue.
create table if not exists account_prefs (
  account_id text        not null references accounts(id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, key)
);
