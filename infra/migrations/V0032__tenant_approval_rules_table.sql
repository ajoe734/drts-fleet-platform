-- V0032 — Create core.phase1_tenant_approval_rules
--
-- The tenant-partner repository reads from and writes to
-- core.phase1_tenant_approval_rules (loadState SELECT + persistChanges INSERT),
-- and the tenant booking approval evaluator resolves approvers from these rules.
-- However no migration ever created the table, so on every API start the repo
-- logged "relation core.phase1_tenant_approval_rules does not exist" and skipped
-- loading approval rules. Without rules the evaluator cannot resolve approvers,
-- so bookings that require approval reach `awaiting_approval` but never get a
-- usable approval request created (the queue stays empty) — stranding them.
--
-- This creates the table to match the columns the repository INSERT expects.
CREATE TABLE IF NOT EXISTS core.phase1_tenant_approval_rules (
  rule_id varchar(150) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_approval_rules_tenant
  ON core.phase1_tenant_approval_rules (tenant_id, active_flag);
