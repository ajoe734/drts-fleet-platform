-- V0025__driver_ops_instructions.sql
--
-- Add storage for driver instructions.

CREATE TABLE IF NOT EXISTS ops.driver_ops_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  instruction_text text NOT NULL,
  expires_at timestamptz NOT NULL,
  is_acknowledged boolean NOT NULL DEFAULT FALSE,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_ops_instructions_driver_id
  ON ops.driver_ops_instructions(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_ops_instructions_expires_at
  ON ops.driver_ops_instructions(expires_at);
