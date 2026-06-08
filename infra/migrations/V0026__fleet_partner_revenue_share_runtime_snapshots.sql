-- V0026__fleet_partner_revenue_share_runtime_snapshots.sql
--
-- Runtime snapshot tables for fleet partner management, affiliations,
-- revenue-share rules, and generated monthly fleet statements.

CREATE TABLE IF NOT EXISTS admin.phase1_fleet_partners (
  fleet_partner_id varchar(100) PRIMARY KEY,
  active boolean NOT NULL,
  partnership_type varchar(100) NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_driver_fleet_affiliations (
  affiliation_id varchar(100) PRIMARY KEY,
  fleet_partner_id varchar(100) NOT NULL,
  driver_id varchar(100) NOT NULL,
  affiliation_type varchar(100) NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_fleet_partner_revenue_share_rules (
  rule_id varchar(100) PRIMARY KEY,
  fleet_partner_id varchar(100) NOT NULL,
  applies_to varchar(100) NOT NULL,
  formula varchar(100) NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_fleet_partner_statements (
  statement_id varchar(100) PRIMARY KEY,
  fleet_partner_id varchar(100) NOT NULL,
  period_month varchar(20) NOT NULL,
  payout_status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_fleet_partners_active
  ON admin.phase1_fleet_partners(active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_driver_fleet_affiliations_partner
  ON admin.phase1_driver_fleet_affiliations(fleet_partner_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_driver_fleet_affiliations_driver
  ON admin.phase1_driver_fleet_affiliations(driver_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_fleet_partner_revenue_share_rules_partner
  ON billing.phase1_fleet_partner_revenue_share_rules(fleet_partner_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_fleet_partner_statements_partner
  ON billing.phase1_fleet_partner_statements(fleet_partner_id, period_month DESC);
