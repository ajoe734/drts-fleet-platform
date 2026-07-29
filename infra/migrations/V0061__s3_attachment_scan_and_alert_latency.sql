-- V0061__s3_attachment_scan_and_alert_latency.sql
-- S3-VERIFY-003 / S3-VERIFY-004 repository-owned closure.

ALTER TABLE safety.driver_sos_events
  ADD COLUMN IF NOT EXISTS fleet_report_confirmed_at timestamptz;

UPDATE safety.driver_sos_events
SET fleet_report_confirmed_at = COALESCE(
  fleet_report_confirmed_at,
  server_received_at,
  created_at
)
WHERE fleet_report_confirmed_at IS NULL;

ALTER TABLE safety.driver_sos_events
  ALTER COLUMN fleet_report_confirmed_at SET NOT NULL;

ALTER TABLE safety.driver_sos_urgent_alert_outbox
  ADD COLUMN IF NOT EXISTS fleet_report_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ops_alert_rendered_at timestamptz,
  ADD COLUMN IF NOT EXISTS ops_alert_receipt_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_to_ops_latency_ms bigint;

UPDATE safety.driver_sos_urgent_alert_outbox outbox
SET fleet_report_confirmed_at = event.fleet_report_confirmed_at
FROM safety.driver_sos_events event
WHERE outbox.sos_event_id = event.sos_event_id
  AND outbox.fleet_report_confirmed_at IS NULL;

ALTER TABLE safety.driver_sos_urgent_alert_outbox
  ALTER COLUMN fleet_report_confirmed_at SET NOT NULL,
  ADD CONSTRAINT driver_sos_alert_latency_nonnegative_chk CHECK (
    alert_to_ops_latency_ms IS NULL OR alert_to_ops_latency_ms >= 0
  );

ALTER TABLE safety.driver_sos_attachments
  ADD COLUMN IF NOT EXISTS original_file_name text,
  ADD COLUMN IF NOT EXISTS scanner_provider text,
  ADD COLUMN IF NOT EXISTS scan_reason text,
  ADD COLUMN IF NOT EXISTS scan_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scan_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE safety.driver_sos_attachments
SET original_file_name = COALESCE(original_file_name, object_key)
WHERE original_file_name IS NULL;

ALTER TABLE safety.driver_sos_attachments
  ALTER COLUMN original_file_name SET NOT NULL;

ALTER TABLE safety.driver_sos_attachments
  DROP CONSTRAINT IF EXISTS driver_sos_scan_status_chk;

ALTER TABLE safety.driver_sos_attachments
  ADD CONSTRAINT driver_sos_scan_status_chk CHECK (scan_status IN (
    'pending', 'clean', 'infected', 'error', 'unavailable'
  )),
  ADD CONSTRAINT driver_sos_attachment_file_size_positive_chk CHECK (
    file_size > 0
  ),
  ADD CONSTRAINT driver_sos_attachment_checksum_sha256_chk CHECK (
    checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS driver_sos_attachments_object_key_idx
  ON safety.driver_sos_attachments (object_key);

CREATE TABLE IF NOT EXISTS safety.driver_sos_attachment_upload_intents (
  object_key text PRIMARY KEY,
  sos_event_id uuid NOT NULL
    REFERENCES safety.driver_sos_events(sos_event_id) ON DELETE CASCADE,
  driver_id text NOT NULL,
  attachment_type text NOT NULL,
  original_file_name text NOT NULL,
  content_type text NOT NULL,
  file_size bigint NOT NULL,
  provider_name text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  CONSTRAINT driver_sos_upload_intent_attachment_type_chk CHECK (
    attachment_type IN ('photo', 'audio')
  ),
  CONSTRAINT driver_sos_upload_intent_state_chk CHECK (
    state IN ('active', 'confirmed', 'expired')
  ),
  CONSTRAINT driver_sos_upload_intent_file_size_positive_chk CHECK (
    file_size > 0
  ),
  CONSTRAINT driver_sos_upload_intent_expiry_chk CHECK (
    expires_at > created_at
  )
);

CREATE INDEX IF NOT EXISTS driver_sos_attachment_upload_intents_event_idx
  ON safety.driver_sos_attachment_upload_intents (sos_event_id, state);
