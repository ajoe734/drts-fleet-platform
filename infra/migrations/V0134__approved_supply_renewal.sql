-- V0134__approved_supply_renewal.sql
-- Task: BUREAU-APPROVED-SUPPLY-RENEWAL-WORKFLOW-20261025
-- Purpose:
--   1. Replace the global plate-only unique index on fleet.vehicle_supply_drafts
--      (from V0034) with a non-unique lookup index so an approved canonical
--      vehicle can receive subsequent insurance_update / contract_update
--      submissions while preserving historical onboarding draft rows.
--   2. Add composite indexes on fleet.supply_submissions for existing-supply
--      renewal target lookup and multi-submission readiness aggregation by
--      canonical_vehicle_id / canonical_driver_id.
--   3. Ensure reg.phase1_registry_expiry_events.entity_type check constraint
--      permits 'contract' alongside 'driver' and 'policy' for renewal
--      supersession compatibility.

DROP INDEX IF EXISTS fleet.idx_vehicle_draft_partner_plate_active;

CREATE INDEX IF NOT EXISTS idx_vehicle_supply_drafts_plate_no
  ON fleet.vehicle_supply_drafts(plate_no);

CREATE INDEX IF NOT EXISTS idx_supply_submissions_partner_subject_vehicle
  ON fleet.supply_submissions(fleet_partner_id, subject_vehicle_id, updated_at DESC)
  WHERE subject_vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supply_submissions_partner_subject_driver
  ON fleet.supply_submissions(fleet_partner_id, subject_driver_id, updated_at DESC)
  WHERE subject_driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supply_submissions_canonical_vehicle_status
  ON fleet.supply_submissions(canonical_vehicle_id, status, updated_at DESC)
  WHERE canonical_vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supply_submissions_canonical_driver_status
  ON fleet.supply_submissions(canonical_driver_id, status, updated_at DESC)
  WHERE canonical_driver_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'reg'
      AND table_name = 'phase1_registry_expiry_events'
  ) THEN
    ALTER TABLE reg.phase1_registry_expiry_events
      DROP CONSTRAINT IF EXISTS phase1_registry_expiry_events_entity_type_check;
    ALTER TABLE reg.phase1_registry_expiry_events
      ADD CONSTRAINT phase1_registry_expiry_events_entity_type_check
      CHECK (entity_type IN ('driver', 'policy', 'contract'));
  END IF;
END$$;
