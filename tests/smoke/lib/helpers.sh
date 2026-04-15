#!/usr/bin/env bash
# Shared helpers for DRTS smoke tests
# Source this file from each test script.

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SMOKE_API_URL="${SMOKE_API_URL:-http://localhost:3001}"
SMOKE_AUTH_TOKEN="${SMOKE_AUTH_TOKEN:-}"          # Bearer token — obtain via POST /api/auth/login before running
SMOKE_TENANT_ID="${SMOKE_TENANT_ID:-tenant-demo-001}"
SMOKE_DRIVER_ID="${SMOKE_DRIVER_ID:-drv-demo-001}"
SMOKE_VEHICLE_ID="${SMOKE_VEHICLE_ID:-veh-demo-001}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-30}"              # curl timeout per request (seconds)
SMOKE_POLL_INTERVAL="${SMOKE_POLL_INTERVAL:-3}"   # seconds between status polls
SMOKE_POLL_MAX="${SMOKE_POLL_MAX:-20}"            # max poll attempts

# State file shared across tests in the same run
STATE_FILE="${SMOKE_STATE_FILE:-/tmp/drts-smoke-state-$$.json}"

# ── Colours ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Logging ───────────────────────────────────────────────────────────────────
log_info()  { echo -e "${CYAN}[INFO]${RESET}  $*"; }
log_ok()    { echo -e "${GREEN}[PASS]${RESET}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_fail()  { echo -e "${RED}[FAIL]${RESET}  $*" >&2; }
log_step()  { echo -e "\n${BOLD}──── $* ────${RESET}"; }

# ── HTTP helper ───────────────────────────────────────────────────────────────
# Usage: http_call METHOD PATH [BODY_FILE]
# Sets global: RESP_BODY  RESP_STATUS
http_call() {
  local method="$1"
  local path="$2"
  local body_file="${3:-}"

  local curl_args=(
    --silent --show-error
    --max-time "$SMOKE_TIMEOUT"
    --write-out "\n__HTTP_STATUS__%{http_code}"
    -X "$method"
    -H "Content-Type: application/json"
    -H "X-Request-ID: smoke-$(date +%s%N | head -c 16)"
  )

  if [[ -n "$SMOKE_AUTH_TOKEN" ]]; then
    curl_args+=(-H "Authorization: Bearer $SMOKE_AUTH_TOKEN")
  fi

  if [[ -n "$body_file" ]]; then
    curl_args+=(--data "@$body_file")
  fi

  local raw
  raw=$(curl "${curl_args[@]}" "${SMOKE_API_URL}${path}" 2>&1)

  RESP_STATUS=$(echo "$raw" | grep -o '__HTTP_STATUS__[0-9]*' | sed 's/__HTTP_STATUS__//')
  RESP_BODY=$(echo "$raw" | sed '/^__HTTP_STATUS__/d')
}

# Assert HTTP status is in the expected set
assert_status() {
  local expected="$1"  # e.g. "200" or "200|201"
  if ! echo "$RESP_STATUS" | grep -qE "^(${expected})$"; then
    log_fail "Expected HTTP ${expected}, got ${RESP_STATUS}"
    log_fail "Body: ${RESP_BODY}"
    return 1
  fi
}

# Extract a JSON field with jq; return empty string if missing
json_get() {
  local field="$1"
  echo "$RESP_BODY" | jq -r "${field} // empty" 2>/dev/null || true
}

# ── State helpers ─────────────────────────────────────────────────────────────
state_init() {
  echo '{}' > "$STATE_FILE"
}

state_set() {
  local key="$1" value="$2"
  local tmp
  tmp=$(jq --arg k "$key" --arg v "$value" '.[$k] = $v' "$STATE_FILE")
  echo "$tmp" > "$STATE_FILE"
}

state_get() {
  local key="$1"
  jq -r --arg k "$key" '.[$k] // empty' "$STATE_FILE"
}

# ── Poll helper ───────────────────────────────────────────────────────────────
# poll_until_field PATH JSON_FIELD EXPECTED_VALUE
# Polls GET $PATH every $SMOKE_POLL_INTERVAL seconds until data.FIELD == EXPECTED_VALUE
poll_until_field() {
  local path="$1"
  local field="$2"
  local expected="$3"
  local attempt=0

  while (( attempt < SMOKE_POLL_MAX )); do
    http_call GET "$path"
    local actual
    actual=$(json_get ".data.${field}")
    if [[ "$actual" == "$expected" ]]; then
      return 0
    fi
    log_info "  poll $((attempt+1))/${SMOKE_POLL_MAX}: ${field}=${actual} (want ${expected})"
    sleep "$SMOKE_POLL_INTERVAL"
    (( attempt++ ))
  done

  log_fail "Timed out waiting for ${field}=${expected} on ${path}"
  return 1
}
