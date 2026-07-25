#!/usr/bin/env bash
# S3-VERIFY-001 — reviewer-replayable bring-up for the attachment + latency runs.
#
# Brings up, in one command:
#   1. the controlled local provider endpoints (S3-compatible store + scanner)
#   2. a freshly migrated + seeded Postgres database, isolated by name so it
#      never clobbers the shared `drts_fleet_platform` dev database
#   3. the current-head API built from this worktree, with the Driver SOS
#      storage/scanner providers bound to the local endpoints
#
# then runs `verify-attachment-scan.sh` and/or `measure-alert-latency.sh`.
#
# HONESTY BOUNDARY: the object store and the malware scanner are LOCAL
# CONTROLLED ENDPOINTS. Everything this proves is repository-owned adapter,
# contract, checksum, persistence, and fail-closed/retry behaviour at runtime
# over real HTTP. It is NOT external-provider evidence and NOT production
# observability. See the evidence packet for what stays `blocked_ext`.
#
# Usage:
#   ./support/sidecars/S3-VERIFY-001/run-attachment-verification.sh attachments
#   ./support/sidecars/S3-VERIFY-001/run-attachment-verification.sh latency
#   SAMPLES=50 ./support/sidecars/S3-VERIFY-001/run-attachment-verification.sh latency
set -euo pipefail

MODE="${1:-attachments}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

# ── Isolation: dedicated DB + ports so parallel lanes are never disturbed ──────
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/drts_s3_verify_001}"
API_PORT="${API_PORT:-3971}"
S3_STUB_PORT="${S3_STUB_PORT:-3921}"
SCANNER_STUB_PORT="${SCANNER_STUB_PORT:-3922}"
export E2E_API_URL="${E2E_API_URL:-http://localhost:${API_PORT}}"
export API_PORT
export API_HOST="${API_HOST:-127.0.0.1}"

# ── Baseline API env (mirrors .github/workflows/ci-integ.yml e2e job) ─────────
export JWT_SECRET="${JWT_SECRET:-ci-e2e-secret}"
export JWT_ISSUER="${JWT_ISSUER:-drts-local}"
export JWT_AUDIENCE="${JWT_AUDIENCE:-drts-api}"
export CONTROLLED_DOWNLOAD_SIGNING_SECRET="${CONTROLLED_DOWNLOAD_SIGNING_SECRET:-ci-e2e-controlled-download-secret}"
export PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT="${PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT:-ci-e2e-alpha-ingress-key}"
export PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT="${PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT:-ci-e2e-beta-ingress-key}"

# ── Driver SOS provider binding -> local controlled endpoints ─────────────────
STUB_SCANNER_TOKEN="${STUB_SCANNER_TOKEN:-s3-verify-001-scanner-token}"
export STUB_SCANNER_TOKEN
export DRTS_ENV=local
export DRIVER_SOS_PROVIDER_ALLOW_HTTP_LOCAL=true
export DRIVER_SOS_ATTACHMENT_STORAGE_PROVIDER=s3-compatible
export DRIVER_SOS_S3_BUCKET="${DRIVER_SOS_S3_BUCKET:-drts-s3-verify-001}"
export DRIVER_SOS_S3_REGION="${DRIVER_SOS_S3_REGION:-us-east-1}"
export DRIVER_SOS_S3_ENDPOINT="http://127.0.0.1:${S3_STUB_PORT}"
export DRIVER_SOS_S3_FORCE_PATH_STYLE=true
export DRIVER_SOS_S3_ACCESS_KEY_ID="${DRIVER_SOS_S3_ACCESS_KEY_ID:-s3-verify-001-access-key}"
export DRIVER_SOS_S3_SECRET_ACCESS_KEY="${DRIVER_SOS_S3_SECRET_ACCESS_KEY:-s3-verify-001-secret-key}"
export DRIVER_SOS_ATTACHMENT_SCANNER_PROVIDER=https-json
export DRIVER_SOS_SCANNER_URL="http://127.0.0.1:${SCANNER_STUB_PORT}/scan"
export DRIVER_SOS_SCANNER_AUTH_TOKEN="$STUB_SCANNER_TOKEN"

API_LOG="${API_LOG:-/tmp/drts-s3-verify-api.log}"
STUB_LOG="${STUB_LOG:-/tmp/drts-s3-verify-stubs.log}"

# shellcheck source=../../../scripts/db-common.sh
source "${ROOT_DIR}/scripts/db-common.sh"

API_PID=""
STUB_PID=""
cleanup() {
  [[ -n "$API_PID" ]] && { kill -- "-${API_PID}" 2>/dev/null || kill "$API_PID" 2>/dev/null || true; }
  [[ -n "$STUB_PID" ]] && kill "$STUB_PID" 2>/dev/null || true
  sleep 1
}
trap cleanup EXIT

db_field() { node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(({name:u.pathname.slice(1),user:u.username,pass:u.password,host:u.hostname,port:u.port||'5432'})['$1'])"; }
DB_NAME="$(db_field name)"; DB_USER="$(db_field user)"; DB_PASS="$(db_field pass)"
DB_HOST="$(db_field host)"; DB_PORT="$(db_field port)"
ADMIN_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/postgres"

run_admin_psql() {
  if use_local_psql; then PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" "$@"; return; fi
  if postgres_service_running; then
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T -e PGPASSWORD="$DB_PASS" postgres psql -U "$DB_USER" -d postgres "$@"; return
  fi
  docker exec -i -e PGPASSWORD="$DB_PASS" "$(postgres_container_name)" psql -U "$DB_USER" -d postgres "$@"
}

echo "[bringup] resetting isolated database ${DB_NAME}"
run_admin_psql -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
run_admin_psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" >/dev/null
run_admin_psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME}\";" >/dev/null
pnpm db:migrate >/dev/null
pnpm db:seed >/dev/null
echo "[bringup] database migrated and seeded"

echo "[bringup] starting local controlled provider endpoints"
node "${ROOT_DIR}/support/sidecars/S3-VERIFY-001/attachment-provider-stubs.mjs" \
  "$S3_STUB_PORT" "$SCANNER_STUB_PORT" > "$STUB_LOG" 2>&1 &
STUB_PID=$!
sleep 1

echo "[bringup] building and starting current-head API on port ${API_PORT}"
pnpm --filter @drts/api build >/dev/null
setsid bash -c "pnpm --filter @drts/api start" > "$API_LOG" 2>&1 &
API_PID=$!
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "${E2E_API_URL}/health" 2>/dev/null)" = "200" ] && break
  sleep 2
done
if [ "$(curl -s -o /dev/null -w '%{http_code}' "${E2E_API_URL}/health" 2>/dev/null)" != "200" ]; then
  echo "[bringup] API failed to become healthy"; tail -n 40 "$API_LOG"; exit 1
fi
echo "[bringup] API healthy at ${E2E_API_URL}"
echo ""

case "$MODE" in
  attachments) exec "${ROOT_DIR}/support/sidecars/S3-VERIFY-001/verify-attachment-scan.sh" ;;
  latency)     exec "${ROOT_DIR}/support/sidecars/S3-VERIFY-001/measure-alert-latency.sh" ;;
  both)
    "${ROOT_DIR}/support/sidecars/S3-VERIFY-001/verify-attachment-scan.sh"
    exec "${ROOT_DIR}/support/sidecars/S3-VERIFY-001/measure-alert-latency.sh"
    ;;
  shell)       echo "[bringup] API is up; press Ctrl-C to tear down"; sleep infinity ;;
  *) echo "unknown mode: $MODE (want: attachments | latency | both | shell)" >&2; exit 2 ;;
esac
