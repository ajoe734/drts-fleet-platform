-- PAX-OTP-20261009; schema-allocation.json V0110 -> passenger.otps.
-- No target, code, challenge bearer or IP plaintext is retained.
BEGIN;
CREATE TABLE passenger.otps (
  otp_id uuid PRIMARY KEY,
  challenge_hash varchar(64) NOT NULL UNIQUE CHECK (challenge_hash ~ '^[0-9a-f]{64}$'),
  target_hash varchar(64) NOT NULL CHECK (target_hash ~ '^[0-9a-f]{64}$'),
  provider varchar(5) NOT NULL CHECK (provider IN ('phone', 'email')),
  purpose varchar(20) NOT NULL CHECK (purpose IN ('login', 'link', 'verify_contact_phone')),
  code_hash varchar(64) NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  ip_hash varchar(64) NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  drts_passenger_id varchar(100) REFERENCES passenger.accounts(drts_passenger_id),
  session_family uuid,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  resend_after timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at timestamptz,
  invalidated_at timestamptz,
  CHECK (expires_at = created_at + interval '5 minutes'),
  CHECK (resend_after = created_at + interval '60 seconds'),
  CHECK ((purpose = 'login' AND drts_passenger_id IS NULL AND session_family IS NULL)
      OR (purpose <> 'login' AND drts_passenger_id IS NOT NULL AND session_family IS NOT NULL)),
  CHECK (purpose <> 'verify_contact_phone' OR provider = 'phone')
);
CREATE INDEX passenger_otps_target_time_idx ON passenger.otps(target_hash, created_at);
CREATE INDEX passenger_otps_ip_time_idx ON passenger.otps(ip_hash, created_at);
COMMIT;
