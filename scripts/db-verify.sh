#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/scripts/db-common.sh"
ensure_database_url

run_psql <<'SQL'
DO $$
BEGIN
  IF to_regclass('core.tenants') IS NULL THEN
    RAISE EXCEPTION 'core.tenants missing';
  END IF;
  IF to_regclass('reg.vehicles') IS NULL THEN
    RAISE EXCEPTION 'reg.vehicles missing';
  END IF;
  IF to_regclass('ops.orders') IS NULL THEN
    RAISE EXCEPTION 'ops.orders missing';
  END IF;
  IF to_regclass('crm.complaint_cases') IS NULL THEN
    RAISE EXCEPTION 'crm.complaint_cases missing';
  END IF;
  IF to_regclass('billing.driver_statements') IS NULL THEN
    RAISE EXCEPTION 'billing.driver_statements missing';
  END IF;
  IF to_regclass('admin.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'admin.audit_logs missing';
  END IF;
  IF to_regclass('reg.v_vehicle_dispatch_readiness') IS NULL THEN
    RAISE EXCEPTION 'reg.v_vehicle_dispatch_readiness missing';
  END IF;
  IF to_regclass('ops.v_dispatch_board_pending') IS NULL THEN
    RAISE EXCEPTION 'ops.v_dispatch_board_pending missing';
  END IF;
  IF to_regclass('crm.v_complaint_export') IS NULL THEN
    RAISE EXCEPTION 'crm.v_complaint_export missing';
  END IF;
END$$;

SELECT 'tenants' AS metric, count(*) AS value FROM core.tenants
UNION ALL
SELECT 'vehicles', count(*) FROM reg.vehicles
UNION ALL
SELECT 'drivers', count(*) FROM reg.drivers
UNION ALL
SELECT 'orders', count(*) FROM ops.orders
UNION ALL
SELECT 'complaints', count(*) FROM crm.complaint_cases
UNION ALL
SELECT 'driver_statements', count(*) FROM billing.driver_statements
UNION ALL
SELECT 'schema_migrations', count(*) FROM admin.schema_migrations
UNION ALL
SELECT 'seed_runs', count(*) FROM admin.seed_runs
ORDER BY metric;
SQL

echo "[done] schema verification passed"
