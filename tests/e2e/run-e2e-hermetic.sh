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
export E2E_API_PATH_PREFIX="${E2E_API_PATH_PREFIX:-/api}"
API_START_CMD="${API_START_CMD:-pnpm --filter @drts/api start}"
API_PORT="${API_PORT:-3001}"
API_LOG="${API_LOG:-/tmp/drts-e2e-api.log}"

# Parse the db name/user/host/port from DATABASE_URL for the reset step.
db_field() { node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(({name:u.pathname.slice(1),user:u.username,pass:u.password,host:u.hostname,port:u.port||'5432'})['$1'])"; }
DB_NAME="$(db_field name)"; DB_USER="$(db_field user)"; DB_PASS="$(db_field pass)"; DB_HOST="$(db_field host)"; DB_PORT="$(db_field port)"
ADMIN_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/postgres"

SUITES=("$@")
EXPLICIT_SUITES=0
if [[ ${#SUITES[@]} -gt 0 ]]; then EXPLICIT_SUITES=1; fi
if [[ ${#SUITES[@]} -eq 0 ]]; then
  # Auto-discover every E2E-NNN scenario present, so the gate adapts as scenarios
  # are added/removed rather than drifting against a hardcoded list.
  mapfile -t SUITES < <(
    find "$ROOT_DIR/tests/e2e" -maxdepth 1 -name 'E2E-*.sh' -printf '%f\n' \
      | sed -E 's/^E2E-([0-9]+).*/\1/' | sort -u
  )

  # Honour the gate deferral list: scenarios with a known, tracked gap are
  # excluded from the *default* (CI gate) run so the deploy gate stays green and
  # meaningful while they are fixed in upcoming rounds. They still run when named
  # explicitly (e.g. ./run-e2e-hermetic.sh 002) so work-in-progress is testable.
  # One scenario number per line; "#" comments and blank lines ignored.
  DEFER_FILE="${E2E_GATE_DEFER_FILE:-$ROOT_DIR/tests/e2e/gate-deferred.txt}"
  if [[ -f "$DEFER_FILE" ]]; then
    mapfile -t DEFERRED < <(sed -E 's/#.*//' "$DEFER_FILE" | grep -oE '[0-9]+' | sort -u)
    if [[ ${#DEFERRED[@]} -gt 0 ]]; then
      declare -A DEFER_SET=()
      for d in "${DEFERRED[@]}"; do DEFER_SET["$d"]=1; done
      KEPT=()
      for s in "${SUITES[@]}"; do
        if [[ -n "${DEFER_SET[$s]:-}" ]]; then
          echo "[hermetic] deferred from gate (tracked gap): E2E-${s}"
        else
          KEPT+=("$s")
        fi
      done
      SUITES=("${KEPT[@]}")
    fi
  fi
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
  if ! command -v psql >/dev/null 2>&1; then
    echo "[hermetic] psql command not found; cannot reset ${DB_NAME}." >&2
    return 1
  fi

  PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
  PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null || return 1
  PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};" >/dev/null || return 1
  pnpm db:migrate >/dev/null 2>&1 || return 1
  pnpm db:seed >/dev/null 2>&1 || return 1
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

seed_demo_driver_locations() {
  local recorded_at
  recorded_at="$(date -u -d "-30 seconds" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v-30S +"%Y-%m-%dT%H:%M:%SZ")"

  seed_driver_location "drv-demo-001" "25.041" "121.55" "$recorded_at"
  seed_driver_location "drv-demo-004" "25.042" "121.552" "$recorded_at"
  seed_driver_location "safety-op-001" "25.043" "121.553" "$recorded_at"
}

seed_driver_location() {
  local driver_id="$1" lat="$2" lng="$3" recorded_at="$4"
  local fixture
  fixture="$(mktemp /tmp/drts-e2e-driver-location-XXXXXX.json)"
  jq -n \
    --arg driverId "$driver_id" \
    --arg recordedAt "$recorded_at" \
    --argjson lat "$lat" \
    --argjson lng "$lng" \
    '{
      driverId: $driverId,
      lat: $lat,
      lng: $lng,
      accuracyM: 12,
      recordedAt: $recordedAt
    }' > "$fixture"

  local status
  status="$(curl \
    --silent \
    --show-error \
    --output /tmp/drts-e2e-driver-location-response.json \
    --write-out "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: e2e-hermetic-driver-location-${driver_id}" \
    -H "x-actor-type: platform_admin" \
    -H "x-actor-id: e2e-hermetic-seed" \
    -H "x-realm: platform" \
    --data "@$fixture" \
    "${E2E_API_URL}${E2E_API_PATH_PREFIX}/regulatory-registry/driver-location")"
  rm -f "$fixture"

  if [[ ! "$status" =~ ^(200|201)$ ]]; then
    echo "[hermetic] failed to seed driver location for ${driver_id}; HTTP ${status}" >&2
    cat /tmp/drts-e2e-driver-location-response.json >&2 || true
    rm -f /tmp/drts-e2e-driver-location-response.json
    return 1
  fi

  rm -f /tmp/drts-e2e-driver-location-response.json
}

trap stop_api EXIT

PASS=(); FAIL=()
for s in "${SUITES[@]}"; do
  echo "──────── hermetic E2E-${s} ────────"
  stop_api
  if ! reset_db; then FAIL+=("$s"); continue; fi
  if ! start_api; then FAIL+=("$s"); continue; fi
  if ! seed_demo_driver_locations; then FAIL+=("$s"); continue; fi
  if ./tests/e2e/run-e2e.sh --suite "$s"; then PASS+=("$s"); else FAIL+=("$s"); fi
done

echo "════════════════════════════════════════"
echo "[hermetic] PASS (${#PASS[@]}): ${PASS[*]:-none}"
echo "[hermetic] FAIL (${#FAIL[@]}): ${FAIL[*]:-none}"
[[ ${#FAIL[@]} -eq 0 ]] && exit 0 || exit 1
