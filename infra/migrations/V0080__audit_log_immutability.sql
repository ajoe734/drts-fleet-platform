-- V0080__audit_log_immutability.sql
-- Enforce audit-log immutability in the database (GAP-CONF-03 / Gate C1).
--
-- Adds a BEFORE UPDATE OR DELETE trigger on admin.audit_logs that raises an exception,
-- ensuring append-only audit log integrity at the database engine level.
--
-- Provides a session-scoped privileged bypass ('audit.allow_retention_archival')
-- so lawful retention purges/archivals can execute without dropping or disabling triggers.
-- Adds REVOKE UPDATE, DELETE ON admin.audit_logs FROM PUBLIC as defence in depth.

CREATE OR REPLACE FUNCTION admin.raise_audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('audit.allow_retention_archival', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'admin.audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only
  ON admin.audit_logs;

CREATE TRIGGER trg_audit_logs_append_only
BEFORE UPDATE OR DELETE ON admin.audit_logs
FOR EACH ROW
EXECUTE FUNCTION admin.raise_audit_logs_append_only();

REVOKE UPDATE, DELETE ON admin.audit_logs FROM PUBLIC;
