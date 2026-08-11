CREATE TABLE IF NOT EXISTS admin.consumed_oidc_states (
  state varchar(255) PRIMARY KEY,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consumed_oidc_states_expires_at
  ON admin.consumed_oidc_states (expires_at);
