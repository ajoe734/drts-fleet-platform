#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/scripts/db-common.sh"

STAGE="${1:-all}"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: ./scripts/phase1-rollout-verify.sh <backfill|uat|pilot|production|all> [--dry-run]

Stages:
  backfill    Verify the adopted schema, seed lineage, bootstrap templates, and seeded baseline data.
  uat         Run the backfill gate plus repo validation (`db:verify` + `check.sh`).
  pilot       Run the UAT gate plus pilot read-model metrics queries.
  production  Run the pilot gate plus full workspace build.
  all         Alias for production.
EOF
}

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[error] unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$STAGE" in
  backfill|uat|pilot|production|all)
    ;;
  *)
    echo "[error] unknown stage: $STAGE" >&2
    usage >&2
    exit 1
    ;;
esac

run_cmd() {
  printf '[step] %s\n' "$*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  "$@"
}

run_sql() {
  local title="$1"
  local sql="$2"
  printf '[sql] %s\n' "$title"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  run_psql <<SQL
${sql}
SQL
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "[error] required file missing: ${file}" >&2
    exit 1
  fi
  printf '[ok] %s\n' "${file#${ROOT_DIR}/}"
}

verify_backfill_assets() {
  printf '\n== Backfill Assets ==\n'
  require_file "${ROOT_DIR}/infra/seeds/S0001__reference_seed.sql"
  require_file "${ROOT_DIR}/infra/seeds/S0002__demo_operational_seed.sql"
  require_file "${ROOT_DIR}/infra/seeds/templates/vehicles_import_template.csv"
  require_file "${ROOT_DIR}/infra/seeds/templates/drivers_import_template.csv"
  require_file "${ROOT_DIR}/infra/seeds/templates/vehicle_contracts_import_template.csv"
  require_file "${ROOT_DIR}/infra/seeds/templates/insurance_policies_import_template.csv"
  require_file "${ROOT_DIR}/infra/seeds/templates/passengers_import_template.csv"
  require_file "${ROOT_DIR}/infra/seeds/templates/addresses_import_template.csv"
}

verify_backfill_database() {
  printf '\n== Backfill Database ==\n'
  run_cmd pnpm db:verify
  run_sql \
    "seed lineage and baseline dataset" \
    "
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin.seed_runs WHERE seed_name = 'S0001__reference_seed'
  ) THEN
    RAISE EXCEPTION 'S0001__reference_seed has not been loaded';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM admin.seed_runs WHERE seed_name = 'S0002__demo_operational_seed'
  ) THEN
    RAISE EXCEPTION 'S0002__demo_operational_seed has not been loaded';
  END IF;
  IF (SELECT count(*) FROM core.tenants) = 0 THEN
    RAISE EXCEPTION 'core.tenants has no seeded rows';
  END IF;
  IF (SELECT count(*) FROM reg.vehicles) = 0 THEN
    RAISE EXCEPTION 'reg.vehicles has no seeded rows';
  END IF;
  IF (SELECT count(*) FROM reg.drivers) = 0 THEN
    RAISE EXCEPTION 'reg.drivers has no seeded rows';
  END IF;
  IF (SELECT count(*) FROM ops.orders) = 0 THEN
    RAISE EXCEPTION 'ops.orders has no seeded rows';
  END IF;
  IF (SELECT count(*) FROM crm.complaint_cases) = 0 THEN
    RAISE EXCEPTION 'crm.complaint_cases has no seeded rows';
  END IF;
  IF (SELECT count(*) FROM billing.driver_fee_plans) = 0 THEN
    RAISE EXCEPTION 'billing.driver_fee_plans has no seeded rows';
  END IF;
  IF (SELECT count(*) FROM admin.public_info_versions) = 0 THEN
    RAISE EXCEPTION 'admin.public_info_versions has no seeded rows';
  END IF;
  IF (SELECT count(*) FROM admin.placard_versions) = 0 THEN
    RAISE EXCEPTION 'admin.placard_versions has no seeded rows';
  END IF;
