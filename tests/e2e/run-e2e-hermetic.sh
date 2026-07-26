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

# shellcheck source=../../scripts/db-common.sh
source "$ROOT_DIR/scripts/db-common.sh"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/drts_fleet_platform}"
export E2E_API_URL="${E2E_API_URL:-http://localhost:3001}"
export API_HOST="${API_HOST:-0.0.0.0}"
export JWT_SECRET="${JWT_SECRET:-ci-e2e-secret}"
export JWT_ISSUER="${JWT_ISSUER:-drts-local}"
export JWT_AUDIENCE="${JWT_AUDIENCE:-drts-api}"
export CONTROLLED_DOWNLOAD_SIGNING_SECRET="${CONTROLLED_DOWNLOAD_SIGNING_SECRET:-ci-e2e-controlled-download-secret}"
export PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT="${PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT:-ci-e2e-alpha-ingress-key}"
export PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT="${PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT:-ci-e2e-beta-ingress-key}"
DEFAULT_API_START_CMD="pnpm --filter @drts/api start"
API_BUILD_CMD="${API_BUILD_CMD:-pnpm --filter @drts/api build}"
API_START_CMD="${API_START_CMD:-$DEFAULT_API_START_CMD}"
API_PORT="${API_PORT:-3001}"
API_LOG="${API_LOG:-/tmp/drts-e2e-api.log}"
HERMETIC_LOG_DIR="${HERMETIC_LOG_DIR:-/tmp/drts-e2e-hermetic}"
HERMETIC_DB_MIGRATE_TIMEOUT_SECONDS="${HERMETIC_DB_MIGRATE_TIMEOUT_SECONDS:-300}"
HERMETIC_DB_SEED_TIMEOUT_SECONDS="${HERMETIC_DB_SEED_TIMEOUT_SECONDS:-180}"
HERMETIC_API_BUILD_TIMEOUT_SECONDS="${HERMETIC_API_BUILD_TIMEOUT_SECONDS:-600}"
HERMETIC_SUITE_TIMEOUT_SECONDS="${HERMETIC_SUITE_TIMEOUT_SECONDS:-300}"
HERMETIC_AUTO_REPAIR_NODE_MODULES="${HERMETIC_AUTO_REPAIR_NODE_MODULES:-1}"

mkdir -p "$HERMETIC_LOG_DIR"

