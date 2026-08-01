CREATE TABLE IF NOT EXISTS iam.sessions (
  session_id varchar(100) PRIMARY KEY,
  family_id varchar(100) NOT NULL UNIQUE,
  realm varchar(50) NOT NULL,
  actor_type varchar(50) NOT NULL,
  actor_id varchar(100) NOT NULL,
  tenant_id varchar(100),
  partner_id varchar(100),
  driver_id varchar(100),
  device_id varchar(255),
  device_label varchar(255),
  session_status varchar(50) NOT NULL,
  revoke_reason varchar(100),
  risk_summary jsonb,
  started_at timestamptz NOT NULL,
  last_refreshed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_sessions_status CHECK (
    session_status IN ('active', 'revoked', 'expired')
  )
);

CREATE TABLE IF NOT EXISTS iam.refresh_families (
  family_id varchar(100) PRIMARY KEY REFERENCES iam.sessions(family_id) ON DELETE CASCADE,
  session_id varchar(100) NOT NULL UNIQUE REFERENCES iam.sessions(session_id) ON DELETE CASCADE,
  family_type varchar(50) NOT NULL,
  family_status varchar(50) NOT NULL,
  current_token_id varchar(100),
  previous_token_id varchar(100),
  absolute_expires_at timestamptz NOT NULL,
  last_rotated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason varchar(100),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_refresh_family_type CHECK (
    family_type IN ('driver_device')
  ),
  CONSTRAINT chk_refresh_family_status CHECK (
    family_status IN ('active', 'revoked', 'expired')
  )
);

CREATE TABLE IF NOT EXISTS iam.refresh_tokens (
  refresh_token_id varchar(100) PRIMARY KEY,
  family_id varchar(100) NOT NULL REFERENCES iam.refresh_families(family_id) ON DELETE CASCADE,
  session_id varchar(100) NOT NULL REFERENCES iam.sessions(session_id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL UNIQUE,
  device_id varchar(255),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

ALTER TABLE iam.refresh_families
  DROP CONSTRAINT IF EXISTS fk_refresh_family_current_token;

ALTER TABLE iam.refresh_families
  ADD CONSTRAINT fk_refresh_family_current_token
  FOREIGN KEY (current_token_id) REFERENCES iam.refresh_tokens(refresh_token_id);

ALTER TABLE iam.refresh_families
  DROP CONSTRAINT IF EXISTS fk_refresh_family_previous_token;

ALTER TABLE iam.refresh_families
  ADD CONSTRAINT fk_refresh_family_previous_token
  FOREIGN KEY (previous_token_id) REFERENCES iam.refresh_tokens(refresh_token_id);

CREATE INDEX IF NOT EXISTS idx_sessions_driver_device_active
  ON iam.sessions(driver_id, device_id, session_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_actor_active
  ON iam.sessions(actor_id, realm, session_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_families_status
  ON iam.refresh_families(family_status, absolute_expires_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_active
  ON iam.refresh_tokens(family_id, revoked_at, consumed_at, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_device
  ON iam.refresh_tokens(device_id, issued_at DESC);
