CREATE TABLE IF NOT EXISTS iam.identity_sessions (
  session_id varchar(100) PRIMARY KEY,
  source_ref varchar(255) UNIQUE,
  principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  membership_id varchar(100) REFERENCES iam.identity_memberships(membership_id),
  realm varchar(50) NOT NULL,
  status varchar(50) NOT NULL,
  auth_time timestamptz NOT NULL,
  auth_methods text[] NOT NULL DEFAULT '{}',
  token_version integer NOT NULL DEFAULT 1,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_principal_id varchar(100) REFERENCES iam.identity_principals(principal_id),
  revoke_reason varchar(255),
  device_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_identity_sessions_status CHECK (
    status IN ('active', 'revoked', 'expired', 'compromised')
  )
);

CREATE TABLE IF NOT EXISTS iam.identity_refresh_families (
  family_id varchar(100) PRIMARY KEY,
  source_ref varchar(255) UNIQUE,
  session_id varchar(100) NOT NULL REFERENCES iam.identity_sessions(session_id) ON DELETE CASCADE,
  current_token_hash varchar(128) NOT NULL UNIQUE,
  counter integer NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL,
  expires_at timestamptz NOT NULL,
  compromised_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_identity_refresh_families_status CHECK (
    status IN ('active', 'revoked', 'expired', 'compromised')
  )
);

CREATE INDEX IF NOT EXISTS idx_identity_sessions_principal
  ON iam.identity_sessions(principal_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_sessions_membership
  ON iam.identity_sessions(membership_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_sessions_expiry
  ON iam.identity_sessions(absolute_expires_at, status);

CREATE INDEX IF NOT EXISTS idx_identity_refresh_families_session
  ON iam.identity_refresh_families(session_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_refresh_families_token_hash
  ON iam.identity_refresh_families(current_token_hash);

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

