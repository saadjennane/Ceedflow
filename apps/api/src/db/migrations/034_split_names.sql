-- Prénom et nom, séparés au premier espace.
--
-- The columns have been there all along and almost nothing filled them: a
-- directory built by import and by a form with a single Name field left four
-- hundred and sixty-nine people with a full name and two empty halves. Every
-- letter that says "Bonjour {{prenom}}" was therefore guessing, silently, on
-- each send.
--
-- The first space is the rule, and it is wrong for a compound given name —
-- Mohamed Amine Beniouri becomes Mohamed, then Amine Beniouri. It is wrong
-- visibly, in two fields somebody can correct, rather than invisibly inside a
-- template at the hour four hundred letters go out.
--
-- Only where nothing was filled in: a split already made by hand is a decision,
-- and this must not undo it.
update records
   set first_name = case
         when position(' ' in btrim(name)) = 0 then btrim(name)
         else substring(btrim(name) from 1 for position(' ' in btrim(name)) - 1)
       end,
       last_name = case
         when position(' ' in btrim(name)) = 0 then ''
         else btrim(substring(btrim(name) from position(' ' in btrim(name)) + 1))
       end
 where kind = 'person'
   and btrim(name) <> ''
   and coalesce(btrim(first_name), '') = ''
   and coalesce(btrim(last_name), '') = '';
