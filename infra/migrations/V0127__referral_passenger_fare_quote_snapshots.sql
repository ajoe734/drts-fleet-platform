-- Original Referral R6: estimates belong to the verified referral, not a PAX account.
CREATE TABLE ops.phase1_referral_fare_quote_snapshots (
  quote_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  partner_program_id varchar(100) NOT NULL,
  entry_slug varchar(150) NOT NULL,
  drts_passenger_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_by_order_id varchar(100) NULL REFERENCES ops.phase1_owned_orders(order_id) DEFERRABLE INITIALLY DEFERRED,
  consumed_at timestamptz NULL,
  record jsonb NOT NULL,
  CHECK (expires_at > created_at),
  CHECK ((consumed_by_order_id IS NULL) = (consumed_at IS NULL))
);
CREATE INDEX phase1_referral_fare_quote_owner ON ops.phase1_referral_fare_quote_snapshots
  (tenant_id, partner_id, partner_program_id, entry_slug, drts_passenger_id, created_at DESC);
CREATE UNIQUE INDEX phase1_referral_fare_quote_order ON ops.phase1_referral_fare_quote_snapshots(consumed_by_order_id)
  WHERE consumed_by_order_id IS NOT NULL;

-- Only this forward migration can identify old ratings. Never classify missing
-- provenance as legacy on a request, or backfill a CRM case/contact choice.
UPDATE ops.phase1_owned_orders
SET record = jsonb_set(record, '{referralPassengerLifecycle,rating,policyVersion}', '"legacy"'::jsonb)
WHERE jsonb_typeof(record #> '{referralPassengerLifecycle,rating}') = 'object'
  AND NOT (record #> '{referralPassengerLifecycle,rating}' ? 'policyVersion');
