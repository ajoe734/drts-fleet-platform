-- V0053__s3_driver_sos_urgent_alert_outbox.sql
-- Phase 1 · S-3 · urgent duty-alert outbox for driver SOS correlation.
--
-- Source: Task brief S3-BE-001 acceptance (INT-S3-002).
--
-- Keeps the urgent-alert side effect in the same transactional boundary as the
-- SOS aggregate + correlated incident insert. Exactly one outbox row is queued
-- per sos_event_id; delivery workers can fan out later.

CREATE TABLE IF NOT EXISTS safety.driver_sos_urgent_alert_outbox (
  outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id uuid NOT NULL UNIQUE
    REFERENCES safety.driver_sos_events(sos_event_id) ON DELETE CASCADE,
  incident_id text NOT NULL,
  driver_id text NOT NULL,
  event_no text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL,
  CONSTRAINT driver_sos_urgent_alert_outbox_status_chk CHECK (status IN (
    'pending', 'sending', 'delivered', 'failed'
  ))
);

CREATE INDEX IF NOT EXISTS driver_sos_urgent_alert_outbox_status_idx
  ON safety.driver_sos_urgent_alert_outbox (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS driver_sos_urgent_alert_outbox_driver_idx
  ON safety.driver_sos_urgent_alert_outbox (driver_id, created_at DESC);
