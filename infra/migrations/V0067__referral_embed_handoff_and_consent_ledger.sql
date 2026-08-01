CREATE TABLE IF NOT EXISTS admin.phase1_referral_embed_handoffs (
  handoff_id varchar(100) PRIMARY KEY,
  artifact_hash varchar(128) NOT NULL UNIQUE,
  entry_slug varchar(150) NOT NULL,
  entry_host varchar(255) NOT NULL,
  partner_user_ref varchar(255) NOT NULL,
  drts_passenger_id varchar(100) NOT NULL,
  tenant_id varchar(100),
  partner_id varchar(100),
  partner_program_id varchar(100),
  consent_required boolean NOT NULL,
  consent_bundle_version varchar(100),
  consent_granted_at timestamptz,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_referral_embed_handoffs_entry
  ON admin.phase1_referral_embed_handoffs(entry_slug, entry_host, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_referral_embed_handoffs_passenger
  ON admin.phase1_referral_embed_handoffs(drts_passenger_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS admin.phase1_referral_embed_consent_ledger (
  consent_id varchar(100) PRIMARY KEY,
  handoff_id varchar(100) NOT NULL,
  entry_slug varchar(150) NOT NULL,
  entry_host varchar(255) NOT NULL,
  drts_passenger_id varchar(100) NOT NULL,
  bundle_version varchar(100) NOT NULL,
  granted_scopes jsonb NOT NULL,
  granted_at timestamptz NOT NULL,
  actor_ip varchar(100),
  user_agent varchar(1000),
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT fk_phase1_referral_embed_consent_handoff
    FOREIGN KEY (handoff_id)
    REFERENCES admin.phase1_referral_embed_handoffs(handoff_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_referral_embed_consent_handoff_version
  ON admin.phase1_referral_embed_consent_ledger(handoff_id, bundle_version);

CREATE INDEX IF NOT EXISTS idx_phase1_referral_embed_consent_passenger
  ON admin.phase1_referral_embed_consent_ledger(drts_passenger_id, created_at DESC);
