CREATE TABLE IF NOT EXISTS iam.step_up_nonces (
  nonce varchar(255) PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL,
  actor_id varchar(100),
  action varchar(100),
  target_id varchar(100)
);

CREATE INDEX IF NOT EXISTS idx_step_up_nonces_expires_at
  ON iam.step_up_nonces(expires_at);
