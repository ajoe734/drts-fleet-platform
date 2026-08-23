-- V0084__standardise_currency_code_twd.sql
-- One currency, one code.
--
-- The platform wrote the New Taiwan Dollar two ways. `TWD` is its ISO 4217
-- code. `NTD` is a colloquial abbreviation and is not an ISO code, and an
-- external payment or accounting system will not recognise it.
--
-- The split ran through the schema as well as the application: some columns
-- defaulted to 'TWD' (billing.phase1_settlements, ops driver domains,
-- platform earnings) and some to 'NTD' (fleet partner statements, multi-taxi
-- payments and receipts, the sandbox ledger). Rows written by one half were
-- rejected by validation in the other -- most consequentially by the
-- electronic-certificate gate, which withholds a passenger's receipt when the
-- currency is not what it expects.
--
-- Data is migrated before defaults are changed, so a row is never left
-- describing itself in a code nothing writes any more.
--
-- The application accepts both codes on read for the length of one release, so
-- that neither order of rollout -- migration first or image first -- leaves a
-- window where a receipt cannot be produced.

UPDATE billing.phase1_fleet_partner_statements
  SET sponsor_funded_gross_earning_basis_currency = 'TWD'
  WHERE sponsor_funded_gross_earning_basis_currency = 'NTD';
UPDATE billing.phase1_fleet_partner_statements
  SET sponsor_funded_share_amount_currency = 'TWD'
  WHERE sponsor_funded_share_amount_currency = 'NTD';
UPDATE billing.phase1_fleet_partner_statements
  SET reimbursement_amount_currency = 'TWD'
  WHERE reimbursement_amount_currency = 'NTD';

UPDATE billing.multi_taxi_passenger_payments
  SET currency = 'TWD' WHERE currency = 'NTD';
UPDATE reporting.multi_taxi_electronic_receipts
  SET currency = 'TWD' WHERE currency = 'NTD';
UPDATE reporting.multi_taxi_trip_operational_records
  SET currency = 'TWD' WHERE currency = 'NTD';

UPDATE av_sandbox.fulfillment_segments
  SET currency = 'TWD' WHERE currency = 'NTD';
UPDATE av_sandbox.sandbox_billing_treatments
  SET currency = 'TWD' WHERE currency = 'NTD';

ALTER TABLE billing.phase1_fleet_partner_statements
  ALTER COLUMN sponsor_funded_gross_earning_basis_currency SET DEFAULT 'TWD',
  ALTER COLUMN sponsor_funded_share_amount_currency SET DEFAULT 'TWD',
  ALTER COLUMN reimbursement_amount_currency SET DEFAULT 'TWD';

ALTER TABLE billing.multi_taxi_passenger_payments
  ALTER COLUMN currency SET DEFAULT 'TWD';
ALTER TABLE reporting.multi_taxi_electronic_receipts
  ALTER COLUMN currency SET DEFAULT 'TWD';
ALTER TABLE reporting.multi_taxi_trip_operational_records
  ALTER COLUMN currency SET DEFAULT 'TWD';

ALTER TABLE av_sandbox.fulfillment_segments
  ALTER COLUMN currency SET DEFAULT 'TWD';
ALTER TABLE av_sandbox.sandbox_billing_treatments
  ALTER COLUMN currency SET DEFAULT 'TWD';
