-- V0138__portal_password_login_credentials.sql
-- PWD-LOGIN-001: schema baseline for the portal password login decision
-- (SD-DP-20261113-001 / docs/02-architecture/portal-password-login-20261113/01_system_sa_sd.md §2).
-- Password/TOTP credentials are kept separate from iam.identity_principals
-- (issuer, subject) so a Google-bound principal and a password credential
-- never contend for the same unique constraint; see SA/SD §1.

CREATE TABLE IF NOT EXISTS iam.identity_password_credentials (
  principal_id varchar(100) PRIMARY KEY REFERENCES iam.identity_principals(principal_id),
  password_hash text NOT NULL,
  password_algo varchar(20) NOT NULL DEFAULT 'argon2id',
  pepper_version varchar(20) NOT NULL,
  must_change_at timestamptz,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

DROP TRIGGER IF EXISTS trg_touch_identity_password_credentials
  ON iam.identity_password_credentials;
CREATE TRIGGER trg_touch_identity_password_credentials
BEFORE UPDATE ON iam.identity_password_credentials
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

CREATE TABLE IF NOT EXISTS iam.identity_totp_credentials (
  principal_id varchar(100) PRIMARY KEY REFERENCES iam.identity_principals(principal_id),
  secret_ciphertext bytea NOT NULL,
  secret_key_version varchar(20) NOT NULL,
  confirmed_at timestamptz,
  last_used_step bigint,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

DROP TRIGGER IF EXISTS trg_touch_identity_totp_credentials
  ON iam.identity_totp_credentials;
CREATE TRIGGER trg_touch_identity_totp_credentials
BEFORE UPDATE ON iam.identity_totp_credentials
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

CREATE TABLE IF NOT EXISTS iam.identity_totp_recovery_codes (
  recovery_code_id varchar(100) PRIMARY KEY,
  principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_totp_recovery_codes_principal
  ON iam.identity_totp_recovery_codes (principal_id);

CREATE TABLE IF NOT EXISTS iam.identity_password_reset_tokens (
  token_hash text PRIMARY KEY,
  principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_password_reset_tokens_principal
  ON iam.identity_password_reset_tokens (principal_id);
