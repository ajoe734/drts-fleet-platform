-- V0056__multi_taxi_runtime_compliance_closure.sql
-- Canonical runtime context, operating authority, P-5 assignment/passenger
-- authority, electronic payment/receipt, and two-year operational records.

ALTER TABLE ops.phase1_owned_orders
  ADD COLUMN IF NOT EXISTS runtime_profile_code text NULL,
  ADD COLUMN IF NOT EXISTS service_product_code text NULL,
  ADD COLUMN IF NOT EXISTS acquisition_mode text NULL,
  ADD COLUMN IF NOT EXISTS timing_mode text NULL,
  ADD COLUMN IF NOT EXISTS operating_authorization_id varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS queue_mode text NULL;

CREATE INDEX IF NOT EXISTS phase1_owned_orders_runtime_profile_idx
  ON ops.phase1_owned_orders (runtime_profile_code, created_at DESC);

CREATE TABLE IF NOT EXISTS reg.multi_taxi_operating_authorizations (
  authorization_id varchar(255) PRIMARY KEY,
  operator_id varchar(255) NOT NULL,
  authority_code text NOT NULL,
  business_plan_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  service_area_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_fare_version_id varchar(255) NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multi_taxi_authorization_status_chk CHECK (
    status IN ('draft', 'approved', 'suspended', 'expired', 'revoked')
  ),
  CONSTRAINT multi_taxi_authorization_window_chk CHECK (
    effective_until IS NULL OR effective_until > effective_from
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS multi_taxi_authority_version_unique
  ON reg.multi_taxi_operating_authorizations (
    operator_id,
    authority_code,
    business_plan_version
  );

CREATE TABLE IF NOT EXISTS reg.multi_taxi_authorized_vehicles (
  authorization_vehicle_id varchar(255) PRIMARY KEY,
  authorization_id varchar(255) NOT NULL
    REFERENCES reg.multi_taxi_operating_authorizations(authorization_id)
    ON DELETE CASCADE,
  vehicle_id varchar(255) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  CONSTRAINT multi_taxi_authorized_vehicle_status_chk CHECK (
    status IN ('active', 'suspended', 'removed')
  ),
  CONSTRAINT multi_taxi_authorized_vehicle_window_chk CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  UNIQUE (authorization_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS ops.passenger_trip_ratings (
  rating_id varchar(255) PRIMARY KEY,
  order_id varchar(255) NOT NULL,
  trip_id varchar(255) NOT NULL,
  driver_id varchar(255) NOT NULL,
  passenger_subject_ref varchar(255) NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment text NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invalidated', 'under_review')),
  submitted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (order_id, passenger_subject_ref)
);

CREATE TABLE IF NOT EXISTS ops.driver_rating_summaries (
  driver_id varchar(255) PRIMARY KEY,
  display_state text NOT NULL
    CHECK (display_state IN ('rated', 'new_driver', 'unavailable')),
  average_rating numeric(3,2) NULL,
  rating_count integer NOT NULL DEFAULT 0,
  last_rated_at timestamptz NULL,
  aggregate_version integer NOT NULL DEFAULT 1,
  calculated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.multi_taxi_route_fare_snapshots (
  route_snapshot_id varchar(255) PRIMARY KEY,
  quote_snapshot_id varchar(255) NOT NULL UNIQUE,
  order_id varchar(255) NOT NULL,
  record jsonb NOT NULL,
  passenger_confirmed_at timestamptz NULL,
  generated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.passenger_dispatch_disclosure_snapshots (
  snapshot_id varchar(255) PRIMARY KEY,
  order_id varchar(255) NOT NULL,
  dispatch_job_id varchar(255) NOT NULL,
  assignment_id varchar(255) NOT NULL,
  assignment_version integer NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  superseded_at timestamptz NULL,
  UNIQUE (assignment_id, assignment_version)
);

CREATE TABLE IF NOT EXISTS ops.passenger_ride_access_tokens (
  token_id varchar(255) PRIMARY KEY,
  token_digest text NOT NULL UNIQUE,
  order_id varchar(255) NOT NULL,
  passenger_subject_ref varchar(255) NOT NULL,
  scopes jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.consumer_notification_outbox (
  outbox_id varchar(255) PRIMARY KEY,
  order_id varchar(255) NOT NULL,
  passenger_subject_ref varchar(255) NOT NULL,
  event_type text NOT NULL,
  assignment_version integer NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  delivered_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS billing.multi_taxi_passenger_payments (
  payment_id varchar(255) PRIMARY KEY,
  order_id varchar(255) NOT NULL UNIQUE,
  provider_payment_ref text NULL,
  payment_method_token_ref text NULL,
  status text NOT NULL DEFAULT 'not_selected'
    CHECK (status IN (
      'not_selected', 'authorized', 'captured', 'failed', 'refunded',
      'manual_recovery'
    )),
  amount_minor bigint NULL,
  currency char(3) NOT NULL DEFAULT 'NTD',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reporting.multi_taxi_electronic_receipts (
  receipt_id varchar(255) PRIMARY KEY,
  order_id varchar(255) NOT NULL UNIQUE,
  receipt_no text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'NTD',
  issued_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reporting.multi_taxi_trip_operational_records (
  record_id varchar(255) PRIMARY KEY,
  order_id varchar(255) NOT NULL UNIQUE,
  trip_id varchar(255) NOT NULL,
  vehicle_id varchar(255) NOT NULL,
  plate_no text NOT NULL,
  reserved_at timestamptz NOT NULL,
  pickup_at timestamptz NULL,
  dropoff_at timestamptz NULL,
  payable_fare_minor bigint NOT NULL,
  actual_fare_minor bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'NTD',
  record jsonb NOT NULL,
  generated_at timestamptz NOT NULL,
  retain_until timestamptz NOT NULL,
  CONSTRAINT multi_taxi_record_retention_chk CHECK (
    retain_until >= generated_at + interval '730 days'
  )
);

CREATE INDEX IF NOT EXISTS multi_taxi_operational_record_retention_idx
  ON reporting.multi_taxi_trip_operational_records (retain_until);
