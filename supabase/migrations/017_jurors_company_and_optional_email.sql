-- Add `company` column to jurors and make `email` optional.
-- The UNIQUE constraint on email stays — PostgreSQL treats NULLs as distinct
-- by default, so multiple jurors without email don't conflict.
-- Idempotent: safe to re-run.

ALTER TABLE jurors ADD COLUMN IF NOT EXISTS company TEXT;

DO $$ BEGIN
  ALTER TABLE jurors ALTER COLUMN email DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
