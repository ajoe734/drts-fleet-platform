-- V0009__admin_reporting_audit_and_integrations.sql

CREATE TABLE IF NOT EXISTS admin.public_info_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(200) NOT NULL,
  call_phone varchar(50),
  complaint_phone varchar(50),
  call_rate_text varchar(200),
  fare_text text,
  payment_method_text text,
  status admin.public_info_status_t NOT NULL DEFAULT 'draft',
  effective_from timestamptz,
  effective_to timestamptz,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.placard_versions (
  placard_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code varchar(50) NOT NULL UNIQUE,
  public_info_version_id uuid NOT NULL REFERENCES admin.public_info_versions(version_id),
  template_name varchar(200) NOT NULL,
  artifact_file_id uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.report_jobs (
  report_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type varchar(100) NOT NULL,
  requested_by uuid,
  tenant_id uuid REFERENCES core.tenants(tenant_id),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status admin.report_status_t NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.report_artifacts (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_job_id uuid NOT NULL REFERENCES admin.report_jobs(report_job_id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL,
  file_format varchar(20) NOT NULL,
  object_key varchar(500) NOT NULL,
  checksum varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.filing_packages (
  package_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type admin.package_type_t NOT NULL,
  generated_by uuid,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status admin.package_status_t NOT NULL DEFAULT 'queued',
  artifact_zip_id uuid,
  artifact_pdf_id uuid,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.filing_package_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES admin.filing_packages(package_id) ON DELETE CASCADE,
  item_name varchar(200) NOT NULL,
  object_key varchar(500) NOT NULL,
  checksum varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.audit_logs (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_type varchar(50) NOT NULL,
  tenant_id uuid REFERENCES core.tenants(tenant_id),
  module_name varchar(100) NOT NULL,
  action_name varchar(100) NOT NULL,
  resource_type varchar(100) NOT NULL,
  resource_id varchar(100),
  old_value jsonb,
  new_value jsonb,
  request_id varchar(100),
  ip_address inet,
  user_agent text,
  hash_value varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.webhook_endpoints (
  webhook_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(tenant_id),
  name varchar(200) NOT NULL,
  target_url varchar(500) NOT NULL,
  secret_hash varchar(256) NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.webhook_deliveries (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES admin.webhook_endpoints(webhook_id) ON DELETE CASCADE,
  event_name varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  response_code integer,
  response_body text,
  attempt_no integer NOT NULL DEFAULT 1,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.api_keys (
  api_key_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(tenant_id),
  key_name varchar(200) NOT NULL,
  key_prefix varchar(30) NOT NULL,
  key_hash varchar(256) NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_time ON admin.audit_logs(module_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_status ON admin.report_jobs(status);
