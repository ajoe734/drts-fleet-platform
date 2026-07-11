-- SUP-BE-003 restore follow-up.
-- The restored supply write-flow persists against Phase 1 runtime snapshot ids,
-- which are varchar-backed slug/text ids rather than normalized UUID FKs.
--
-- This patch must use a unique migration version. A previous copy was
-- mistakenly introduced as V0036 and was shadowed by the existing service-area
-- V0036, so hermetic databases never applied the type conversion.

ALTER TABLE IF EXISTS fleet.supply_submissions
  ALTER COLUMN fleet_partner_id TYPE varchar(100) USING fleet_partner_id::text,
  ALTER COLUMN subject_driver_id TYPE varchar(100) USING subject_driver_id::text,
  ALTER COLUMN subject_vehicle_id TYPE varchar(100) USING subject_vehicle_id::text,
  ALTER COLUMN canonical_driver_id TYPE varchar(100) USING canonical_driver_id::text,
  ALTER COLUMN canonical_vehicle_id TYPE varchar(100) USING canonical_vehicle_id::text,
  ALTER COLUMN canonical_contract_id TYPE varchar(100) USING canonical_contract_id::text,
  ALTER COLUMN canonical_policy_id TYPE varchar(100) USING canonical_policy_id::text;

ALTER TABLE IF EXISTS fleet.supply_documents
  ALTER COLUMN fleet_partner_id TYPE varchar(100) USING fleet_partner_id::text;

ALTER TABLE IF EXISTS fleet.vehicle_fleet_affiliations
  ALTER COLUMN vehicle_id TYPE varchar(100) USING vehicle_id::text,
  ALTER COLUMN fleet_partner_id TYPE varchar(100) USING fleet_partner_id::text;
