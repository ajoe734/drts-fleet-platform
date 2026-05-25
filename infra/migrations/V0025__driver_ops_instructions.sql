-- V0025__driver_ops_instructions.sql
--
-- UI-BE-008: persist ops-issued driver instructions so the driver inbox and
-- acknowledgement flow survive process restarts and can enforce expiresAt.

CREATE TABLE IF NOT EXISTS ops.phase1_driver_ops_instructions (
  instruction_id   varchar(100) PRIMARY KEY,
  driver_id        varchar(100) NOT NULL,
  task_id          varchar(100) NOT NULL,
  issued_at        timestamptz NOT NULL,
  expires_at       timestamptz,
  acknowledged_at  timestamptz,
  updated_at       timestamptz NOT NULL,
  record           jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_ops_instructions_driver
  ON ops.phase1_driver_ops_instructions(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_ops_instructions_task
  ON ops.phase1_driver_ops_instructions(task_id);

CREATE INDEX IF NOT EXISTS idx_driver_ops_instructions_updated_at
  ON ops.phase1_driver_ops_instructions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_ops_instructions_expires_at
  ON ops.phase1_driver_ops_instructions(expires_at)
  WHERE expires_at IS NOT NULL;
