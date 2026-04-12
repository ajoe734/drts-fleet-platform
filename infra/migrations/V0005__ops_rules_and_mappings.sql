-- V0005__ops_rules_and_mappings.sql

CREATE TABLE IF NOT EXISTS ops.sla_templates (
  sla_template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code varchar(50) NOT NULL UNIQUE,
  template_name varchar(200) NOT NULL,
  wait_minutes integer NOT NULL DEFAULT 0,
  arrival_threshold_minutes integer NOT NULL DEFAULT 0,
  completion_threshold_minutes integer NOT NULL DEFAULT 0,
  modifiable_until_minutes integer,
  cancelable_until_minutes integer,
  requires_signoff boolean NOT NULL DEFAULT false,
  requires_photo_proof boolean NOT NULL DEFAULT false,
  requires_expense_proof boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.qualification_profiles (
  qualification_profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_code varchar(50) NOT NULL UNIQUE,
  profile_name varchar(200) NOT NULL,
  service_bucket ops.service_bucket_t NOT NULL,
  allowed_license_classes reg.license_class_t[] NOT NULL,
  allowed_vehicle_forms reg.vehicle_form_t[] NOT NULL,
  required_service_tags text[] NOT NULL DEFAULT '{}',
  allow_forwarder boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.contract_rules (
  contract_rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code varchar(50) NOT NULL UNIQUE,
  tenant_id uuid REFERENCES core.tenants(tenant_id),
  partner_id uuid REFERENCES core.partners(partner_id),
  service_bucket ops.service_bucket_t NOT NULL,
  sla_template_id uuid NOT NULL REFERENCES ops.sla_templates(sla_template_id),
  qualification_profile_id uuid NOT NULL REFERENCES ops.qualification_profiles(qualification_profile_id),
  pricing_template_id uuid,
  split_template_id uuid,
  fallback_policy_id uuid,
  allows_change_passenger boolean NOT NULL DEFAULT false,
  allows_assign_specific_driver boolean NOT NULL DEFAULT false,
  allows_assign_specific_vehicle boolean NOT NULL DEFAULT false,
  active_flag boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.external_service_mappings (
  mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system varchar(100) NOT NULL,
  external_service_code varchar(100) NOT NULL,
  external_service_name varchar(200),
  service_bucket ops.service_bucket_t NOT NULL,
  dispatch_semantics ops.dispatch_semantics_t NOT NULL,
  qualification_profile_id uuid REFERENCES ops.qualification_profiles(qualification_profile_id),
  settlement_mode varchar(50) NOT NULL DEFAULT 'internal',
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, external_service_code)
);
