CREATE TABLE IF NOT EXISTS core.phase1_tenant_quota_policies (
  tenant_id varchar(100) NOT NULL,
  cost_center_code varchar(100),
  period varchar(50) NOT NULL,
  updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS core.phase1_tenant_quota_ledger (
  ledger_entry_id varchar(150) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  cost_center_code varchar(100),
  period_key varchar(20) NOT NULL,
  dimension varchar(50) NOT NULL,
  entry_type varchar(50) NOT NULL,
  booking_id varchar(100) NOT NULL,
  evaluation_id varchar(150) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS core.phase1_tenant_quota_monthly_snapshots (
  tenant_id varchar(100) NOT NULL,
  cost_center_code varchar(100),
  period varchar(50) NOT NULL,
  period_key varchar(20) NOT NULL,
  refreshed_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_phase1_tenant_quota_policies_tenant_scope
  ON core.phase1_tenant_quota_policies(tenant_id, period)
  WHERE cost_center_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_phase1_tenant_quota_policies_cost_center_scope
  ON core.phase1_tenant_quota_policies(tenant_id, cost_center_code, period)
  WHERE cost_center_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_quota_policies_lookup
  ON core.phase1_tenant_quota_policies(
    tenant_id,
    period,
    cost_center_code,
    updated_at DESC,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_quota_ledger_tenant_period
  ON core.phase1_tenant_quota_ledger(tenant_id, period_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_quota_ledger_booking
  ON core.phase1_tenant_quota_ledger(tenant_id, booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_quota_ledger_scope
  ON core.phase1_tenant_quota_ledger(
    tenant_id,
    cost_center_code,
    period_key,
    created_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_phase1_tenant_quota_snapshots_tenant_scope
  ON core.phase1_tenant_quota_monthly_snapshots(tenant_id, period, period_key)
  WHERE cost_center_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_phase1_tenant_quota_snapshots_cost_center_scope
  ON core.phase1_tenant_quota_monthly_snapshots(
    tenant_id,
    cost_center_code,
    period,
    period_key
  )
  WHERE cost_center_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_quota_snapshots_lookup
  ON core.phase1_tenant_quota_monthly_snapshots(
    tenant_id,
    period,
    period_key,
    cost_center_code,
    refreshed_at DESC
  );
