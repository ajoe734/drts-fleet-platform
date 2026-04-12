-- V0004__regulatory_registry.sql

CREATE TABLE IF NOT EXISTS reg.vehicles (
  vehicle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_no varchar(30) NOT NULL UNIQUE,
  vin varchar(64) NOT NULL UNIQUE,
  vehicle_form reg.vehicle_form_t NOT NULL,
  license_class reg.license_class_t NOT NULL,
  energy_type reg.energy_type_t NOT NULL DEFAULT 'fuel',
  owner_type core.partner_type_t,
  owner_partner_id uuid REFERENCES core.partners(partner_id),
  dispatch_partner_id uuid REFERENCES core.partners(partner_id),
  current_status reg.vehicle_status_t NOT NULL DEFAULT 'active',
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg.vehicle_reg_profiles (
  vehicle_id uuid PRIMARY KEY REFERENCES reg.vehicles(vehicle_id) ON DELETE CASCADE,
  operating_area_id uuid NOT NULL REFERENCES core.operating_areas(area_id),
  dispatchable_flag boolean NOT NULL DEFAULT false,
  brand_profile_id uuid,
  placard_version_id uuid,
  contract_start timestamptz,
  contract_end timestamptz,
  service_tags text[] NOT NULL DEFAULT '{}',
  latest_review_status reg.review_status_t NOT NULL DEFAULT 'draft',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg.vehicle_contracts (
  contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES reg.vehicles(vehicle_id),
  partner_id uuid NOT NULL REFERENCES core.partners(partner_id),
  partner_type core.partner_type_t NOT NULL,
  contract_type varchar(50) NOT NULL,
  operating_area_id uuid REFERENCES core.operating_areas(area_id),
  service_scope varchar(100) NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  document_bundle_id uuid,
  status varchar(30) NOT NULL DEFAULT 'draft',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS reg.insurance_policies (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES reg.vehicles(vehicle_id),
  policy_no varchar(100) NOT NULL,
  insurance_type varchar(50) NOT NULL,
  insurer_name varchar(200) NOT NULL,
  coverage_amount numeric(14,2) NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  proof_file_id uuid,
  status reg.insurance_status_t NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coverage_amount >= 0),
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS reg.dispatch_exclusivities (
  vehicle_id uuid PRIMARY KEY REFERENCES reg.vehicles(vehicle_id) ON DELETE CASCADE,
  declaration_status varchar(30) NOT NULL DEFAULT 'missing',
  declaration_file_id uuid,
  review_status reg.review_status_t NOT NULL DEFAULT 'draft',
  reviewer_id uuid,
  reviewed_at timestamptz,
  exclusive_provider_name varchar(200),
  effective_start timestamptz,
  effective_end timestamptz,
  termination_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg.drivers (
  driver_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(100) NOT NULL,
  mobile varchar(50) NOT NULL,
  bound_vehicle_id uuid REFERENCES reg.vehicles(vehicle_id),
  status reg.driver_status_t NOT NULL DEFAULT 'active',
  service_rating numeric(5,2) NOT NULL DEFAULT 5.0,
  complaint_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg.driver_reg_profiles (
  driver_id uuid PRIMARY KEY REFERENCES reg.drivers(driver_id) ON DELETE CASCADE,
  occupational_license_no varchar(100),
  occupational_license_expiry date,
  taxi_registration_no varchar(100),
  taxi_registration_expiry date,
  training_status reg.training_status_t NOT NULL DEFAULT 'pending',
  last_training_at timestamptz,
  certificate_status varchar(30) NOT NULL DEFAULT 'valid',
  suspend_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg.driver_training_records (
  training_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES reg.drivers(driver_id),
  course_name varchar(200) NOT NULL,
  course_type varchar(50) NOT NULL,
  completed_at timestamptz,
  expires_at timestamptz,
  result varchar(30) NOT NULL DEFAULT 'passed',
  evidence_file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
