#!/usr/bin/env bash
# run-e2e-hermetic.sh — run each cross-surface E2E scenario in full isolation.
#
# WHY: run-e2e.sh executes every scenario against one long-lived API process and
# one shared database. Several Phase-1 modules keep in-memory read models, and
# scenarios mutate persistent rows (service products, eligibility matrix, partner
# entries, quota ledgers). Running them back-to-back lets earlier scenarios
# pollute later ones, so pass/fail flips with ordering. This wrapper resets the
# database and restarts the API before every scenario, giving a deterministic,
# gate-quality result.
#
# Usage:
#   ./tests/e2e/run-e2e-hermetic.sh                 # all scenarios
#   ./tests/e2e/run-e2e-hermetic.sh 005 011 015     # a subset
#
# Required environment:
#   DATABASE_URL   postgres connection string (default: local dev)
#   E2E_API_URL    API origin (default: http://localhost:3001)
# Optional environment:
#   API_START_CMD  command to (re)start the API in the background
#                  (default: pnpm --filter @drts/api start)
#   The partner ingress keys + CONTROLLED_DOWNLOAD_SIGNING_SECRET must already be
#   exported so the API and the scenarios agree on their values.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/drts_fleet_platform}"
export E2E_API_URL="${E2E_API_URL:-http://localhost:3001}"
API_START_CMD="${API_START_CMD:-pnpm --filter @drts/api start}"
API_PORT="${API_PORT:-3001}"
API_LOG="${API_LOG:-/tmp/drts-e2e-api.log}"

# Parse the db name/user/host/port from DATABASE_URL for the reset step.
db_field() { node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(({name:u.pathname.slice(1),user:u.username,pass:u.password,host:u.hostname,port:u.port||'5432'})['$1'])"; }
DB_NAME="$(db_field name)"; DB_USER="$(db_field user)"; DB_PASS="$(db_field pass)"; DB_HOST="$(db_field host)"; DB_PORT="$(db_field port)"
ADMIN_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/postgres"

SUITES=("$@")
if [[ ${#SUITES[@]} -eq 0 ]]; then
  SUITES=(001 002 003 004 005 006 007 008 009 010 011 012 013 014 015)
fi

API_PID=""
stop_api() {
  if [[ -n "$API_PID" ]]; then
    # Kill the whole process group of the API launcher (npm/pnpm spawns children).
    kill -- "-${API_PID}" >/dev/null 2>&1 || kill "$API_PID" >/dev/null 2>&1 || true
    API_PID=""
  fi
  if command -v fuser >/dev/null 2>&1; then fuser -k "${API_PORT}/tcp" >/dev/null 2>&1 || true; fi
  sleep 2
}

reset_db() {
  PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
  PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null
  PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};" >/dev/null
  pnpm db:migrate >/dev/null 2>&1
  pnpm db:seed >/dev/null 2>&1
}

start_api() {
  setsid bash -c "$API_START_CMD" > "$API_LOG" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "${E2E_API_URL}/health" 2>/dev/null)" = "200" ] && return 0
    sleep 2
  done
  echo "[hermetic] API failed to become healthy"; tail -n 40 "$API_LOG"; return 1
}

trap stop_api EXIT

PASS=(); FAIL=()
for s in "${SUITES[@]}"; do
  echo "──────── hermetic E2E-${s} ────────"
  stop_api
  reset_db
  if ! start_api; then FAIL+=("$s"); continue; fi
  if ./tests/e2e/run-e2e.sh --suite "$s"; then PASS+=("$s"); else FAIL+=("$s"); fi
done

echo "════════════════════════════════════════"
echo "[hermetic] PASS (${#PASS[@]}): ${PASS[*]:-none}"
echo "[hermetic] FAIL (${#FAIL[@]}): ${FAIL[*]:-none}"
[[ ${#FAIL[@]} -eq 0 ]] && exit 0 || exit 1
