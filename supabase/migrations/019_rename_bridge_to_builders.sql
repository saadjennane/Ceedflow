-- Replace any leftover "The Bridge" branding by "The Builders" in seeded email templates.
-- Idempotent: safe to re-run (no-op on already-updated rows).

UPDATE email_templates
SET
  subject_fr = replace(subject_fr, 'The Bridge', 'The Builders'),
  body_fr    = replace(body_fr,    'The Bridge', 'The Builders'),
  subject_en = replace(subject_en, 'The Bridge', 'The Builders'),
  body_en    = replace(body_en,    'The Bridge', 'The Builders'),
  description = COALESCE(replace(description, 'The Bridge', 'The Builders'), description)
WHERE
  subject_fr  LIKE '%The Bridge%' OR
  body_fr     LIKE '%The Bridge%' OR
  subject_en  LIKE '%The Bridge%' OR
  body_en     LIKE '%The Bridge%' OR
  description LIKE '%The Bridge%';
