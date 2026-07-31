-- V0052__s3_driver_sos.sql
-- Phase 1 · S-3 · dedicated Driver SOS domain foundation anchors.
--
-- Source: docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/
--         03_gap_closure_implementation_plan.md  (Wave S3-1)
--
-- Creates the new `safety` schema and the SOS aggregate/timeline/attachment
-- tables. The SOS create transaction (S3-INC-001) correlates each SOS to
-- exactly one row in the existing generic incident domain via incident_id —
-- this schema does NOT replace the incident module.
--
-- Idempotent / deploy-safe for long-lived dev databases.

CREATE SCHEMA IF NOT EXISTS safety;

-- ---------------------------------------------------------------------------
-- SOS aggregate (§16.1 / §26.5). Unique (driver_id, client_event_id) makes the
-- offline outbox replay idempotent; event_no is the human-facing case number.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safety.driver_sos_events (
  sos_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL,
  event_no text NOT NULL UNIQUE,
  incident_id text NULL,
  driver_id text NOT NULL,
  vehicle_id text NULL,
  plate_no text NULL,
  order_id text NULL,
  task_id text NULL,
  status text NOT NULL DEFAULT 'submitted',
  event_type text NULL,
  severity text NULL,
  description text NULL,
  location_snapshot jsonb NULL,
  original_triggered_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  offline_at_trigger boolean NOT NULL DEFAULT false,
  false_alarm_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  duty_ack_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, client_event_id),
  CONSTRAINT driver_sos_status_chk CHECK (status IN (
    'local_triggered', 'queued_offline', 'submitted', 'duty_alerted',
    'acknowledged', 'false_alarm_dismissed', 'investigating',
    'resolved', 'closed'
  )),
  CONSTRAINT driver_sos_event_type_chk CHECK (event_type IS NULL OR event_type IN (
    'traffic_accident', 'security_incident', 'passenger_medical', 'other'
  )),
  CONSTRAINT driver_sos_severity_chk CHECK (severity IS NULL OR severity IN (
    'major', 'normal'
  ))
);

CREATE INDEX IF NOT EXISTS driver_sos_events_status_idx
  ON safety.driver_sos_events (status);
CREATE INDEX IF NOT EXISTS driver_sos_events_driver_idx
  ON safety.driver_sos_events (driver_id);

-- ---------------------------------------------------------------------------
-- SOS timeline (§25). Append-only; occurred_at vs recorded_at both preserved
-- so offline replay keeps the true trigger time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safety.driver_sos_timeline (
  timeline_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id uuid NOT NULL
    REFERENCES safety.driver_sos_events(sos_event_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS driver_sos_timeline_event_idx
  ON safety.driver_sos_timeline (sos_event_id, occurred_at);

-- ---------------------------------------------------------------------------
-- SOS attachments (§21). Pre-signed upload, checksum + malware scan status.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safety.driver_sos_attachments (
  attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id uuid NOT NULL
    REFERENCES safety.driver_sos_events(sos_event_id) ON DELETE CASCADE,
  attachment_type text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  file_size bigint NOT NULL,
  checksum_sha256 text NOT NULL,
  scan_status text NOT NULL DEFAULT 'pending',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_sos_attachment_type_chk CHECK (attachment_type IN (
    'photo', 'audio'
  )),
  CONSTRAINT driver_sos_scan_status_chk CHECK (scan_status IN (
    'pending', 'clean', 'infected', 'error'
  ))
);

CREATE INDEX IF NOT EXISTS driver_sos_attachments_event_idx
  ON safety.driver_sos_attachments (sos_event_id);
