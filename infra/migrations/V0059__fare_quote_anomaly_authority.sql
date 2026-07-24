CREATE TABLE IF NOT EXISTS ops.fare_quote_anomalies (
  quote_snapshot_id VARCHAR(128) PRIMARY KEY,
  order_id VARCHAR(128) NOT NULL,
  reason_code VARCHAR(64) NOT NULL CHECK (
    reason_code IN (
      'quote_provider_unavailable',
      'quote_out_of_range',
      'route_unresolved',
      'fare_policy_missing',
      'calculation_mismatch'
    )
  ),
  occurred_at TIMESTAMPTZ NOT NULL,
  recovery_pending BOOLEAN NOT NULL DEFAULT FALSE,
  last_recovery_requested_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fare_quote_anomalies_open_occurred
  ON ops.fare_quote_anomalies (occurred_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fare_quote_anomalies_open_reason
  ON ops.fare_quote_anomalies (reason_code, occurred_at DESC)
  WHERE resolved_at IS NULL;
