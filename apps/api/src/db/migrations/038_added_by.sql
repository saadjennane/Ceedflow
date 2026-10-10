-- Qui a ajouté cette fiche.
--
-- `origin` dit par quelle porte elle est entrée — un fichier, un formulaire,
-- la main de quelqu'un — et pas de quelle main. Sur une liste de quatre cents
-- personnes, la question qui se pose est « qui l'a mise là, que je lui
-- demande », et elle n'avait pas de réponse.
--
-- Le nom est recopié plutôt que joint : un collaborateur qui part ne doit pas
-- effacer la trace de ce qu'il a fait, et c'est la même raison qui fait écrire
-- le nom du juré à côté de sa note.
alter table records add column if not exists created_by      text;
alter table records add column if not exists created_by_name text not null default '';
