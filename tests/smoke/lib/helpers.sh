#!/usr/bin/env bash
# Shared helpers for DRTS smoke tests
# Source this file from each test script.

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SMOKE_API_URL="${SMOKE_API_URL:-http://localhost:3001}"
# Path prefix prepended to every path passed to http_call.
# The NestJS app mounts all non-health routes under the global prefix /api
# (see apps/api/src/main.ts: app.setGlobalPrefix("api", { exclude: ["health"] })).
# Set to empty string only when the ingress layer already strips the prefix.
SMOKE_API_PATH_PREFIX="${SMOKE_API_PATH_PREFIX:-/api}"

# Bootstrap auth — the API uses header-based bootstrap auth (x-actor-type / x-actor-id /
# x-realm / x-tenant-id / x-scopes).  No login endpoint exists.  Set the headers that
# match the endpoint group being tested.  Defaults cover the tenant+ops surface that the
# smoke suite exercises.  For tenant-scoped operations also set SMOKE_TENANT_ID.
# Auth realms derived from actor type automatically: platform_admin→platform,
# tenant_admin→tenant, ops_user→ops, driver_user→driver.
SMOKE_ACTOR_TYPE="${SMOKE_ACTOR_TYPE:-platform_admin}"
SMOKE_ACTOR_ID="${SMOKE_ACTOR_ID:-smoke-platform-admin-001}"
SMOKE_REALM="${SMOKE_REALM:-}"   # leave blank to derive from SMOKE_ACTOR_TYPE

# Seed data IDs — must match infra/seeds/S0002__demo_operational_seed.sql.
# TEN_ACME tenant; 張司機 / ABC-1234 driver+vehicle pair.
SMOKE_TENANT_ID="${SMOKE_TENANT_ID:-10000000-0000-0000-0000-000000000201}"
SMOKE_DRIVER_ID="${SMOKE_DRIVER_ID:-10000000-0000-0000-0000-000000000381}"
SMOKE_VEHICLE_ID="${SMOKE_VEHICLE_ID:-10000000-0000-0000-0000-000000000351}"
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

  # Derive realm from actor type when SMOKE_REALM is not explicitly set
  local realm="${SMOKE_REALM:-}"
  if [[ -z "$realm" ]]; then
    case "${SMOKE_ACTOR_TYPE:-}" in
      platform_admin) realm="platform" ;;
      tenant_admin)   realm="tenant"   ;;
      ops_user)       realm="ops"      ;;
      driver_user)    realm="driver"   ;;
      *)              realm="system"   ;;
    esac
  fi

  local curl_args=(
    --silent --show-error
    --max-time "$SMOKE_TIMEOUT"
    --write-out "\n__HTTP_STATUS__%{http_code}"
    -X "$method"
    -H "Content-Type: application/json"
    -H "X-Request-ID: smoke-$(date +%s%N | head -c 16)"
  )

  # Bootstrap auth headers — the API uses x-actor-type/x-actor-id/x-realm/x-tenant-id.
  if [[ -n "${SMOKE_ACTOR_TYPE:-}" ]]; then
    curl_args+=(
      -H "x-actor-type: ${SMOKE_ACTOR_TYPE}"
      -H "x-actor-id: ${SMOKE_ACTOR_ID:-smoke-actor-001}"
      -H "x-realm: ${realm}"
    )
    # Attach tenant context for tenant-scoped endpoints when a tenant ID is known
    if [[ -n "${SMOKE_TENANT_ID:-}" ]]; then
      curl_args+=(-H "x-tenant-id: ${SMOKE_TENANT_ID}")
    fi
  fi

  if [[ -n "$body_file" ]]; then
    curl_args+=(--data "@$body_file")
  fi

  local raw
  raw=$(curl "${curl_args[@]}" "${SMOKE_API_URL}${SMOKE_API_PATH_PREFIX}${path}" 2>&1)

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
