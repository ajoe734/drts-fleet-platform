CREATE TABLE IF NOT EXISTS admin.phase1_partner_channel_entries (
  entry_slug varchar(150) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  program_id varchar(100) NOT NULL,
  bank_code varchar(100),
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_partner_eligibility_verifications (
  eligibility_verification_id varchar(150) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  program_id varchar(100) NOT NULL,
  entry_slug varchar(150) NOT NULL,
  verification_status varchar(50) NOT NULL,
  verified_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_channel_entries_tenant
  ON admin.phase1_partner_channel_entries(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_channel_entries_partner
  ON admin.phase1_partner_channel_entries(partner_id, program_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_eligibility_verifications_entry
  ON admin.phase1_partner_eligibility_verifications(entry_slug, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_eligibility_verifications_tenant
  ON admin.phase1_partner_eligibility_verifications(tenant_id, verified_at DESC);
