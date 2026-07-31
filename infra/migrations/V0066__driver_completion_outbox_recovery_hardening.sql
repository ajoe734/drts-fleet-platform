-- V0066__driver_completion_outbox_recovery_hardening.sql
-- Phase 1 · harden driver-completion outbox invariants and recovery scans.
--
-- V0065 introduced task-scoped claims, but crash recovery now scans globally
-- for any recoverable task. Add invariants so lease/delivery state stays
-- internally consistent and add a recovery-oriented partial index for the
-- global poller.

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_delivery_state_chk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_delivery_state_chk CHECK (
    (status = 'delivered' AND delivered_at IS NOT NULL)
    OR (status <> 'delivered' AND delivered_at IS NULL)
  );

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_processing_lease_chk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_processing_lease_chk CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND leased_until IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND leased_until IS NULL)
  );

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_attempt_count_chk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_attempt_count_chk CHECK (
    attempt_count >= 0
  );

CREATE INDEX IF NOT EXISTS driver_completion_outbox_recovery_idx
  ON ops.driver_completion_outbox (
    status,
    next_attempt_at,
    created_at,
    task_id
  )
  WHERE delivered_at IS NULL
    AND status IN ('pending', 'processing');
