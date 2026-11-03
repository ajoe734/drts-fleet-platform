-- BUREAU-R13-AGENCY-READONLY-PORTAL-20261024
-- Append-only regulatory agency data-access log
-- (docs/02-architecture/bureau-agency-readonly-20261024.md §5.2).
--
-- Every agency read/export (and every agency authorization denial on an
-- agency route) is written here before data is returned. Rows are immutable:
-- UPDATE and TRUNCATE are always rejected, and DELETE is only permitted for a
-- lawful retention sweep that sets the session flag
-- 'audit.allow_retention_archival = on' as a member of the existing
-- audit_retention_operator role (same contract as V0080 for admin.audit_logs).
-- No retention period, default or scheduler is introduced here (open decision D9).

CREATE SCHEMA IF NOT EXISTS admin;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_retention_operator') THEN
    CREATE ROLE audit_retention_operator NOLOGIN;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin.agency_access_logs (
  access_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  agency_id varchar(100) NOT NULL
    REFERENCES core.regulatory_agencies(agency_id),
  principal_id varchar(100) NOT NULL
    REFERENCES iam.identity_principals(principal_id),
  membership_id varchar(100) NOT NULL,
  session_id varchar(255),
  action varchar(60) NOT NULL,
  resource_type varchar(60) NOT NULL,
  route_key varchar(150) NOT NULL,
  resource_id varchar(255),
  filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer,
  total_count integer,
  outcome varchar(20) NOT NULL,
  reason_code varchar(100),
  export_manifest_hash varchar(128),
  request_id varchar(100),
  source_ip_prefix varchar(64),
  user_agent_hash varchar(255),
  CONSTRAINT chk_agency_access_logs_action CHECK (
    action IN (
      'list',
      'detail',
      'report_view',
      'export_preview',
      'export_create',
      'export_status',
      'export_download'
    )
  ),
  CONSTRAINT chk_agency_access_logs_resource_type CHECK (
    resource_type IN (
      'trip_record',
      'operations_summary',
      'monthly_operations_summary',
      'daily_dispatch_record',
      'complaint_monthly_statistics',
      'vehicle_qualification',
      'driver_qualification',
      'trip_record_export'
    )
  ),
  CONSTRAINT chk_agency_access_logs_outcome CHECK (
    outcome IN ('success', 'denied', 'error')
  ),
  CONSTRAINT chk_agency_access_logs_filter_object CHECK (
    jsonb_typeof(filter) = 'object'
  ),
  CONSTRAINT chk_agency_access_logs_counts CHECK (
    (row_count IS NULL OR row_count >= 0)
    AND (total_count IS NULL OR total_count >= 0)
  ),
  -- A denied or failed access never reports rows as returned.
  CONSTRAINT chk_agency_access_logs_outcome_rows CHECK (
    outcome = 'success' OR row_count IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_agency_access_logs_agency_time
  ON admin.agency_access_logs (agency_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_access_logs_principal_time
  ON admin.agency_access_logs (principal_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_access_logs_request_id
  ON admin.agency_access_logs (request_id);

CREATE OR REPLACE FUNCTION admin.raise_agency_access_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('audit.allow_retention_archival', true) = 'on'
     AND (
       pg_has_role(current_user, 'audit_retention_operator', 'USAGE')
       OR pg_has_role(current_user, 'audit_retention_operator', 'MEMBER')
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'admin.agency_access_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_access_logs_append_only
  ON admin.agency_access_logs;

CREATE TRIGGER trg_agency_access_logs_append_only
BEFORE UPDATE OR DELETE ON admin.agency_access_logs
FOR EACH ROW
EXECUTE FUNCTION admin.raise_agency_access_logs_append_only();

DROP TRIGGER IF EXISTS trg_agency_access_logs_prevent_truncate
  ON admin.agency_access_logs;

CREATE TRIGGER trg_agency_access_logs_prevent_truncate
BEFORE TRUNCATE ON admin.agency_access_logs
FOR EACH STATEMENT
EXECUTE FUNCTION admin.raise_agency_access_logs_append_only();

REVOKE UPDATE, DELETE, TRUNCATE ON admin.agency_access_logs FROM PUBLIC;
