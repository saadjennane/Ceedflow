-- Le lien de la réunion, à côté du lieu.
--
-- Un rendez-vous a lieu quelque part, ou en visio — souvent les deux
-- possibles. Le lieu restait un champ de texte où l'on collait le lien ; il
-- a maintenant le sien, repris dans les lettres et dans l'agenda. Une
-- journée en donne un par défaut à ses rendez-vous.
alter table one_to_one_meetings add column if not exists meeting_link text not null default '';
alter table one_to_one_days add column if not exists meeting_link text not null default '';
