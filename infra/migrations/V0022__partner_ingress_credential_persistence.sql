CREATE TABLE IF NOT EXISTS admin.phase1_partner_ingress_credentials (
  key_id varchar(150) PRIMARY KEY,
  entry_slug varchar(150) NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_ingress_credentials_entry
  ON admin.phase1_partner_ingress_credentials(entry_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_ingress_credentials_active
  ON admin.phase1_partner_ingress_credentials(entry_slug, revoked_at, created_at DESC);
