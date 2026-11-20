-- Ce qu'un centre dit de lui dans ses lettres : le nom qui les signe, et
-- l'adresse où une réponse arrive. L'adresse d'envoi reste celle de la
-- plateforme — un domaine d'envoi se vérifie chez le fournisseur, une fois.
alter table centers add column if not exists mail_name text not null default '';
alter table centers add column if not exists reply_to  text not null default '';

-- Chaque lettre sait de quel centre elle part.
alter table outbox add column if not exists center_id text references centers(id);
update outbox set center_id = 'ctr_maroc' where center_id is null;
alter table outbox alter column center_id set default 'ctr_maroc';
alter table outbox alter column center_id set not null;

-- Les lettres types : un texte par centre. Celles d'aujourd'hui sont celles
-- de CEED Maroc ; un nouveau centre part des textes par défaut.
alter table house_letters add column if not exists center_id text references centers(id);
update house_letters set center_id = 'ctr_maroc' where center_id is null;
alter table house_letters alter column center_id set default 'ctr_maroc';
alter table house_letters alter column center_id set not null;
alter table house_letters drop constraint if exists house_letters_pkey;
alter table house_letters add primary key (center_id, key);
