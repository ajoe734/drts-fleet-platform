CREATE TABLE IF NOT EXISTS admin.phase1_partner_user_identity_links (
  entry_slug varchar(150) NOT NULL,
  partner_user_ref varchar(255) NOT NULL,
  drts_passenger_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  consent_scope varchar(50) NOT NULL,
  linked_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (entry_slug, partner_user_ref)
);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_user_identity_links_passenger
  ON admin.phase1_partner_user_identity_links(drts_passenger_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_user_identity_links_entry
  ON admin.phase1_partner_user_identity_links(entry_slug, updated_at DESC);
