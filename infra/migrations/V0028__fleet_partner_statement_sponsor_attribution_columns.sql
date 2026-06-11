ALTER TABLE billing.phase1_fleet_partner_statements
  ADD COLUMN IF NOT EXISTS sponsor_funded_trip_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sponsor_funded_gross_earning_basis_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sponsor_funded_gross_earning_basis_currency varchar(10) NOT NULL DEFAULT 'NTD',
  ADD COLUMN IF NOT EXISTS sponsor_funded_share_amount_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sponsor_funded_share_amount_currency varchar(10) NOT NULL DEFAULT 'NTD',
  ADD COLUMN IF NOT EXISTS reimbursement_amount_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursement_amount_currency varchar(10) NOT NULL DEFAULT 'NTD';
