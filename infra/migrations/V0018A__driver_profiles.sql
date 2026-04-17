-- V0018A__driver_profiles.sql
--
-- GAP-P2S1-004-API follow-up: persist driver self-service profile records.
-- Keep this table separate from ops.phase1_driver_settings because it owns
-- profile/contact/bank/emergency-contact fields rather than app preferences.

CREATE TABLE IF NOT EXISTS ops.phase1_driver_profiles (
  driver_id   varchar(100) PRIMARY KEY,
  updated_at  timestamptz NOT NULL,
  record      jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_updated_at
  ON ops.phase1_driver_profiles(updated_at DESC);
