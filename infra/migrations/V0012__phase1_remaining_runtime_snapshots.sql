-- V0012__phase1_remaining_runtime_snapshots.sql
--
-- Contract-aligned runtime snapshot tables for the remaining Wave 7
-- persistence targets. These preserve the exact API-facing record shapes
-- so services can rehydrate state from Postgres without forcing an
-- immediate normalized-schema rewrite for every Phase 1 runtime slice.

CREATE TABLE IF NOT EXISTS reg.phase1_registry_vehicles (
  vehicle_id varchar(100) PRIMARY KEY,
  plate_no varchar(100) NOT NULL UNIQUE,
  operating_area varchar(100) NOT NULL,
  dispatchable_flag boolean NOT NULL,
  insurance_status varchar(50) NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reg.phase1_registry_drivers (
  driver_id varchar(100) PRIMARY KEY,
  full_name varchar(100) NOT NULL,
  work_state varchar(50) NOT NULL,
  licenses_valid boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reg.phase1_registry_supply_pairs (
  pair_id varchar(200) PRIMARY KEY,
  vehicle_id varchar(100) NOT NULL,
  driver_id varchar(100) NOT NULL,
  eta_minutes integer NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_tenant_notification_preferences (
  tenant_id varchar(100) PRIMARY KEY,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_tenant_sla_profiles (
  tenant_id varchar(100) PRIMARY KEY,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_tenant_webhook_endpoints (
  webhook_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_tenant_webhook_deliveries (
  delivery_id varchar(100) PRIMARY KEY,
  webhook_id varchar(100) NOT NULL,
  tenant_id varchar(100) NOT NULL,
  event_type varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_tenant_billing_profiles (
  tenant_id varchar(100) PRIMARY KEY,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_tenant_invoices (
  invoice_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_driver_fee_plans (
  fee_plan_id varchar(100) PRIMARY KEY,
  plan_name varchar(200) NOT NULL,
  version varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  published_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_driver_statements (
  statement_id varchar(100) PRIMARY KEY,
  driver_id varchar(100) NOT NULL,
  period_month varchar(20) NOT NULL,
  payout_status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.phase1_reimbursement_batches (
  batch_id varchar(100) PRIMARY KEY,
  driver_id varchar(100) NOT NULL,
  statement_id varchar(100) NOT NULL,
  period_month varchar(20) NOT NULL,
  status varchar(50) NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_report_jobs (
  job_id varchar(100) PRIMARY KEY,
  job_type varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_filing_packages (
  package_id varchar(100) PRIMARY KEY,
  package_type varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_forwarded_orders (
  mirror_order_id varchar(100) PRIMARY KEY,
  platform_code varchar(100) NOT NULL,
  external_order_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_adapter_health (
  platform_code varchar(100) PRIMARY KEY,
  status varchar(50) NOT NULL,
  last_checked_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_registry_vehicles_status
  ON reg.phase1_registry_vehicles(dispatchable_flag, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_registry_drivers_status
  ON reg.phase1_registry_drivers(work_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_registry_supply_pairs_vehicle
  ON reg.phase1_registry_supply_pairs(vehicle_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_phase1_tenant_webhook_endpoints_tenant
  ON admin.phase1_tenant_webhook_endpoints(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_tenant_webhook_deliveries_webhook
  ON admin.phase1_tenant_webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_tenant_invoices_tenant
  ON billing.phase1_tenant_invoices(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_driver_fee_plans_version
  ON billing.phase1_driver_fee_plans(plan_name, version);
CREATE INDEX IF NOT EXISTS idx_phase1_driver_statements_driver
  ON billing.phase1_driver_statements(driver_id, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_reimbursement_batches_driver
  ON billing.phase1_reimbursement_batches(driver_id, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_report_jobs_status
  ON admin.phase1_report_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_filing_packages_status
  ON admin.phase1_filing_packages(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_forwarded_orders_platform
  ON ops.phase1_forwarded_orders(platform_code, updated_at DESC);
