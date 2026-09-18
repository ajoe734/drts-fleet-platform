CREATE TABLE IF NOT EXISTS iam.workload_identity_assertions (
  assertion_hash varchar(128) PRIMARY KEY,
  issuer varchar(255) NOT NULL,
  subject varchar(255) NOT NULL,
  exchange_audience varchar(255) NOT NULL,
  token_audience varchar(255) NOT NULL,
  principal_id varchar(100),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workload_identity_assertions_expires_at
  ON iam.workload_identity_assertions(expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_workload_identity_assertions_principal
  ON iam.workload_identity_assertions(principal_id, consumed_at DESC);
