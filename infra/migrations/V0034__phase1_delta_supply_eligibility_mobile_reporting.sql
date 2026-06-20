-- V0034 — Phase 1 delta: supply self-onboarding, exact-product eligibility,
--          mobile heartbeat durability, and operations reporting skeleton.
--
-- Source of truth:
--   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md
--   §4 Database DDL 草稿
--
-- Skeleton-only migration: it provisions the schemas/tables the downstream
-- supply / eligibility / telemetry / reporting execution waves persist into.
-- No data backfill or service logic is included here.
--
-- Schema alignment notes:
--   * The SD §4.7 ALTER targets are written against `mobility.phase1_orders`,
--     but the existing Phase 1 runtime persistence (V0011) lives under the
--     `ops` schema as ops.phase1_owned_orders / ops.phase1_dispatch_jobs /
--     ops.phase1_driver_tasks. Per the task guardrail, the ALTER targets here
--     align to the real existing tables in `ops`.
--   * New domain tables follow the SD-specified schemas (fleet / telemetry /
--     reporting / mobility).
-- All statements are idempotent so re-application is a no-op.

CREATE SCHEMA IF NOT EXISTS fleet;
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS mobility;

-- §4.1 Supply Submission --------------------------------------------------

CREATE TABLE IF NOT EXISTS fleet.supply_submissions (
  submission_id uuid PRIMARY KEY,
  fleet_partner_id uuid NOT NULL,
  submission_type text NOT NULL,
  status text NOT NULL,
  revision_no integer NOT NULL DEFAULT 1,

  subject_driver_id uuid NULL,
  subject_vehicle_id uuid NULL,

  submitted_by text NULL,
  submitted_at timestamptz NULL,
  review_started_by text NULL,
  review_started_at timestamptz NULL,
  reviewed_by text NULL,
  reviewed_at timestamptz NULL,

  review_reason_code text NULL,
  review_comment text NULL,

  canonical_driver_id uuid NULL,
  canonical_vehicle_id uuid NULL,
  canonical_contract_id uuid NULL,
  canonical_policy_id uuid NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    status IN (
      'draft',
      'submitted',
      'in_review',
      'needs_revision',
      'approved',
      'rejected',
      'withdrawn'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_supply_submissions_partner_status
  ON fleet.supply_submissions(fleet_partner_id, status, updated_at DESC);

-- §4.2 Driver Draft -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fleet.driver_supply_drafts (
  submission_id uuid PRIMARY KEY
    REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,

  name text NOT NULL,
  mobile text NOT NULL,

  professional_driver_license_no text NOT NULL,
  professional_driver_license_expiry date NOT NULL,

  taxi_driver_registration_no text NOT NULL,
  taxi_driver_registration_area text NOT NULL,
  taxi_driver_registration_expiry date NOT NULL,

  supported_service_product_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferred_vehicle_submission_id uuid NULL,

  payload_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- §4.3 Vehicle Draft ------------------------------------------------------

CREATE TABLE IF NOT EXISTS fleet.vehicle_supply_drafts (
  submission_id uuid PRIMARY KEY
    REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,

  plate_no text NOT NULL,
  license_type text NOT NULL,

  brand text NULL,
  model text NULL,
  model_year integer NULL,

  seat_count integer NOT NULL,
  luggage_capacity integer NOT NULL,
  business_area text NOT NULL,

  supported_service_product_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  airport_transfer_eligible boolean NOT NULL DEFAULT false,
  fixed_fare_allowed boolean NOT NULL DEFAULT false,

  current_driver_submission_id uuid NULL,

  payload_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- SD §4.3: skeleton uses a plate-level unique index; the implementation wave
-- narrows this to a partner-scoped active uniqueness constraint and routes a
-- plate already in the canonical registry into an update flow.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_draft_partner_plate_active
  ON fleet.vehicle_supply_drafts(plate_no);

-- §4.4 Supply Documents ---------------------------------------------------

CREATE TABLE IF NOT EXISTS fleet.supply_documents (
  document_id uuid PRIMARY KEY,
  fleet_partner_id uuid NOT NULL,
  submission_id uuid NOT NULL
    REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,

  document_type text NOT NULL,
  file_object_key text NOT NULL,
  original_file_name text NOT NULL,
  content_type text NOT NULL,
  file_size bigint NOT NULL,
  checksum_sha256 text NOT NULL,

  effective_from date NULL,
  effective_until date NULL,

  review_status text NOT NULL DEFAULT 'pending',
  review_comment text NULL,

  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  CHECK (review_status IN ('pending', 'approved', 'rejected', 'expired'))
);

-- §4.5 Review Events ------------------------------------------------------

CREATE TABLE IF NOT EXISTS fleet.supply_review_events (
  event_id uuid PRIMARY KEY,
  submission_id uuid NOT NULL
    REFERENCES fleet.supply_submissions(submission_id),

  revision_no integer NOT NULL,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  reason_code text NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_review_events_submission
  ON fleet.supply_review_events(submission_id, created_at);

-- §4.6 Vehicle Affiliation ------------------------------------------------

CREATE TABLE IF NOT EXISTS fleet.vehicle_fleet_affiliations (
  affiliation_id uuid PRIMARY KEY,
  vehicle_id uuid NOT NULL,
  fleet_partner_id uuid NOT NULL,

  affiliation_type text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  status text NOT NULL,

  source_submission_id uuid NOT NULL
    REFERENCES fleet.supply_submissions(submission_id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (affiliation_type IN ('owned_by', 'managed_by', 'contracted_under')),
  CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_affiliation_active
  ON fleet.vehicle_fleet_affiliations(vehicle_id, status, effective_from);

-- §4.7 Exact Product Columns ---------------------------------------------
-- Aligned to existing ops.phase1_* runtime persistence tables (V0011).

ALTER TABLE ops.phase1_owned_orders
  ADD COLUMN IF NOT EXISTS service_product_id text NULL,
  ADD COLUMN IF NOT EXISTS service_product_code text NULL,
  ADD COLUMN IF NOT EXISTS service_product_version text NULL,
  ADD COLUMN IF NOT EXISTS eligibility_policy_version text NULL;

ALTER TABLE ops.phase1_dispatch_jobs
  ADD COLUMN IF NOT EXISTS service_product_id text NULL,
  ADD COLUMN IF NOT EXISTS service_product_code text NULL,
  ADD COLUMN IF NOT EXISTS service_product_version text NULL,
  ADD COLUMN IF NOT EXISTS eligibility_policy_version text NULL;

ALTER TABLE ops.phase1_driver_tasks
  ADD COLUMN IF NOT EXISTS service_product_id text NULL,
  ADD COLUMN IF NOT EXISTS service_product_code text NULL,
  ADD COLUMN IF NOT EXISTS service_product_version text NULL,
  ADD COLUMN IF NOT EXISTS eligibility_policy_version text NULL;

-- §4.8 Eligibility Decisions ---------------------------------------------

CREATE TABLE IF NOT EXISTS mobility.runtime_eligibility_decisions (
  decision_id uuid PRIMARY KEY,
  order_id text NOT NULL,
  dispatch_job_id text NOT NULL,
  driver_id text NOT NULL,
  vehicle_id text NOT NULL,

  service_product_id text NOT NULL,
  service_product_code text NOT NULL,
  policy_version text NOT NULL,

  decision text NOT NULL,
  hard_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  soft_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,

  location_state text NOT NULL,
  evaluated_at timestamptz NOT NULL,

  CHECK (decision IN ('eligible', 'conditionally_eligible', 'ineligible'))
);

CREATE INDEX IF NOT EXISTS idx_eligibility_dispatch
  ON mobility.runtime_eligibility_decisions(dispatch_job_id, evaluated_at DESC);

-- §4.9 Mobile Heartbeat Events -------------------------------------------

CREATE TABLE IF NOT EXISTS telemetry.driver_location_events (
  event_id text PRIMARY KEY,
  device_id text NOT NULL,
  driver_id text NOT NULL,
  vehicle_id text NULL,
  task_id text NULL,

  sequence_no bigint NOT NULL,
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),

  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision NULL,

  work_state text NOT NULL,
  app_state text NOT NULL,
  transport_mode text NOT NULL,
  network_type text NOT NULL,

  clock_skew_ms bigint NULL,
  out_of_order boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_device_sequence
  ON telemetry.driver_location_events(device_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_driver_location_time
  ON telemetry.driver_location_events(driver_id, recorded_at DESC);

-- §4.10 Daily Dispatch Records -------------------------------------------

CREATE TABLE IF NOT EXISTS reporting.dispatch_daily_records (
  service_date date NOT NULL,
  order_id text NOT NULL,
  order_no text NOT NULL,

  order_source text NOT NULL,
  tenant_id text NULL,
  partner_id text NULL,
  service_product_code text NOT NULL,

  requested_at timestamptz NOT NULL,
  reservation_time timestamptz NULL,

  pickup_address_snapshot text NOT NULL,
  dropoff_address_snapshot text NULL,

  first_dispatch_at timestamptz NULL,
  first_assigned_at timestamptz NULL,

  final_driver_id text NULL,
  final_vehicle_id text NULL,
  final_plate_no text NULL,

  eta_seconds_at_assignment integer NULL,
  arrived_pickup_at timestamptz NULL,
  trip_started_at timestamptz NULL,
  trip_completed_at timestamptz NULL,

  final_status text NOT NULL,
  redispatch_count integer NOT NULL DEFAULT 0,
  cancellation_reason text NULL,
  complaint_count integer NOT NULL DEFAULT 0,

  generated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (service_date, order_id)
);

-- §4.11 Dispatchable Supply Snapshots ------------------------------------

CREATE TABLE IF NOT EXISTS reporting.dispatchable_supply_snapshots (
  snapshot_at timestamptz NOT NULL,
  business_area text NOT NULL,
  service_product_code text NOT NULL,

  dispatchable_vehicle_count integer NOT NULL,
  available_driver_count integer NOT NULL,

  source_health text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (snapshot_at, business_area, service_product_code)
);

-- §4.12 Operations Summary -----------------------------------------------

CREATE TABLE IF NOT EXISTS reporting.monthly_operations_summaries (
  period_month text NOT NULL,
  business_area text NOT NULL,
  service_product_code text NOT NULL,

  demand_request_count integer NOT NULL,
  actual_dispatch_count integer NOT NULL,
  completed_trip_count integer NOT NULL,
  cancelled_order_count integer NOT NULL,

  average_dispatchable_vehicle_count numeric(12,2) NOT NULL,
  valid_snapshot_count integer NOT NULL,
  expected_snapshot_count integer NOT NULL,
  snapshot_coverage_rate numeric(6,4) NOT NULL,

  complaint_count integer NOT NULL,
  complaints_by_category jsonb NOT NULL DEFAULT '{}'::jsonb,

  generated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (period_month, business_area, service_product_code)
);
