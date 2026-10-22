-- Un lien pour chaque formulaire qui n'en avait pas.
--
-- Dupliquer une édition vidait le lien public de son formulaire au lieu d'en
-- donner un neuf : l'adresse affichée dans le builder répondait « This form
-- does not exist ». Seuls les liens vides sont remplis — un lien déjà envoyé
-- à des candidats reste celui qu'ils ont.
update blocks
   set config = jsonb_set(config, '{publicToken}', to_jsonb(substr(md5(random()::text || id), 1, 16)))
 where type = 'application'
   and coalesce(config->>'publicToken', '') = '';
