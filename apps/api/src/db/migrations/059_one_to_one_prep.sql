-- La préparation d'une séance, par la startup.
--
-- Avant le rendez-vous, la startup répond à quelques questions — les sujets
-- à aborder, ses avancées, ses blocages. L'interlocuteur la lit, la corrige
-- ou la complète, et elle fait partie du compte rendu final, à côté du
-- compte rendu privé de l'interlocuteur. La startup la relit toujours,
-- corrigée, et ne la modifie plus une fois verrouillée.
alter table one_to_one_meetings add column if not exists prep jsonb not null default '{}'::jsonb;
alter table one_to_one_meetings add column if not exists prep_submitted_at timestamptz;
alter table one_to_one_meetings add column if not exists prep_edited_at timestamptz;
alter table one_to_one_meetings add column if not exists prep_edited_by_name text not null default '';
