-- Quand la lettre est réellement arrivée.
--
-- `sent` disait seulement « le fournisseur l'a prise » — ce qui est vrai d'une
-- lettre encore en vol, et tout aussi vrai d'une lettre qu'un serveur refusera
-- dans dix secondes. Les deux questions d'une journée de relance sont « est-ce
-- qu'on l'a prévenue » et « est-ce que c'est arrivé », et il n'y avait qu'une
-- colonne pour les deux.
--
-- Séparé de `state` plutôt qu'ajouté dedans : une lettre remise *puis* signalée
-- en plainte est les deux à la fois, et un état unique obligerait à choisir
-- lequel oublier.
alter table outbox add column if not exists delivered_at timestamptz;

-- Ce qu'on demande ensuite est « lesquelles ne sont pas arrivées », donc
-- l'index porte sur l'absence.
create index if not exists outbox_undelivered_idx
  on outbox (block_id) where delivered_at is null and state = 'sent';
