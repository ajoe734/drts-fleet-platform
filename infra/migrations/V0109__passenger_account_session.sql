-- PAX-ACCOUNT-SESSION-20261009. Independent first-party accounts; no tenant/partner merge.
BEGIN;
CREATE SCHEMA IF NOT EXISTS passenger;

CREATE TABLE passenger.accounts (
  drts_passenger_id varchar(100) PRIMARY KEY,
  display_name varchar(100),
  contact_phone varchar(32),
  contact_phone_verified boolean NOT NULL DEFAULT false,
  verified_phone varchar(32),
  verified_email varchar(320),
  terms_version varchar(100),
  privacy_version varchar(100),
  fee_acknowledgement_version varchar(100),
  contact_consent boolean NOT NULL DEFAULT false,
  status varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
  CHECK (NOT contact_phone_verified OR contact_phone IS NOT NULL)
);
-- Email/phone on the account are attributes, never unique identity lookup keys.
CREATE TABLE passenger.logins (
  identity_id uuid PRIMARY KEY,
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  provider varchar(10) NOT NULL CHECK (provider IN ('phone', 'email', 'google', 'facebook', 'line')),
  subject varchar(512) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);
CREATE INDEX passenger_logins_account_idx ON passenger.logins(drts_passenger_id);

-- Keep consumed generations until expiry/revocation so replay can revoke the entire family.
CREATE TABLE passenger.sessions (
  session_id uuid PRIMARY KEY,
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  refresh_token_family uuid NOT NULL,
  refresh_token_hash varchar(64) NOT NULL UNIQUE CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
  device_ua varchar(512),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revocation_reason varchar(32),
  CHECK (expires_at > created_at),
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
);
CREATE INDEX passenger_sessions_account_idx ON passenger.sessions(drts_passenger_id);
CREATE INDEX passenger_sessions_family_idx ON passenger.sessions(refresh_token_family);
CREATE UNIQUE INDEX passenger_sessions_live_family_uq
  ON passenger.sessions(refresh_token_family) WHERE consumed_at IS NULL AND revoked_at IS NULL;
COMMIT;
