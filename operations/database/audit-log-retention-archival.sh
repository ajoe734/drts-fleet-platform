#!/usr/bin/env bash
# ==============================================================================
# audit-log-retention-archival.sh
#
# Privileged operational runbook & utility for lawful audit log retention archival.
# Enforces GAP-CONF-03 privileged archival path without removing or disabling
# the database trigger protection on admin.audit_logs.
#
# Usage:
#   ./operations/database/audit-log-retention-archival.sh --dry-run [--retention-days 730]
#   ./operations/database/audit-log-retention-archival.sh --apply [--retention-days 730] [--export-dir ./archive]
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/operations/database/db-common.sh"
ensure_database_url

RETENTION_DAYS="730" # Default: 2 years -- 汽車運輸業管理規則 s91(4). Was 2555 (7 years),
                     # an unsourced default; audit logs are not accounting records, so the
                     # 商業會計法 s38 floors do not apply. See the evidence retention policy.
EXPORT_DIR="${ROOT_DIR}/.artifacts/audit-archives"
MODE="dry-run"
REASON="Lawful regulatory retention archival sweep"
ACTOR_ID="system-retention-worker"

show_usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --retention-days <N>   Age in days beyond which audit logs are eligible for archival (default: 730)
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

# A threshold is data, never SQL. Keep the existing operator-selected policy.
if [[ ! "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "[error] --retention-days must be a positive integer." >&2
  exit 1
fi

# COPY filenames are psql meta-command literals (not SQL variable expansion).
# Resolve the operator directory once and reject characters that would alter
# that literal. Spaces are supported. No source rows are touched on failure.
if [[ "${MODE}" == "apply" ]]; then
  mkdir -p "${EXPORT_DIR}"
  EXPORT_DIR="$(cd "${EXPORT_DIR}" && pwd)"
  if [[ "${EXPORT_DIR}" == *"'"* || "${EXPORT_DIR}" == *\\* || "${EXPORT_DIR}" == *$'\n'* || "${EXPORT_DIR}" == *$'\r'* ]]; then
    echo "[error] Archive directory cannot contain quotes, backslashes or newlines." >&2
    exit 1
  fi
  # Reserve a distinct file, including concurrent sweeps within the same second.
  umask 077
  ARCHIVE_FILE="$(mktemp "${EXPORT_DIR}/audit_logs_archived_$(date -u +%Y%m%d_%H%M%SZ)_XXXXXX.jsonl")"
  echo "[audit-retention] Archive destination: ${ARCHIVE_FILE}"
fi

# One psql invocation/transaction owns the cutoff and exact selected identities.
# The lock serializes concurrent audit/governance INSERTs with this sweep, so a
# newly accepted protection cannot race an age-only DELETE. V0080 is unchanged.
RESULT="$(
  set -e
  {
    cat <<'SQL'
BEGIN;
SQL
    if [[ "${MODE}" == "apply" ]]; then
      echo 'LOCK TABLE admin.audit_logs IN SHARE ROW EXCLUSIVE MODE;'
    fi
    cat "${ROOT_DIR}/operations/database/audit-log-retention-governance.sql"
    if [[ "${MODE}" == "apply" ]]; then
      cat <<SQL
-- CSV uses control delimiters absent from JSON text, preserving original JSONL
-- bytes (ordinary text COPY would double JSON backslashes).
\copy (SELECT json_build_object('audit_id', audit_id, 'actor_id', actor_id, 'actor_type', actor_type, 'tenant_id', tenant_id, 'module_name', module_name, 'action_name', action_name, 'resource_type', resource_type, 'resource_id', resource_id, 'old_value', old_value, 'new_value', new_value, 'request_id', request_id, 'ip_address', host(ip_address), 'user_agent', user_agent, 'hash_value', hash_value, 'created_at', created_at)::text FROM audit_retention_candidates ORDER BY created_at, audit_id) TO '${ARCHIVE_FILE}' WITH (FORMAT csv, DELIMITER E'\\x01', QUOTE E'\\x02')
CREATE TEMP TABLE audit_retention_verified (payload jsonb) ON COMMIT DROP;
\copy audit_retention_verified FROM '${ARCHIVE_FILE}' WITH (FORMAT csv, DELIMITER E'\\x01', QUOTE E'\\x02')
-- Compare the full multiset, including identity and all original archive fields.
DO \$verify\$
BEGIN
  IF EXISTS (
    (SELECT to_jsonb(c) - 'ip_address' || jsonb_build_object('ip_address', host(c.ip_address)) FROM audit_retention_candidates c
     EXCEPT ALL SELECT payload FROM audit_retention_verified)
    UNION ALL
    (SELECT payload FROM audit_retention_verified EXCEPT ALL
     SELECT to_jsonb(c) - 'ip_address' || jsonb_build_object('ip_address', host(c.ip_address)) FROM audit_retention_candidates c)
  ) THEN
    RAISE EXCEPTION 'Archive verification failed; source rows retained';
  END IF;
END;
\$verify\$;
SET LOCAL audit.allow_retention_archival = 'on';
DELETE FROM admin.audit_logs target
USING audit_retention_candidates archived
WHERE target.audit_id = archived.audit_id;
SQL
    fi
    cat <<'SQL'
SELECT count(*) FROM audit_retention_candidates;
COMMIT;
SQL
  } | run_psql -X -qAt -v ON_ERROR_STOP=1 -v "retention_days=${RETENTION_DAYS}"
)"

# With -qAt the only stdout result is the fixed candidate count, after COMMIT.
CANDIDATE_COUNT="$(echo "${RESULT}" | tr -d '[:space:]')"
if [[ ! "${CANDIDATE_COUNT}" =~ ^[0-9]+$ ]]; then
  echo "[error] Invalid archival transaction result; success unconfirmed." >&2
  exit 1
fi
if [[ "${CANDIDATE_COUNT}" -eq 0 ]]; then
  [[ "${MODE}" != "apply" ]] || rm -- "${ARCHIVE_FILE}"
  echo "[audit-retention] No records eligible for archival. Exiting cleanly."
elif [[ "${MODE}" == "dry-run" ]]; then
  echo "[audit-retention] Found ${CANDIDATE_COUNT} lawful audit record(s). Dry-run complete."
else
  echo "[audit-retention] Lawful retention purge completed successfully for ${CANDIDATE_COUNT} verified records."
fi
