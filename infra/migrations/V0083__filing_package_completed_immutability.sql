-- V0083__filing_package_completed_immutability.sql
-- Freeze a filing package once it completes.
--
-- A completed package carries `immutable: true` inside its `record` jsonb, and
-- nothing enforced it. `admin.audit_logs` got database-level protection in
-- V0080; these rows have the same threat model and the same audience -- they are
-- what a regulator is shown -- and had none.
--
-- This is not append-only, and copying V0080 wholesale would have broken the
-- normal flow: the repository upserts a package as it moves queued -> running ->
-- completed, so rows are legitimately rewritten during their lifecycle. The rule
-- is narrower and matches what the application already claims: once `status` is
-- 'completed', the row is frozen.
--
-- TRUNCATE is blocked outright, because it bypasses row-level triggers.

CREATE OR REPLACE FUNCTION admin.raise_filing_package_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'admin.phase1_filing_packages cannot be truncated';
  END IF;

  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION
      'filing package % is completed and cannot be % (immutable to the regulator-facing audience it was produced for)',
      OLD.package_id, lower(TG_OP);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_filing_packages_freeze_completed
  ON admin.phase1_filing_packages;

CREATE TRIGGER trg_filing_packages_freeze_completed
BEFORE UPDATE OR DELETE ON admin.phase1_filing_packages
FOR EACH ROW
EXECUTE FUNCTION admin.raise_filing_package_frozen();

DROP TRIGGER IF EXISTS trg_filing_packages_prevent_truncate
  ON admin.phase1_filing_packages;

CREATE TRIGGER trg_filing_packages_prevent_truncate
BEFORE TRUNCATE ON admin.phase1_filing_packages
FOR EACH STATEMENT
EXECUTE FUNCTION admin.raise_filing_package_frozen();

REVOKE TRUNCATE ON admin.phase1_filing_packages FROM PUBLIC;
