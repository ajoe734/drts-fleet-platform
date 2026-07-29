-- V0051__p5_vehicle_disclosure_and_driver_credentials.sql
-- Phase 1 · P-5 · multi_taxi_direct foundation anchors.
--
-- Source: docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/
--         03_gap_closure_implementation_plan.md  (Wave P5-1)
--
-- Scope of THIS migration (foundation anchors only; downstream P5-* waves add
-- rating / snapshot / route-fare / passenger-token / outbox tables):
--   1. add door_count/color to fleet.vehicle_supply_drafts  (P5-SUP-001)
--   2. reg.vehicle_passenger_disclosure_profiles            (canonical, §3.1)
--   3. reg.driver_public_registration_credentials           (canonical, §3.2)
--
-- Schema reconciliation vs spec §26: spec wrote `registry.*`; this repo uses
-- `reg`. No fake defaults: door_count/color are NULLable so backfill can route
-- missing values to a correction queue rather than inventing them.
--
-- Idempotent / deploy-safe for long-lived dev databases (all statements guarded).

-- ---------------------------------------------------------------------------
-- 1. Supply draft: capture door count + colour at onboarding (P5-SUP-001)
-- ---------------------------------------------------------------------------
ALTER TABLE fleet.vehicle_supply_drafts
  ADD COLUMN IF NOT EXISTS door_count integer NULL;

ALTER TABLE fleet.vehicle_supply_drafts
  ADD COLUMN IF NOT EXISTS color text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vehicle_supply_drafts_door_count_range'
  ) THEN
    ALTER TABLE fleet.vehicle_supply_drafts
      ADD CONSTRAINT vehicle_supply_drafts_door_count_range
      CHECK (door_count IS NULL OR door_count BETWEEN 3 AND 6) NOT VALID;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. Canonical vehicle passenger disclosure profile (§3.1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reg.vehicle_passenger_disclosure_profiles (
  vehicle_id uuid PRIMARY KEY
    REFERENCES reg.vehicles(vehicle_id) ON DELETE CASCADE,
  make text NOT NULL,
  model text NOT NULL,
  model_year integer NOT NULL,
  door_count integer NOT NULL,
  color text NULL,
  status text NOT NULL DEFAULT 'incomplete',
  missing_field_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_by_actor_id text NULL,
  verified_at timestamptz NULL,
  source_submission_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_disclosure_status_chk
    CHECK (status IN ('complete', 'incomplete', 'suspended')),
  CONSTRAINT vehicle_disclosure_door_count_chk
    CHECK (door_count BETWEEN 3 AND 6)
);

-- ---------------------------------------------------------------------------
-- 3. Canonical driver public registration credential (§3.2)
--    Public-facing, masked, human-review lifecycle. `verified_active` is never
--    inferred from licensesValid — it is set only by human review.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reg.driver_public_registration_credentials (
  driver_id uuid PRIMARY KEY
    REFERENCES reg.drivers(driver_id) ON DELETE CASCADE,
  registration_no text NOT NULL,
  registration_area text NOT NULL,
  effective_from date NULL,
  effective_until date NOT NULL,
  status text NOT NULL DEFAULT 'unverified',
  masked_display text NOT NULL,
  verified_by_actor_id text NULL,
  verified_at timestamptz NULL,
  source_submission_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_public_registration_status_chk
    CHECK (status IN (
      'verified_active', 'expired', 'suspended',
      'revoked', 'unverified', 'missing'
    ))
);