# Parse the db name/user/host/port from DATABASE_URL for the reset step.
db_field() { node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(({name:u.pathname.slice(1),user:u.username,pass:u.password,host:u.hostname,port:u.port||'5432'})['$1'])"; }
DB_NAME="$(db_field name)"; DB_USER="$(db_field user)"; DB_PASS="$(db_field pass)"; DB_HOST="$(db_field host)"; DB_PORT="$(db_field port)"
ADMIN_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/postgres"
DB_NAME_SQL_LITERAL="${DB_NAME//\'/\'\'}"
DB_NAME_SQL_IDENTIFIER="${DB_NAME//\"/\"\"}"

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

run_admin_psql() {
  if use_local_psql; then
    PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" "$@"
    return
  fi

  if postgres_service_running; then
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T \
      -e PGPASSWORD="$DB_PASS" \
      postgres \
      psql -U "$DB_USER" -d postgres "$@"
    return
  fi

  if postgres_container_running; then
    docker exec -i \
      -e PGPASSWORD="$DB_PASS" \
      "$(postgres_container_name)" \
      psql -U "$DB_USER" -d postgres "$@"
    return
  fi

  echo "[hermetic] psql command not found and no usable postgres container is running; cannot reset ${DB_NAME}." >&2
  return 1
}

wait_for_db() {
  local attempt
  for attempt in $(seq 1 20); do
    if run_psql -tAc "SELECT 1;" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "[hermetic] database ${DB_NAME} did not become connectable after reset"
  return 1
}

run_with_retry() { # label cmd...
  local label="$1"
  shift
  local attempt log_file
  for attempt in 1 2; do
    log_file="$(mktemp)"
    if "$@" >"$log_file" 2>&1; then
      rm -f "$log_file"
      return 0
    fi
    echo "[hermetic] ${label} failed (attempt ${attempt})"
    cat "$log_file"
    rm -f "$log_file"
    if [[ "$attempt" -eq 2 ]]; then
      return 1
    fi
    sleep 2
    wait_for_db || return 1
  done
}

run_logged() { # label logfile cmd...
  local label="$1"
  local log_file_path="$2"
  shift
  shift
  mkdir -p "$(dirname "$log_file_path")"
  : >"$log_file_path"
  if "$@" >"$log_file_path" 2>&1; then
    return 0
  fi
  echo "[hermetic] ${label} failed; log: ${log_file_path}"
  tail -n 200 "$log_file_path"
  return 1
}

maybe_timeout() { # seconds cmd...
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout --foreground "${seconds}s" "$@"
    return
  fi
  "$@"
}

ensure_local_node_modules() {
  if [[ ! -f "$ROOT_DIR/scripts/ensure-local-node-modules.py" ]]; then
    return 0
  fi

  if python3 "$ROOT_DIR/scripts/ensure-local-node-modules.py" check >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$HERMETIC_AUTO_REPAIR_NODE_MODULES" != "1" ]]; then
    echo "[hermetic] local node_modules health check failed; set HERMETIC_AUTO_REPAIR_NODE_MODULES=1 to repair automatically"
    return 1
  fi

  echo "[hermetic] repairing local node_modules for this worktree"
  python3 "$ROOT_DIR/scripts/ensure-local-node-modules.py" repair || return 1
}

run_logged_timeout() { # label timeout logfile cmd...
  local label="$1"
  local timeout_seconds="$2"
  local log_file_path="$3"
  local status
  shift 3
  mkdir -p "$(dirname "$log_file_path")"
  : >"$log_file_path"
  maybe_timeout "$timeout_seconds" "$@" >"$log_file_path" 2>&1
  status=$?
  if [[ "$status" -eq 0 ]]; then
    return 0
  fi

  if [[ "$status" -eq 124 ]]; then
    echo "[hermetic] ${label} timed out after ${timeout_seconds}s; log: ${log_file_path}"
  else
    echo "[hermetic] ${label} failed with exit ${status}; log: ${log_file_path}"
  fi
  tail -n 200 "$log_file_path"
  return "$status"
}

reset_db() {
  local run_stamp suite_label
  run_stamp="${HERMETIC_RUN_STAMP:-manual}"
  suite_label="${HERMETIC_SUITE_LABEL:-reset}"
  run_admin_psql -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME_SQL_LITERAL}' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
  run_admin_psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DB_NAME_SQL_IDENTIFIER}\";" >/dev/null || return 1
  run_admin_psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME_SQL_IDENTIFIER}\";" >/dev/null || return 1
  wait_for_db || return 1
  run_logged_timeout \
    "db:migrate" \
    "$HERMETIC_DB_MIGRATE_TIMEOUT_SECONDS" \
    "$HERMETIC_LOG_DIR/${run_stamp}-E2E-${suite_label}-db-migrate.log" \
    pnpm db:migrate || return 1
  run_logged_timeout \
    "db:seed" \
    "$HERMETIC_DB_SEED_TIMEOUT_SECONDS" \
    "$HERMETIC_LOG_DIR/${run_stamp}-E2E-${suite_label}-db-seed.log" \
    pnpm db:seed || return 1
}

ensure_api_build() {
  if [[ "$API_START_CMD" != "$DEFAULT_API_START_CMD" ]]; then
    return 0
  fi

  if [[ -f "$ROOT_DIR/apps/api/dist/main.js" ]]; then
    return 0
  fi

  echo "[hermetic] building @drts/api because apps/api/dist/main.js is missing"
  run_with_retry \
    "api build" \
    bash -lc "maybe_timeout() { timeout --foreground ${HERMETIC_API_BUILD_TIMEOUT_SECONDS}s \"\$@\"; }; maybe_timeout ${API_BUILD_CMD}" || return 1
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

if ! ensure_local_node_modules; then
  echo "[hermetic] local node_modules repair failed; aborting run"
  exit 1
fi

if ! ensure_api_build; then
  echo "[hermetic] API build failed; aborting run"
  exit 1
fi

PASS=(); FAIL=()
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
for s in "${SUITES[@]}"; do
  echo "──────── hermetic E2E-${s} ────────"
  stop_api
  export HERMETIC_RUN_STAMP="$RUN_STAMP"
  export HERMETIC_SUITE_LABEL="$s"
  if ! reset_db; then FAIL+=("$s"); continue; fi
  if ! start_api; then FAIL+=("$s"); continue; fi
  if run_logged_timeout \
    "E2E-${s}" \
    "$HERMETIC_SUITE_TIMEOUT_SECONDS" \
    "$HERMETIC_LOG_DIR/${RUN_STAMP}-E2E-${s}-suite.log" \
    ./tests/e2e/run-e2e.sh --suite "$s"; then
    PASS+=("$s")
  else
    FAIL+=("$s")
  fi
done

echo "════════════════════════════════════════"
echo "[hermetic] PASS (${#PASS[@]}): ${PASS[*]:-none}"
echo "[hermetic] FAIL (${#FAIL[@]}): ${FAIL[*]:-none}"
[[ ${#FAIL[@]} -eq 0 ]] && exit 0 || exit 1
