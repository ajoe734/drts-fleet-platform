-- V0033 — Create phase1 persistence tables referenced by repositories but never
-- created by any migration. Their absence makes the corresponding repositories
-- run in in-memory-degraded mode (loadState/persistChanges skip the missing
-- relation), which breaks persistence-dependent cross-surface flows — most
-- importantly tenant cost-centers, whose absence disables ALL tenant-partner
-- persistence and causes enterprise bookings that require approval to roll back
-- (no order persisted, no approval request created -> stranded).
--
-- Columns/PKs mirror each repository's INSERT ... ON CONFLICT.

CREATE SCHEMA IF NOT EXISTS assistant;

CREATE TABLE IF NOT EXISTS core.phase1_tenant_cost_centers (
  tenant_id varchar(100) NOT NULL,
  code varchar(100) NOT NULL,
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS admin.phase1_platform_tenants (
  tenant_id varchar(100) PRIMARY KEY,
  tenant_code varchar(100) NOT NULL,
  tenant_status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_reconciliation_issues (
  issue_id varchar(150) PRIMARY KEY,
  issue_type varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  channel_key varchar(150),
  owner_id varchar(150),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant.user_assistant_sessions (
  conversation_id varchar(150) PRIMARY KEY,
  realm varchar(50) NOT NULL,
  tenant_id varchar(100),
  updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant.assistant_message_records (
  message_id varchar(150) PRIMARY KEY,
  conversation_id varchar(150) NOT NULL,
  realm varchar(50) NOT NULL,
  tenant_id varchar(100),
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_cost_centers_tenant ON core.phase1_tenant_cost_centers (tenant_id, active_flag);
CREATE INDEX IF NOT EXISTS idx_phase1_platform_tenants_code ON admin.phase1_platform_tenants (tenant_code);
CREATE INDEX IF NOT EXISTS idx_phase1_reconciliation_issues_status ON billing.phase1_reconciliation_issues (status, issue_type);
CREATE INDEX IF NOT EXISTS idx_user_assistant_sessions_realm ON assistant.user_assistant_sessions (realm, tenant_id);
CREATE INDEX IF NOT EXISTS idx_assistant_message_records_conv ON assistant.assistant_message_records (conversation_id, created_at);
