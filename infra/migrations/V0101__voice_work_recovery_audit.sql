-- V0101__voice_work_recovery_audit.sql
-- SR-LAUNCH-SCHEMA-20260913: Append-only voice attempt/repair audit attached to
-- existing voice.work_item for controlled ops repair of failed background jobs.
--
-- Allocation authority: docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (SR-LAUNCH-SCHEMA-20260913, V0101 entry); implements consensus-packet.md §B7.
--
-- Invariants:
-- 1. `voice.work_item` remains the sole scheduling authority. This migration creates
--    no secondary work queue, credential master, or delivery scheduler.
-- 2. Failed work items are repaired in-place on the existing voice.work_item row
--    via an audited transaction checking expected_lease_epoch and previous_status='failed'.
-- 3. Request-level idempotency: UNIQUE (work_id, request_id) prevents concurrent or duplicate
--    ops repair triggers for the same incident request.
-- 4. Append-only history: both repair authorizations and execution attempts are protected
--    by voice._make_append_only triggers; no UPDATE or DELETE is permitted.
-- 5. Existing historical work items only contain aggregate attempt count and last_error;
--    repair records capture these observable facts without fabricating historical timestamps.

CREATE TABLE IF NOT EXISTS voice.phase1_work_item_repair_audits (
  repair_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES voice.work_item (work_id),
  request_id varchar(255) NOT NULL,
  actor_id varchar(100) NOT NULL,
  reason text NOT NULL,
  expected_lease_epoch integer NOT NULL,
  previous_status varchar(20) NOT NULL,
  previous_attempt_count integer NOT NULL,
  previous_last_error text,
  allocated_max_attempts integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_phase1_work_item_repair_dedupe UNIQUE (work_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_phase1_work_item_repair_work_id
  ON voice.phase1_work_item_repair_audits (work_id, created_at DESC);

SELECT voice._make_append_only('voice.phase1_work_item_repair_audits');

CREATE TABLE IF NOT EXISTS voice.phase1_work_item_attempt_audits (
  attempt_audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES voice.work_item (work_id),
  attempt_no integer NOT NULL,
  lease_epoch integer NOT NULL,
  outcome varchar(20) NOT NULL CHECK (
    outcome IN ('started', 'completed', 'failed', 'fenced', 'repaired')
  ),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_phase1_work_item_attempt_lease UNIQUE (work_id, lease_epoch, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_phase1_work_item_attempt_work_id
  ON voice.phase1_work_item_attempt_audits (work_id, created_at DESC);

SELECT voice._make_append_only('voice.phase1_work_item_attempt_audits');
