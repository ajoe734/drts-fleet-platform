-- V0018__platform_earnings.sql
-- Read model: per-platform earnings ledger for drivers.
-- Stores gross/fee/subsidy/net in minor currency units for precise aggregation.

CREATE TABLE IF NOT EXISTS ops.phase1_platform_earnings_ledger (
  ledger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  platform_code varchar(100) NOT NULL,
  currency_code varchar(3) NOT NULL DEFAULT 'TWD',
  gross_minor bigint NOT NULL DEFAULT 0,
  fee_minor bigint NOT NULL DEFAULT 0,
  subsidy_minor bigint NOT NULL DEFAULT 0,
  net_minor bigint NOT NULL DEFAULT 0,
  period_date date NOT NULL,
  trip_count integer NOT NULL DEFAULT 0,
  source_type varchar(50) NOT NULL DEFAULT 'settlement',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, platform_code, currency_code, period_date, source_type)
);

-- Index for fast lookup by driver + period
CREATE INDEX IF NOT EXISTS idx_platform_earnings_driver_period
  ON ops.phase1_platform_earnings_ledger (driver_id, period_date DESC);

-- Index for by-platform queries
CREATE INDEX IF NOT EXISTS idx_platform_earnings_platform
  ON ops.phase1_platform_earnings_ledger (platform_code, driver_id, period_date DESC);

COMMENT ON TABLE ops.phase1_platform_earnings_ledger IS
  'Read model: per-platform earnings ledger for drivers (gross/fee/subsidy/net in minor units).';
