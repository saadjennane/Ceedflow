-- Fonction et direction, sur une fiche de personne.
--
-- The directory knew what somebody is to CEED — mentor, juror, investor — and
-- nothing about what they are where they work. A jury is convened from this
-- file, and "Directrice de l'innovation, Direction des engagements" is exactly
-- what tells two people called Nadia apart when you are deciding who sits on
-- which panel.
--
-- Two columns rather than one line of free text: they are asked for separately
-- on a form, read separately in a list, and a programme that wants the people
-- of one direction should be able to find them.
alter table records add column if not exists job_title  text not null default '';
alter table records add column if not exists department text not null default '';
