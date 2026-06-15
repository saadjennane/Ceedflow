-- Defensive idempotent variant of 013. Run this if 013 failed midway.
-- Safe to re-run any number of times.

-- 1) Enum (CREATE TYPE doesn't support IF NOT EXISTS before PG 16, so wrap)
DO $$ BEGIN
  CREATE TYPE email_template_trigger AS ENUM ('on_application_submitted', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tables
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event email_template_trigger NOT NULL DEFAULT 'manual',
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  subject_fr TEXT NOT NULL,
  body_fr TEXT NOT NULL,
  subject_en TEXT NOT NULL,
  body_en TEXT NOT NULL,
  available_variables TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS email_template_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  trigger_event email_template_trigger NOT NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  external_startup_id UUID REFERENCES external_startups(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  language TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_template_sends_template ON email_template_sends(template_key);
CREATE INDEX IF NOT EXISTS idx_email_template_sends_application ON email_template_sends(application_id);
CREATE INDEX IF NOT EXISTS idx_email_template_sends_sent_at ON email_template_sends(sent_at DESC);

-- 3) RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_sends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage email_templates"
    ON email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated manage email_template_sends"
    ON email_template_sends FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4) Seeds (ON CONFLICT DO NOTHING uses the UNIQUE key constraint)
INSERT INTO email_templates (key, name, description, trigger_event, is_internal, enabled, available_variables, subject_fr, body_fr, subject_en, body_en) VALUES
(
  'application_received',
  'Confirmation de candidature',
  'Envoyé automatiquement au candidat dès la soumission du formulaire.',
  'on_application_submitted', false, true,
  ARRAY['founder_first_name', 'startup_name'],
  'Candidature reçue – The Bridge by CEED Maroc',
  'Bonjour {{founder_first_name}},

Nous avons bien reçu la candidature de **{{startup_name}}** au programme The Bridge by CEED Maroc.

Votre dossier sera étudié par notre équipe. Nous reviendrons vers vous si votre projet est retenu pour la prochaine étape.

Merci de votre intérêt,
L''équipe CEED Maroc',
  'Application received – The Bridge by CEED Morocco',
  'Hello {{founder_first_name}},

We have received the application of **{{startup_name}}** to The Bridge by CEED Morocco.

Your application will be reviewed by our team. We will get back to you if your project is selected for the next stage.

Thank you for your interest,
The CEED Morocco team'
),
(
  'admin_notification',
  'Notification interne (nouvelle candidature)',
  'Envoyé automatiquement aux administrateurs à chaque nouvelle candidature.',
  'on_application_submitted', true, true,
  ARRAY['startup_name', 'stage', 'sector', 'review_url'],
  'Nouvelle candidature : {{startup_name}}',
  '**Nouvelle candidature reçue**

Startup : **{{startup_name}}**
Stade : {{stage}}
Secteur : {{sector}}

[Examiner la candidature]({{review_url}})',
  'New application: {{startup_name}}',
  '**New application received**

Startup: **{{startup_name}}**
Stage: {{stage}}
Sector: {{sector}}

[Review the application]({{review_url}})'
),
(
  'shortlisted',
  'Présélection',
  'À envoyer manuellement à un candidat présélectionné.',
  'manual', false, true,
  ARRAY['founder_first_name', 'startup_name'],
  'Bonne nouvelle : {{startup_name}} est présélectionnée',
  'Bonjour {{founder_first_name}},

Félicitations ! La candidature de **{{startup_name}}** a été **présélectionnée** par notre comité.

Nous reviendrons très prochainement vers vous avec les prochaines étapes.

L''équipe CEED Maroc',
  'Great news: {{startup_name}} has been shortlisted',
  'Hello {{founder_first_name}},

Congratulations! The application of **{{startup_name}}** has been **shortlisted** by our committee.

We will get back to you shortly with the next steps.

The CEED Morocco team'
),
(
  'rejected',
  'Refus',
  'À envoyer manuellement à un candidat non retenu.',
  'manual', false, true,
  ARRAY['founder_first_name', 'startup_name'],
  'Votre candidature à The Bridge by CEED Maroc',
  'Bonjour {{founder_first_name}},

Nous vous remercions d''avoir soumis la candidature de **{{startup_name}}**.

Après étude attentive, votre projet n''a pas été retenu pour cette édition. Le niveau des candidatures était très élevé et ce choix a été difficile.

Nous vous encourageons à recandidater lors de nos prochains appels à projets et vous souhaitons beaucoup de succès.

L''équipe CEED Maroc',
  'Your application to The Bridge by CEED Morocco',
  'Hello {{founder_first_name}},

Thank you for submitting the application of **{{startup_name}}**.

After careful review, your project was not selected for this edition. The level of applications was very high and this was a difficult choice.

We encourage you to apply again to our future calls for projects and wish you great success.

The CEED Morocco team'
),
(
  'interview_invite',
  'Invitation entretien / pitch',
  'À envoyer manuellement pour convier un candidat à un entretien ou pitch.',
  'manual', false, true,
  ARRAY['founder_first_name', 'startup_name'],
  'Invitation à un entretien – The Bridge by CEED Maroc',
  'Bonjour {{founder_first_name}},

Suite à l''étude de la candidature de **{{startup_name}}**, nous serions ravis de vous rencontrer pour un entretien.

Merci de nous indiquer vos disponibilités en répondant à cet email, et nous conviendrons ensemble d''un créneau.

À très bientôt,
L''équipe CEED Maroc',
  'Interview invitation – The Bridge by CEED Morocco',
  'Hello {{founder_first_name}},

Following the review of **{{startup_name}}**''s application, we would be glad to meet you for an interview.

Please let us know your availability by replying to this email, and we will agree on a slot together.

Talk soon,
The CEED Morocco team'
),
(
  'missing_info',
  'Relance / informations manquantes',
  'À envoyer manuellement pour demander de compléter un dossier.',
  'manual', false, true,
  ARRAY['founder_first_name', 'startup_name'],
  'Complément d''information requis – {{startup_name}}',
  'Bonjour {{founder_first_name}},

Merci pour la candidature de **{{startup_name}}**.

Afin de finaliser l''étude de votre dossier, certaines informations nous manquent. Pourriez-vous compléter votre candidature en répondant à cet email ?

Merci d''avance,
L''équipe CEED Maroc',
  'Additional information required – {{startup_name}}',
  'Hello {{founder_first_name}},

Thank you for the application of **{{startup_name}}**.

To finalize the review of your application, some information is missing. Could you please complete your application by replying to this email?

Thank you in advance,
The CEED Morocco team'
)
ON CONFLICT (key) DO NOTHING;
