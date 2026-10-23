-- Remettre en forme ce qui a été enregistré deux fois encodé.
--
-- Les champs jsonb de la fiche — secteurs secondaires, réseaux, brevet,
-- marchés, pays, réponses d'un besoin — partaient en texte déjà encodé, et le
-- client Postgres les encodait une seconde fois : l'objet était stocké comme
-- une chaîne. PGlite ne le montrait pas. Seules les valeurs stockées comme une
-- chaîne sont réécrites, décodées une fois ; les autres ne bougent pas.
update records set secondary_sectors = (secondary_sectors #>> '{}')::jsonb where jsonb_typeof(secondary_sectors) = 'string';
update records set socials           = (socials           #>> '{}')::jsonb where jsonb_typeof(socials)           = 'string';
update records set patent_details    = (patent_details    #>> '{}')::jsonb where jsonb_typeof(patent_details)    = 'string';
update records set target_markets    = (target_markets    #>> '{}')::jsonb where jsonb_typeof(target_markets)    = 'string';
update records set sales_countries   = (sales_countries   #>> '{}')::jsonb where jsonb_typeof(sales_countries)   = 'string';
update org_needs set data            = (data              #>> '{}')::jsonb where jsonb_typeof(data)              = 'string';
