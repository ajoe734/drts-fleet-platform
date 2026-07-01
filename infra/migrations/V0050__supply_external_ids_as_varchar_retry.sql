-- V0050 -- Retry the SUP-BE-003 external-id widening under a unique version.
--
-- V0036__supply_external_ids_as_varchar.sql used the same schema_migrations
-- version as V0036__service_area_geofence_authority.sql. The migration runner
-- records only the V#### prefix, so fresh hermetic databases skip the supply
-- widening after the service-area V0036 applies. Keep this migration idempotent
-- so existing environments that did apply the original file remain safe.

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
