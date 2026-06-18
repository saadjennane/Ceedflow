-- Multi-recipient templates: distinguish application-facing vs juror-facing templates.
-- Idempotent: safe to re-run.

-- 1) New enum for who the template is addressed to
DO $$ BEGIN
  CREATE TYPE email_template_recipient_type AS ENUM ('application', 'juror');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Add recipient_type to email_templates (default 'application' so existing rows are correct)
DO $$ BEGIN
  ALTER TABLE email_templates ADD COLUMN recipient_type email_template_recipient_type NOT NULL DEFAULT 'application';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 3) Add recipient_type to email_template_sends for clean logging
DO $$ BEGIN
  ALTER TABLE email_template_sends ADD COLUMN recipient_type email_template_recipient_type NOT NULL DEFAULT 'application';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 4) Add juror_id to email_template_sends so we can track sends to jurors
DO $$ BEGIN
  ALTER TABLE email_template_sends ADD COLUMN juror_id UUID REFERENCES jurors(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 5) Seed two juror manual templates
INSERT INTO email_templates (key, name, description, trigger_event, recipient_type, is_internal, enabled, available_variables, subject_fr, body_fr, subject_en, body_en) VALUES
(
  'juror_invitation',
  'Invitation à un jury',
  'À envoyer manuellement pour inviter une personne à rejoindre un comité jury.',
  'manual', 'juror', false, true,
  ARRAY['juror_first_name', 'juror_name', 'juror_role'],
  'Invitation – Comité de sélection The Builders by CEED',
  'Bonjour {{juror_first_name}},

Nous serions ravis de vous compter parmi les membres du jury de notre prochain comité de sélection pour le programme **The Builders by CEED**.

Votre expertise serait précieuse pour évaluer les dossiers des startups candidates.

Nous reviendrons vers vous avec les détails du calendrier et l''accès à la plateforme de notation.

Au plaisir d''échanger,
L''équipe CEED Maroc',
  'Invitation – Selection Committee, The Builders by CEED',
  'Hello {{juror_first_name}},

We would be glad to have you join the jury for our upcoming selection committee for **The Builders by CEED**.

Your expertise would be invaluable in evaluating the candidate startups.

We will get back to you shortly with the calendar and access to the rating platform.

Looking forward,
The CEED Morocco team'
),
(
  'juror_reminder',
  'Rappel jury (notation)',
  'À envoyer manuellement pour rappeler à un jury de finaliser ses notations.',
  'manual', 'juror', false, true,
  ARRAY['juror_first_name'],
  'Rappel – Notation en cours',
  'Bonjour {{juror_first_name}},

Petit rappel : il vous reste quelques dossiers à évaluer sur la plateforme avant la clôture du comité.

Vous pouvez accéder à votre espace de notation via le lien personnel que vous avez reçu.

Merci pour votre engagement,
L''équipe CEED Maroc',
  'Reminder – Pending ratings',
  'Hello {{juror_first_name}},

A quick reminder: you have a few applications left to evaluate on the platform before the committee deadline.

You can access your rating page through the personal link you received.

Thanks for your commitment,
The CEED Morocco team'
)
ON CONFLICT (key) DO NOTHING;