END
\$\$;

SELECT 'tenants' AS metric, count(*) AS value FROM core.tenants
UNION ALL
SELECT 'vehicles', count(*) FROM reg.vehicles
UNION ALL
SELECT 'drivers', count(*) FROM reg.drivers
UNION ALL
SELECT 'orders', count(*) FROM ops.orders
UNION ALL
SELECT 'complaint_cases', count(*) FROM crm.complaint_cases
UNION ALL
SELECT 'driver_fee_plans', count(*) FROM billing.driver_fee_plans
UNION ALL
SELECT 'public_info_versions', count(*) FROM admin.public_info_versions
UNION ALL
SELECT 'placard_versions', count(*) FROM admin.placard_versions
UNION ALL
SELECT 'report_jobs', count(*) FROM admin.report_jobs
UNION ALL
SELECT 'filing_packages', count(*) FROM admin.filing_packages
ORDER BY metric;
"
}

run_uat_gate() {
  printf '\n== UAT Gate ==\n'
  run_cmd pnpm db:verify
  run_cmd pnpm --filter @drts/contracts build
  run_cmd pnpm --filter @drts/contracts lint
  run_cmd pnpm --filter @drts/api typecheck
  run_cmd pnpm --filter @drts/api lint
  run_cmd pnpm test:unit
  run_cmd pnpm --filter @drts/api test
}

run_pilot_gate() {
  printf '\n== Pilot Metrics ==\n'
  run_sql \
    "pilot read models and reporting outputs" \
    "
DO \$\$
BEGIN
  IF to_regclass('admin.v_filing_vehicle_roster') IS NULL THEN
    RAISE EXCEPTION 'admin.v_filing_vehicle_roster missing';
  END IF;
END
\$\$;

SELECT 'dispatchable_vehicles' AS metric, count(*) AS value
FROM reg.v_vehicle_dispatch_readiness
WHERE dispatchable_flag = true
UNION ALL
SELECT 'dispatch_board_pending', count(*)::bigint
FROM ops.v_dispatch_board_pending
UNION ALL
SELECT 'complaint_export_rows', count(*)::bigint
FROM crm.v_complaint_export
UNION ALL
SELECT 'filing_vehicle_roster_rows', count(*)::bigint
FROM admin.v_filing_vehicle_roster
UNION ALL
SELECT 'completed_report_jobs', count(*)::bigint
FROM admin.report_jobs
WHERE status = 'completed'
UNION ALL
SELECT 'completed_filing_packages', count(*)::bigint
FROM admin.filing_packages
WHERE status = 'completed'
ORDER BY metric;
"
}

run_production_gate() {
  printf '\n== Production Build ==\n'
  run_cmd pnpm --filter @drts/contracts build
  run_cmd pnpm --filter @drts/api build
}

print_manual_flag_warning() {
  printf '\n[note] OpenAPI includes /api/admin/flags, but the current API runtime does not yet expose that controller.\n'
  printf '[note] Treat tenant/city/module rollout switches as manual coordination until the client rollout slice lands.\n'
}

run_backfill_stage() {
  verify_backfill_assets
  verify_backfill_database
}

run_uat_stage() {
  run_backfill_stage
  run_uat_gate
}

run_pilot_stage() {
  run_uat_stage
  run_pilot_gate
}

run_production_stage() {
  run_pilot_stage
  run_production_gate
}

case "$STAGE" in
  backfill)
    run_backfill_stage
    ;;
  uat)
    run_uat_stage
    ;;
  pilot)
    run_pilot_stage
    ;;
  production|all)
    run_production_stage
    ;;
esac

print_manual_flag_warning
printf '\n[done] phase1 rollout gate "%s" completed%s\n' \
  "$STAGE" \
  "$([[ "$DRY_RUN" -eq 1 ]] && printf ' (dry-run)')"
