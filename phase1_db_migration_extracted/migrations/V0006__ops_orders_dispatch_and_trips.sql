-- V0006__ops_orders_dispatch_and_trips.sql

CREATE TABLE IF NOT EXISTS ops.orders (
  order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no varchar(50) NOT NULL UNIQUE,
  order_domain ops.order_domain_t NOT NULL,
  order_source ops.order_source_t NOT NULL,
  service_bucket ops.service_bucket_t NOT NULL,
  dispatch_semantics ops.dispatch_semantics_t NOT NULL,
  source_partner_id uuid REFERENCES core.partners(partner_id),
  tenant_id uuid REFERENCES core.tenants(tenant_id),
  site_id uuid REFERENCES core.sites(site_id),
  call_point_id uuid REFERENCES core.call_points(call_point_id),
  passenger_id uuid REFERENCES core.passengers(passenger_id),
  operating_area_id uuid REFERENCES core.operating_areas(area_id),
  pickup_address varchar(500) NOT NULL,
  pickup_lat numeric(10,7) NOT NULL,
  pickup_lng numeric(10,7) NOT NULL,
  dropoff_address varchar(500),
  dropoff_lat numeric(10,7),
  dropoff_lng numeric(10,7),
  scheduled_at timestamptz,
  contract_rule_id uuid REFERENCES ops.contract_rules(contract_rule_id),
  sla_template_id uuid REFERENCES ops.sla_templates(sla_template_id),
  pricing_template_id uuid,
  split_template_id uuid,
  qualification_profile_id uuid REFERENCES ops.qualification_profiles(qualification_profile_id),
  fallback_policy_id uuid,
  call_id uuid,
  recording_id uuid,
  agent_id uuid,
  current_status ops.order_status_t NOT NULL DEFAULT 'created',
  external_ref_no varchar(100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.bookings (
  booking_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES ops.orders(order_id) ON DELETE CASCADE,
  booking_type varchar(30) NOT NULL DEFAULT 'oneway',
  reservation_window_start timestamptz,
  reservation_window_end timestamptz,
  recurrence_rule text,
  modifiable_until timestamptz,
  cancelable_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.dispatch_jobs (
  dispatch_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES ops.orders(order_id) ON DELETE CASCADE,
  dispatch_mode ops.dispatch_mode_t NOT NULL,
  status ops.dispatch_job_status_t NOT NULL DEFAULT 'pending',
  priority_score integer NOT NULL DEFAULT 0,
  service_area_check_result varchar(30) NOT NULL DEFAULT 'pending',
  last_attempt_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.dispatch_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_job_id uuid NOT NULL REFERENCES ops.dispatch_jobs(dispatch_job_id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  attempt_mode ops.dispatch_mode_t NOT NULL,
  candidate_vehicle_id uuid REFERENCES reg.vehicles(vehicle_id),
  candidate_driver_id uuid REFERENCES reg.drivers(driver_id),
  offered_at timestamptz,
  accepted_at timestamptz,
  failed_reason varchar(100),
  status ops.dispatch_attempt_status_t NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispatch_job_id, attempt_no)
);

CREATE TABLE IF NOT EXISTS ops.dispatch_assignments (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_job_id uuid NOT NULL REFERENCES ops.dispatch_jobs(dispatch_job_id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES reg.vehicles(vehicle_id),
  driver_id uuid REFERENCES reg.drivers(driver_id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  arrived_pickup_at timestamptz,
  trip_started_at timestamptz,
  completed_at timestamptz,
  status varchar(30) NOT NULL DEFAULT 'assigned',
  version_no integer NOT NULL DEFAULT 1,
  UNIQUE (dispatch_job_id, version_no)
);

CREATE TABLE IF NOT EXISTS ops.trips (
  trip_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES ops.orders(order_id),
  assignment_id uuid NOT NULL REFERENCES ops.dispatch_assignments(assignment_id),
  vehicle_id uuid NOT NULL REFERENCES reg.vehicles(vehicle_id),
  driver_id uuid REFERENCES reg.drivers(driver_id),
  trip_status ops.trip_status_t NOT NULL DEFAULT 'created',
  started_at timestamptz,
  completed_at timestamptz,
  actual_distance_km numeric(10,2),
  actual_duration_sec integer,
  proof_required boolean NOT NULL DEFAULT false,
  proof_status varchar(30) NOT NULL DEFAULT 'not_required',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.proof_bundles (
  proof_bundle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL UNIQUE REFERENCES ops.trips(trip_id) ON DELETE CASCADE,
  signoff_name varchar(100),
  signoff_at timestamptz,
  photo_count integer NOT NULL DEFAULT 0,
  expense_total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.dispatch_trace_logs (
  trace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES ops.orders(order_id),
  vehicle_id uuid REFERENCES reg.vehicles(vehicle_id),
  driver_id uuid REFERENCES reg.drivers(driver_id),
  event_type varchar(100) NOT NULL,
  event_time timestamptz NOT NULL DEFAULT now(),
  lat numeric(10,7),
  lng numeric(10,7),
  occupancy_status ops.occupancy_status_t NOT NULL DEFAULT 'unknown',
  payload_hash varchar(128),
  source_channel varchar(50) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ops.vehicle_location_logs (
  location_log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES reg.vehicles(vehicle_id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  speed_kph numeric(8,2),
  heading_deg numeric(8,2),
  occupancy_status ops.occupancy_status_t NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON ops.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON ops.orders(current_status);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_at ON ops.orders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_status ON ops.dispatch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_trace_order_time ON ops.dispatch_trace_logs(order_id, event_time DESC);
