-- La fiche, fin : les besoins, et les documents.
--
-- Les besoins sont ce qu'une société demande, et ce qui changera le plus vite
-- dans sa fiche : on lève cette année, plus l'an prochain ; on cherche des
-- distributeurs, puis des recrues. Une ligne par besoin, avec ses réponses et
-- sa date — et un besoin qu'on désélectionne n'est pas effacé : il passe
-- inactif, ses réponses restent, et le resélectionner les retrouve. Seule une
-- suppression confirmée les retire. C'est aussi la forme qu'il faudra pour
-- rapprocher un jour une société des programmes, des investisseurs et des
-- partenaires : une clé connue, et des réponses prises dans des listes.
create table if not exists org_needs (
  org_id        text        not null references records(id) on delete cascade,
  -- 'fundraising' | 'markets' | 'mentoring' | 'product' | 'partners' | 'hiring' | 'support'
  need          text        not null,
  data          jsonb       not null default '{}'::jsonb,
  active        boolean     not null default true,
  updated_at    timestamptz not null default now(),
  deselected_at timestamptz,
  created_at    timestamptz not null default now(),
  primary key (org_id, need)
);

-- Les documents de l'organisation : déposés une fois sur sa fiche, plutôt
-- que redemandés à chaque candidature. Le fichier est un upload comme les
-- autres ; cette ligne dit à qui il est, ce que c'est, et de quel exercice.
create table if not exists org_documents (
  id              text primary key,
  org_id          text        not null references records(id) on delete cascade,
  -- 'statutes' | 'rc' | 'financials' | 'pitch_deck' | 'catalogue' | 'other'
  kind            text        not null,
  -- L'exercice, pour un bilan.
  year            integer,
  -- Ce que c'est, pour un « autre document ».
  label           text        not null default '',
  upload_id       text        not null,
  created_by_name text        not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists org_documents_org on org_documents (org_id);
