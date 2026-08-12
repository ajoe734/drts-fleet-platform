CREATE TABLE IF NOT EXISTS iam.driver_device_invitations (
  invitation_id varchar(100) PRIMARY KEY,
  driver_id varchar(100) NOT NULL,
  registration_code_hash varchar(128) NOT NULL UNIQUE,
  status varchar(50) NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_driver_device_invitation_status CHECK (
    status IN ('pending', 'used', 'expired', 'revoked')
  )
);

CREATE TABLE IF NOT EXISTS iam.driver_device_bindings (
  binding_id varchar(100) PRIMARY KEY,
  driver_id varchar(100) NOT NULL,
  device_id varchar(255) NOT NULL,
  device_label varchar(255),
  status varchar(50) NOT NULL,
  issued_at timestamptz NOT NULL,
  refreshed_at timestamptz NOT NULL,
  revoked_at timestamptz,
  rebound_from_binding_id varchar(100),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_driver_device_binding_status CHECK (
    status IN ('active', 'revoked')
  )
);

CREATE TABLE IF NOT EXISTS iam.driver_refresh_families (
  family_id varchar(100) PRIMARY KEY,
  binding_id varchar(100) NOT NULL REFERENCES iam.driver_device_bindings(binding_id) ON DELETE CASCADE,
  driver_id varchar(100) NOT NULL,
  current_token_hash varchar(128) NOT NULL UNIQUE,
  previous_token_hashes text[] NOT NULL DEFAULT '{}',
  rotation_counter integer NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  compromised_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_driver_refresh_family_status CHECK (
    status IN ('active', 'revoked', 'compromised', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_driver_device_invitations_driver
  ON iam.driver_device_invitations(driver_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_device_invitations_hash
  ON iam.driver_device_invitations(registration_code_hash);

CREATE INDEX IF NOT EXISTS idx_driver_device_bindings_driver
  ON iam.driver_device_bindings(driver_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_device_bindings_device
  ON iam.driver_device_bindings(device_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_refresh_families_token
  ON iam.driver_refresh_families(current_token_hash);

CREATE INDEX IF NOT EXISTS idx_driver_refresh_families_binding
  ON iam.driver_refresh_families(binding_id, status, expires_at DESC);
