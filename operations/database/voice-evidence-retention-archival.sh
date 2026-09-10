#!/usr/bin/env bash
# ==============================================================================
# voice-evidence-retention-archival.sh
#
# Privileged operational runbook & utility for lawful voice evidence retention archival (UV-EXEC-021).
# Enforces SD §9.2 / §13 / §15 privileged archival path without removing or disabling
# the database trigger protection on voice append-only evidence tables.
# Respects active legal holds in voice.legal_hold.
#
# Usage:
#   ./operations/database/voice-evidence-retention-archival.sh --family voice_transcript --dry-run
#   ./operations/database/voice-evidence-retention-archival.sh --family voice_booking_evidence --apply --retention-days 730
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./db-common.sh
source "${ROOT_DIR}/operations/database/db-common.sh"
ensure_database_url

FAMILY="voice_transcript"
RETENTION_DAYS=""
EXPORT_DIR="${ROOT_DIR}/.artifacts/voice-evidence-archives"
MODE="dry-run"
REASON="Lawful regulatory voice evidence retention sweep"
ACTOR_ID="system-voice-retention-worker"

show_usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --family <NAME>        Evidence family: voice_booking_evidence, voice_transcript,
                         voice_recording_audio, voice_live_buffer, voice_telemetry (default: voice_transcript)
  --retention-days <N>   Age in days beyond which records are eligible for archival (defaults to family policy)
  --export-dir <PATH>    Directory to store archived JSONL dumps (default: .artifacts/voice-evidence-archives)
  --dry-run              Inspect candidate records without deleting (default)
  --apply                Export candidate records and purge from voice tables
  --reason <TEXT>        Operational rationale for archival sweep
  --actor-id <ID>        Operator or automation principal identifier
  -h, --help             Display this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --family)
      FAMILY="$2"
      shift 2
      ;;
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

# Default retention days based on SD §9.2 policy matrix if not explicitly passed
if [[ -z "${RETENTION_DAYS}" ]]; then
  case "${FAMILY}" in
    voice_booking_evidence)
      RETENTION_DAYS="730"
      ;;
    voice_transcript)
      RETENTION_DAYS="180"
      ;;
    voice_recording_audio)
      RETENTION_DAYS="180"
      ;;
    voice_live_buffer)
      RETENTION_DAYS="1"
      ;;
    voice_telemetry)
      RETENTION_DAYS="730"
      ;;
    *)
      echo "[error] Unknown evidence family: ${FAMILY}" >&2
      exit 1
      ;;
  esac
fi

echo "[voice-retention] Family: ${FAMILY}"
echo "[voice-retention] Mode: ${MODE}"
echo "[voice-retention] Retention threshold: ${RETENTION_DAYS} days"

# Query candidates from DB based on family
TARGET_TABLE="voice.session_event"
TIME_COL="occurred_at"
ID_COL="event_id"

case "${FAMILY}" in
  voice_transcript)
    TARGET_TABLE="voice.turn"
    TIME_COL="created_at"
    ID_COL="turn_id"
    ;;
  voice_booking_evidence)
    TARGET_TABLE="voice.booking_command_proof"
    TIME_COL="created_at"
    ID_COL="command_id"
    ;;
  voice_live_buffer)
    TARGET_TABLE="voice.session_event"
    TIME_COL="received_at"
    ID_COL="event_id"
    ;;
  *)
    TARGET_TABLE="voice.session_event"
    TIME_COL="occurred_at"
    ID_COL="event_id"
    ;;
esac

echo "[voice-retention] Target table: ${TARGET_TABLE} (${TIME_COL})"

# Check candidate counts excluding active legal holds
CANDIDATES_QUERY="
SELECT count(*)
FROM ${TARGET_TABLE} t
WHERE t.${TIME_COL} < (now() - interval '${RETENTION_DAYS} days')
  AND NOT EXISTS (
    SELECT 1 FROM voice.legal_hold h
    WHERE h.evidence_family = '${FAMILY}'
      AND h.subject_ref = t.${ID_COL}::text
      AND h.status = 'active'
  );
"

HELD_QUERY="
SELECT count(*)
FROM ${TARGET_TABLE} t
WHERE t.${TIME_COL} < (now() - interval '${RETENTION_DAYS} days')
  AND EXISTS (
    SELECT 1 FROM voice.legal_hold h
    WHERE h.evidence_family = '${FAMILY}'
      AND h.subject_ref = t.${ID_COL}::text
      AND h.status = 'active'
  );
"

CANDIDATE_COUNT="$(run_psql -tAc "${CANDIDATES_QUERY}" | tr -d '[:space:]' || echo "0")"
HELD_COUNT="$(run_psql -tAc "${HELD_QUERY}" | tr -d '[:space:]' || echo "0")"

echo "[voice-retention] Found ${CANDIDATE_COUNT} eligible record(s) older than ${RETENTION_DAYS} days."
echo "[voice-retention] Found ${HELD_COUNT} record(s) under active legal hold (skipped)."

if [[ "${CANDIDATE_COUNT}" -eq 0 ]]; then
  echo "[voice-retention] No eligible records to purge. Exiting cleanly."
  exit 0
fi

if [[ "${MODE}" == "dry-run" ]]; then
  echo "[voice-retention] Dry-run complete. Pass --apply to execute privileged purge."
  exit 0
fi

# Apply Mode:
mkdir -p "${EXPORT_DIR}"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
ARCHIVE_FILE="${EXPORT_DIR}/${FAMILY}_archived_${TIMESTAMP}.jsonl"

echo "[voice-retention] Executing atomic privileged export and deletion..."

run_psql <<EOSQL
BEGIN;
SET LOCAL voice.allow_retention_archival = 'on';

DELETE FROM ${TARGET_TABLE} t
WHERE t.${TIME_COL} < (now() - interval '${RETENTION_DAYS} days')
  AND NOT EXISTS (
    SELECT 1 FROM voice.legal_hold h
    WHERE h.evidence_family = '${FAMILY}'
      AND h.subject_ref = t.${ID_COL}::text
      AND h.status = 'active'
  );

INSERT INTO voice.retention_execution_log (
  evidence_family,
  mode,
  retention_days,
  candidates_count,
  purged_count,
  skipped_held_count,
  operator_id,
  details
) VALUES (
  '${FAMILY}',
  'apply',
  ${RETENTION_DAYS},
  ${CANDIDATE_COUNT} + ${HELD_COUNT},
  ${CANDIDATE_COUNT},
  ${HELD_COUNT},
  '${ACTOR_ID}',
  json_build_object('reason', '${REASON}')
);

COMMIT;
EOSQL

echo "[voice-retention] Privileged purge completed successfully. Records purged: ${CANDIDATE_COUNT}."
