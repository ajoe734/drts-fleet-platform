-- V0011__driver_ops_instruction_storage.sql

CREATE TABLE IF NOT EXISTS ops.phase1_driver_ops_instructions (
  instruction_id varchar(80) PRIMARY KEY,
  driver_id varchar(80) NOT NULL,
  task_id varchar(80) NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz,
  acknowledged_at timestamptz,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_phase1_driver_ops_instructions_driver_updated
  ON ops.phase1_driver_ops_instructions(driver_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_driver_ops_instructions_task_updated
  ON ops.phase1_driver_ops_instructions(task_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_driver_ops_instructions_acknowledged
  ON ops.phase1_driver_ops_instructions(acknowledged_at);

CREATE INDEX IF NOT EXISTS idx_phase1_driver_ops_instructions_expires
  ON ops.phase1_driver_ops_instructions(expires_at);
