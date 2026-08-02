CREATE TABLE IF NOT EXISTS iam.auth_sessions (
  token_id varchar(100) PRIMARY KEY,
  session_id varchar(100) NOT NULL,
  principal_id varchar(100) REFERENCES iam.identity_principals(principal_id) ON DELETE SET NULL,
  membership_id varchar(100) REFERENCES iam.identity_memberships(membership_id) ON DELETE SET NULL,
  realm varchar(50) NOT NULL,
  actor_type varchar(50) NOT NULL,
  token_version varchar(255) NOT NULL,
  policy_version varchar(255) NOT NULL,
  auth_time bigint NOT NULL,
  auth_methods jsonb NOT NULL,
  assurance_level varchar(50) NOT NULL,
  session_status varchar(50) NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason varchar(255),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_auth_sessions_status CHECK (
    session_status IN ('active', 'revoked', 'compromised')
  )
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_session
  ON iam.auth_sessions(session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_principal
  ON iam.auth_sessions(principal_id, session_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_membership
  ON iam.auth_sessions(membership_id, session_status, updated_at DESC);
