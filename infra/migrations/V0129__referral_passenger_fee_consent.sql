-- E19: verified Referral ownership, never a Passenger APP account or browser session.
CREATE TABLE ops.phase1_referral_passenger_fee_acknowledgements (
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  partner_program_id varchar(100) NOT NULL,
  entry_slug varchar(150) NOT NULL REFERENCES admin.phase1_partner_channel_entries(entry_slug),
  drts_passenger_id varchar(100) NOT NULL,
  disclosure_version varchar(100) NOT NULL,
  content_hash varchar(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  acknowledged_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (tenant_id,partner_id,partner_program_id,entry_slug,drts_passenger_id,disclosure_version)
);
CREATE TABLE ops.phase1_referral_order_fee_confirmations (
  order_id varchar(100) PRIMARY KEY REFERENCES ops.phase1_owned_orders(order_id) DEFERRABLE INITIALLY DEFERRED,
  quote_id varchar(100) NOT NULL UNIQUE REFERENCES ops.phase1_referral_fare_quote_snapshots(quote_id),
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  partner_program_id varchar(100) NOT NULL,
  entry_slug varchar(150) NOT NULL,
  drts_passenger_id varchar(100) NOT NULL,
  disclosure_version varchar(100) NOT NULL,
  content_hash varchar(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  fee_confirmed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY (tenant_id,partner_id,partner_program_id,entry_slug,drts_passenger_id,disclosure_version)
    REFERENCES ops.phase1_referral_passenger_fee_acknowledgements
    (tenant_id,partner_id,partner_program_id,entry_slug,drts_passenger_id,disclosure_version)
);
-- No legacy UPDATE: quote consumption/creation/privacy consent is not fee agreement.
