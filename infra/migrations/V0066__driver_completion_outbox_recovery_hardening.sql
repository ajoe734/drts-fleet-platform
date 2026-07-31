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
    OR (status IN ('pending', 'processing', 'dead_letter') AND delivered_at IS NULL)
  );

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_processing_lease_chk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_processing_lease_chk CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND leased_until IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND leased_until IS NULL)
  );

ALTER TABLE ops.phase1_driver_tasks
  ADD CONSTRAINT phase1_driver_tasks_task_order_unique UNIQUE (task_id, order_id);

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_task_order_fk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_task_order_fk
  FOREIGN KEY (task_id, order_id)
  REFERENCES ops.phase1_driver_tasks(task_id, order_id)
  ON DELETE CASCADE;

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_payload_object_chk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_payload_object_chk CHECK (
    jsonb_typeof(payload) = 'object'
  );

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_attempt_count_chk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_attempt_count_chk CHECK (
    attempt_count >= 0
  );

ALTER TABLE ops.driver_completion_outbox
  DROP CONSTRAINT IF EXISTS driver_completion_outbox_dead_letter_state_chk;

ALTER TABLE ops.driver_completion_outbox
  ADD CONSTRAINT driver_completion_outbox_dead_letter_state_chk CHECK (
    status <> 'dead_letter'
    OR (attempt_count > 0 AND last_error IS NOT NULL)
  );

DROP INDEX IF EXISTS driver_completion_outbox_recovery_idx;

CREATE INDEX IF NOT EXISTS driver_completion_outbox_recovery_idx
  ON ops.driver_completion_outbox (
    next_attempt_at,
    created_at,
    task_id,
    outbox_id
  )
  WHERE delivered_at IS NULL
    AND status IN ('pending', 'processing');
