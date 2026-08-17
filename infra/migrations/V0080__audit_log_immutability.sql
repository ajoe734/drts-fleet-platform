-- V0080__audit_log_immutability.sql
-- Enforce audit-log immutability in the database (GAP-CONF-03 / Gate C1).
--
-- 1. Creates NOLOGIN role 'audit_retention_operator' if not exists for privilege-gated archival.
-- 2. Adds BEFORE UPDATE OR DELETE row-level trigger on admin.audit_logs that raises an exception,
--    preventing mutation or deletion of audit logs.
-- 3. Adds BEFORE TRUNCATE statement-level trigger on admin.audit_logs that raises an exception,
--    preventing TRUNCATE statements (which bypass row-level triggers) under all circumstances.
-- 4. Provides a privileged bypass for DELETE during lawful retention archival sweeps only when
--    BOTH:
--      (a) session flag 'audit.allow_retention_archival = on' is set in the transaction, AND
--      (b) current_user has membership/usage in 'audit_retention_operator' (or is superuser).
-- 5. Revokes UPDATE, DELETE, TRUNCATE ON admin.audit_logs FROM PUBLIC as defence in depth.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_retention_operator') THEN
    CREATE ROLE audit_retention_operator NOLOGIN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION admin.raise_audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Privileged retention archival: only permitted for DELETE when session setting is 'on'
  -- AND current_user has membership in audit_retention_operator (or superuser privileges).
  IF TG_OP = 'DELETE'
     AND current_setting('audit.allow_retention_archival', true) = 'on'
     AND (
       pg_has_role(current_user, 'audit_retention_operator', 'USAGE')
       OR pg_has_role(current_user, 'audit_retention_operator', 'MEMBER')
     ) THEN
    RETURN OLD;
  END IF;

  -- Under all other circumstances (UPDATE, DELETE without bypass/privilege, or any TRUNCATE), reject immediately.
  RAISE EXCEPTION 'admin.audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only
  ON admin.audit_logs;

CREATE TRIGGER trg_audit_logs_append_only
BEFORE UPDATE OR DELETE ON admin.audit_logs
FOR EACH ROW
EXECUTE FUNCTION admin.raise_audit_logs_append_only();

DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate
  ON admin.audit_logs;

CREATE TRIGGER trg_audit_logs_prevent_truncate
BEFORE TRUNCATE ON admin.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION admin.raise_audit_logs_append_only();

REVOKE UPDATE, DELETE, TRUNCATE ON admin.audit_logs FROM PUBLIC;
