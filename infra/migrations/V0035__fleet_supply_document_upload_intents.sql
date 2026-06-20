-- V0035 — Durable storage for fleet supply document pre-signed upload intents.
--
-- Fixes the SUP-BE-003 review finding where confirm relied on per-process
-- memory and rejected still-valid uploads after a restart or pod handoff.

CREATE TABLE IF NOT EXISTS fleet.supply_document_upload_intents (
  object_key text PRIMARY KEY,
  submission_id uuid NOT NULL
    REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,
  fleet_partner_id uuid NOT NULL,
  document_type text NOT NULL,
  original_file_name text NOT NULL,
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supply_document_upload_intents_submission
  ON fleet.supply_document_upload_intents(submission_id, expires_at);
