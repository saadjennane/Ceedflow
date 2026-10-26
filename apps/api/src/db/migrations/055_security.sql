-- La sécurité avant le rollout.

-- Qui a déposé un fichier. Rattacher un fichier à une candidature, le mettre
-- en logo ou le joindre à un compte rendu n'est permis qu'à qui l'a déposé :
-- connaître son identifiant ne suffit plus pour s'en emparer. Vide pour les
-- fichiers d'avant.
alter table uploads add column if not exists uploaded_by text;
create index if not exists uploads_uploaded_by on uploads (uploaded_by, created_at);

-- Ce que l'accès à un fichier joint à chaque fois : sans index, chaque
-- ouverture parcourait ces tables en entier.
create index if not exists uploads_candidate on uploads (candidate_id);
create index if not exists records_logo_upload on records (logo_upload_id);
create index if not exists org_documents_upload on org_documents (upload_id);
create index if not exists org_products_image_upload on org_products (image_upload_id);

-- Rejoindre une organisation qui existe déjà est une demande, pas un fait :
-- un administrateur de l'organisation, ou CEED, la valide. Jusque-là, qui
-- l'a faite ne voit rien de ce que l'organisation garde pour elle.
create table if not exists org_requests (
  id         text primary key,
  person_id  text        not null references records(id) on delete cascade,
  org_id     text        not null references records(id) on delete cascade,
  role       text        not null default '',
  created_at timestamptz not null default now(),
  unique (person_id, org_id)
);
create index if not exists org_requests_org on org_requests (org_id, created_at);
