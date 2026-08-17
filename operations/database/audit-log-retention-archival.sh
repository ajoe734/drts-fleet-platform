#!/usr/bin/env bash
# ==============================================================================
# audit-log-retention-archival.sh
#
# Privileged operational runbook & utility for lawful audit log retention archival.
# Enforces GAP-CONF-03 privileged archival path without removing or disabling
# the database trigger protection on admin.audit_logs.
#
# Usage:
#   ./operations/database/audit-log-retention-archival.sh --dry-run [--retention-days 2555]
#   ./operations/database/audit-log-retention-archival.sh --apply [--retention-days 2555] [--export-dir ./archive]
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/operations/database/db-common.sh"
ensure_database_url

RETENTION_DAYS="2555" # Default: 7 years
EXPORT_DIR="${ROOT_DIR}/.artifacts/audit-archives"
MODE="dry-run"
REASON="Lawful regulatory retention archival sweep"
ACTOR_ID="system-retention-worker"

show_usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --retention-days <N>   Age in days beyond which audit logs are eligible for archival (default: 2555)
  --export-dir <PATH>    Directory to store archived audit log dumps (default: .artifacts/audit-archives)
  --dry-run              Inspect and count candidate audit log records without deleting (default)
  --apply                Export candidate records and purge them from admin.audit_logs
  --reason <TEXT>        Operational rationale for archival execution
  --actor-id <ID>        Operator or automation principal identifier
  -h, --help             Display this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --export-dir)
      EXPORT_DIR="$2"
      shift 2
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --apply)
      MODE="apply"
      shift
      ;;
    --reason)
      REASON="$2"
      shift 2
      ;;
    --actor-id)
      ACTOR_ID="$2"
      shift 2
      ;;
    -h|--help)
      show_usage
      exit 0
      ;;
    *)
      echo "[error] Unknown argument: $1" >&2
      show_usage
      exit 1
      ;;
  esac
done

echo "[audit-retention] Mode: ${MODE}"
echo "[audit-retention] Retention threshold: ${RETENTION_DAYS} days"

CANDIDATE_COUNT="$(run_psql -tAc "
SELECT count(*)
FROM admin.audit_logs
WHERE created_at < (now() - interval '${RETENTION_DAYS} days');
")"

CANDIDATE_COUNT="$(echo "${CANDIDATE_COUNT}" | tr -d '[:space:]')"

echo "[audit-retention] Found ${CANDIDATE_COUNT} audit record(s) older than ${RETENTION_DAYS} days."

if [[ "${CANDIDATE_COUNT}" -eq 0 ]]; then
  echo "[audit-retention] No records eligible for archival. Exiting cleanly."
  exit 0
fi

if [[ "${MODE}" == "dry-run" ]]; then
  echo "[audit-retention] Dry-run complete. Pass --apply to perform export and privileged retention purge."
  exit 0
fi

# Apply Mode: Perform privileged export and transaction-scoped deletion
mkdir -p "${EXPORT_DIR}"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
ARCHIVE_FILE="${EXPORT_DIR}/audit_logs_archived_${TIMESTAMP}.jsonl"

echo "[audit-retention] Exporting ${CANDIDATE_COUNT} record(s) to ${ARCHIVE_FILE}..."

run_psql -tAc "
SELECT json_build_object(
  'audit_id', audit_id,
  'actor_id', actor_id,
  'actor_type', actor_type,
  'tenant_id', tenant_id,
  'module_name', module_name,
  'action_name', action_name,
  'resource_type', resource_type,
  'resource_id', resource_id,
  'old_value', old_value,
  'new_value', new_value,
  'request_id', request_id,
  'ip_address', host(ip_address),
  'user_agent', user_agent,
  'hash_value', hash_value,
  'created_at', created_at
)::text
FROM admin.audit_logs
WHERE created_at < (now() - interval '${RETENTION_DAYS} days')
ORDER BY created_at ASC;
" > "${ARCHIVE_FILE}"

EXPORTED_LINES="$(wc -l < "${ARCHIVE_FILE}" | tr -d '[:space:]')"
echo "[audit-retention] Exported ${EXPORTED_LINES} record(s) successfully."

echo "[audit-retention] Executing transaction-scoped privileged purge (SET LOCAL audit.allow_retention_archival = 'on')..."

run_psql <<SQL
BEGIN;

-- Enable privileged retention bypass only for this specific transaction
SET LOCAL audit.allow_retention_archival = 'on';

-- Delete aged audit records
DELETE FROM admin.audit_logs
WHERE created_at < (now() - interval '${RETENTION_DAYS} days');

COMMIT;
SQL

echo "[audit-retention] Lawful retention purge completed successfully for ${EXPORTED_LINES} records."
