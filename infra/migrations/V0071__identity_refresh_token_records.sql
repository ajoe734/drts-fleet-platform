CREATE TABLE IF NOT EXISTS iam.identity_refresh_tokens (
  token_id varchar(100) PRIMARY KEY,
  family_id varchar(100) NOT NULL REFERENCES iam.identity_refresh_families(family_id) ON DELETE CASCADE,
  session_id varchar(100) NOT NULL REFERENCES iam.identity_sessions(session_id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL UNIQUE,
  sequence_number integer NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_identity_refresh_tokens_status CHECK (
    status IN ('active', 'consumed', 'revoked', 'expired', 'compromised')
  )
);

CREATE INDEX IF NOT EXISTS idx_identity_refresh_tokens_family
  ON iam.identity_refresh_tokens(family_id, status, sequence_number DESC);

CREATE INDEX IF NOT EXISTS idx_identity_refresh_tokens_session
  ON iam.identity_refresh_tokens(session_id, status);

CREATE INDEX IF NOT EXISTS idx_identity_refresh_tokens_hash
  ON iam.identity_refresh_tokens(token_hash);
