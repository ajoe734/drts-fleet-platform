-- V0055__p5_disclosure_ids_as_varchar.sql
-- P5-SUP-DRV-001 corrective follow-up to V0051.
--
-- V0051 declared the P-5 disclosure tables with `uuid` primary keys and real FKs
-- to reg.vehicles / reg.drivers. That is wrong for this codebase: the Phase 1
-- runtime write-flow persists varchar-backed slug/text ids (e.g. "demo-driver",
-- "drv_<uuid>"), not normalized UUIDs -- the same trap V0050 already had to fix
-- for fleet.supply_submissions.
--
-- Symptom: E2E-019-fleet-supply-onboarding failed with
--   ERROR: invalid input syntax for type uuid: "demo-driver"
--   ERROR: invalid input syntax for type uuid: "drv_fbc58402-..."
-- as soon as the disclosure projection actually wrote to these tables.
--
-- Converts both id columns to varchar(100) and drops the UUID foreign keys,
-- matching V0050 and the text-id convention already used by
-- safety.driver_sos_events (V0052) and mobility.runtime_eligibility_decisions.
--
-- Idempotent / deploy-safe.

ALTER TABLE IF EXISTS reg.vehicle_passenger_disclosure_profiles
  DROP CONSTRAINT IF EXISTS vehicle_passenger_disclosure_profiles_vehicle_id_fkey;

ALTER TABLE IF EXISTS reg.vehicle_passenger_disclosure_profiles
  ALTER COLUMN vehicle_id TYPE varchar(100) USING vehicle_id::text;

ALTER TABLE IF EXISTS reg.driver_public_registration_credentials
  DROP CONSTRAINT IF EXISTS driver_public_registration_credentials_driver_id_fkey;

ALTER TABLE IF EXISTS reg.driver_public_registration_credentials
  ALTER COLUMN driver_id TYPE varchar(100) USING driver_id::text;
