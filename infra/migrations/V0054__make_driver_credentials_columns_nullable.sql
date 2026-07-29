-- V0053__make_driver_credentials_columns_nullable.sql
-- Alter reg.driver_public_registration_credentials to allow NULLs for missing data.

ALTER TABLE reg.driver_public_registration_credentials
  ALTER COLUMN registration_no DROP NOT NULL,
  ALTER COLUMN registration_area DROP NOT NULL,
  ALTER COLUMN effective_until DROP NOT NULL;
