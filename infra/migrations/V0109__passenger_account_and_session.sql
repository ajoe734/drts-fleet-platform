CREATE SCHEMA IF NOT EXISTS passenger;

CREATE TABLE passenger.passenger_accounts (
  drts_passenger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name varchar(255),
  contact_phone varchar(255),
  contact_phone_verified boolean DEFAULT false,
  contact_email varchar(255),
  contact_email_verified boolean DEFAULT false,
  terms_ack_version varchar(50),
  e19a_ack_version varchar(50),
  privacy_version varchar(50),
  contact_consent boolean,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE passenger.passenger_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drts_passenger_id uuid NOT NULL REFERENCES passenger.passenger_accounts(drts_passenger_id),
  provider varchar(50) NOT NULL,
  subject varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, subject)
);

CREATE TABLE passenger.passenger_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drts_passenger_id uuid NOT NULL REFERENCES passenger.passenger_accounts(drts_passenger_id),
  iam_session_id varchar(128),
  family_id uuid NOT NULL,
  refresh_token_hash varchar(255) NOT NULL,
  purpose varchar(50) NOT NULL,
  is_revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_passenger_sessions_refresh_token_hash ON passenger.passenger_sessions(refresh_token_hash);
CREATE INDEX idx_passenger_sessions_family_id ON passenger.passenger_sessions(family_id);
