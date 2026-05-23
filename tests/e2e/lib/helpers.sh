#!/usr/bin/env bash
# Shared helpers for DRTS cross-surface E2E tests
# Source this file from each E2E scenario script.
#
# Extends the smoke-test helper pattern with:
#   - switch_actor()  — change the bootstrap auth context mid-scenario
#   - chain_set/get() — persist the ID-continuity chain across surfaces
#   - assert_chain()  — verify a chain entry is non-empty
#   - save_evidence() — append a named key/value to the evidence log for this run

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
E2E_API_URL="${E2E_API_URL:-${SMOKE_API_URL:-http://localhost:3001}}"
# NestJS global prefix. Set to "" when ingress already strips it.
E2E_API_PATH_PREFIX="${E2E_API_PATH_PREFIX:-/api}"
# Optional Cloud Run / ingress bearer token for private staging access.
E2E_AUTH_BEARER_TOKEN="${E2E_AUTH_BEARER_TOKEN:-}"
E2E_INTERNAL_KEY="${E2E_INTERNAL_KEY:-${SMOKE_INTERNAL_KEY:-${DRTS_INTERNAL_KEY:-}}}"

# ── Bootstrap auth (overridden per surface leg via switch_actor) ───────────────
# Defaults: platform_admin covers all routes; tests call switch_actor for
# narrower actor contexts.
E2E_ACTOR_TYPE="${E2E_ACTOR_TYPE:-platform_admin}"
E2E_ACTOR_ID="${E2E_ACTOR_ID:-e2e-platform-admin-001}"
E2E_REALM="${E2E_REALM:-}"          # derived from actor type when blank
E2E_TENANT_ID="${E2E_TENANT_ID:-}"  # set per-leg by switch_actor or caller
E2E_PARTNER_ID="${E2E_PARTNER_ID:-}"
E2E_PARTNER_PROGRAM_ID="${E2E_PARTNER_PROGRAM_ID:-}"
E2E_PARTNER_ENTRY_SLUG="${E2E_PARTNER_ENTRY_SLUG:-}"

# ── Seed data IDs — must match infra/seeds/S0002__demo_operational_seed.sql ───
# TEN_ACME tenant; 張司機 / ABC-1234 driver+vehicle pair.
E2E_SEED_TENANT_ID="${E2E_SEED_TENANT_ID:-10000000-0000-0000-0000-000000000201}"
E2E_SEED_DRIVER_ID="${E2E_SEED_DRIVER_ID:-10000000-0000-0000-0000-000000000381}"
E2E_SEED_VEHICLE_ID="${E2E_SEED_VEHICLE_ID:-10000000-0000-0000-0000-000000000351}"

# ── Timing ────────────────────────────────────────────────────────────────────
E2E_TIMEOUT="${E2E_TIMEOUT:-30}"
E2E_POLL_INTERVAL="${E2E_POLL_INTERVAL:-3}"
E2E_POLL_MAX="${E2E_POLL_MAX:-20}"

# ── Run-scoped state files ────────────────────────────────────────────────────
# Each scenario writes its own chain file so parallel runs don't collide.
_E2E_RUN_ID="${E2E_RUN_ID:-$$}"
CHAIN_FILE="${E2E_CHAIN_FILE:-/tmp/drts-e2e-chain-${_E2E_RUN_ID}.json}"
EVIDENCE_FILE="${E2E_EVIDENCE_FILE:-/tmp/drts-e2e-evidence-${_E2E_RUN_ID}.log}"
LAST_REQUEST_ID=""

# ── Colours ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'; MAGENTA='\033[0;35m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''; MAGENTA=''
fi

# ── Logging ───────────────────────────────────────────────────────────────────
log_info()    { echo -e "${CYAN}[INFO]${RESET}   $*"; }
log_ok()      { echo -e "${GREEN}[PASS]${RESET}   $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${RESET}   $*"; }
log_fail()    { echo -e "${RED}[FAIL]${RESET}   $*" >&2; }
log_step()    { echo -e "\n${BOLD}──── $* ────${RESET}"; }
log_surface() { echo -e "\n${MAGENTA}◆ SURFACE: $* ◆${RESET}"; }

# ── Actor switching ───────────────────────────────────────────────────────────
# switch_actor TYPE ACTOR_ID [TENANT_ID]
#   TYPE is one of:
#     system | platform_admin | tenant_admin | ops_user | driver_user | partner_api_key
#   TENANT_ID is required for tenant_admin; optional for others.
switch_actor() {
  E2E_ACTOR_TYPE="$1"
  E2E_ACTOR_ID="$2"
  E2E_TENANT_ID="${3:-}"
  E2E_REALM=""   # re-derived by http_call
  E2E_PARTNER_ID=""
  E2E_PARTNER_PROGRAM_ID=""
  E2E_PARTNER_ENTRY_SLUG=""
  log_info "Actor → type=${E2E_ACTOR_TYPE}, id=${E2E_ACTOR_ID}${E2E_TENANT_ID:+, tenantId=${E2E_TENANT_ID}}"
}

set_partner_context() {
  E2E_PARTNER_ID="${1:-}"
  E2E_PARTNER_PROGRAM_ID="${2:-}"
  E2E_PARTNER_ENTRY_SLUG="${3:-}"
  log_info "Partner context → partnerId=${E2E_PARTNER_ID:-<empty>}, programId=${E2E_PARTNER_PROGRAM_ID:-<empty>}, entrySlug=${E2E_PARTNER_ENTRY_SLUG:-<empty>}"
}

# ── HTTP helper ───────────────────────────────────────────────────────────────
# Usage: http_call METHOD PATH [BODY_FILE]
# Sets global: RESP_BODY  RESP_STATUS
http_call() {
  local method="$1"
  local path="$2"
  local body_file="${3:-}"
  local request_id
  request_id="e2e-$(date +%s%N | head -c 16)"
  LAST_REQUEST_ID="$request_id"

  local realm="${E2E_REALM:-}"
  if [[ -z "$realm" ]]; then
    case "${E2E_ACTOR_TYPE:-}" in
      system)         realm="system"   ;;
      platform_admin) realm="platform" ;;
      tenant_admin)   realm="tenant"   ;;
      ops_user)       realm="ops"      ;;
      driver_user)    realm="driver"   ;;
      partner_api_key) realm="partner" ;;
      *)              realm="system"   ;;
    esac
  fi

  local curl_args=(
    --silent --show-error
    --max-time "$E2E_TIMEOUT"
    --write-out "\n__HTTP_STATUS__%{http_code}"
    -X "$method"
    -H "Content-Type: application/json"
    -H "X-Request-ID: ${request_id}"
  )

  case "$method" in
    POST|PUT|PATCH|DELETE)
      curl_args+=(-H "Idempotency-Key: ${request_id}")
      ;;
  esac

  if [[ -n "$E2E_AUTH_BEARER_TOKEN" ]]; then
    curl_args+=(-H "Authorization: Bearer ${E2E_AUTH_BEARER_TOKEN}")
  fi

  if [[ -n "$E2E_INTERNAL_KEY" ]]; then
    curl_args+=(-H "x-drts-internal-key: ${E2E_INTERNAL_KEY}")
  fi

  if [[ -n "${E2E_ACTOR_TYPE:-}" ]]; then
    curl_args+=(
      -H "x-actor-type: ${E2E_ACTOR_TYPE}"
      -H "x-actor-id: ${E2E_ACTOR_ID:-e2e-actor-001}"
      -H "x-realm: ${realm}"
    )
    if [[ -n "${E2E_TENANT_ID:-}" ]]; then
      curl_args+=(-H "x-tenant-id: ${E2E_TENANT_ID}")
    fi
    if [[ -n "${E2E_PARTNER_ID:-}" ]]; then
      curl_args+=(-H "x-partner-id: ${E2E_PARTNER_ID}")
    fi
    if [[ -n "${E2E_PARTNER_PROGRAM_ID:-}" ]]; then
      curl_args+=(-H "x-partner-program-id: ${E2E_PARTNER_PROGRAM_ID}")
    fi
    if [[ -n "${E2E_PARTNER_ENTRY_SLUG:-}" ]]; then
      curl_args+=(-H "x-partner-entry-slug: ${E2E_PARTNER_ENTRY_SLUG}")
    fi
  fi

  if [[ -n "$body_file" ]]; then
    curl_args+=(--data "@$body_file")
  fi

  local raw
  raw=$(curl "${curl_args[@]}" "${E2E_API_URL}${E2E_API_PATH_PREFIX}${path}" 2>&1)

  RESP_STATUS=$(echo "$raw" | grep -o '__HTTP_STATUS__[0-9]*' | sed 's/__HTTP_STATUS__//')
  RESP_BODY=$(echo "$raw" | sed '/^__HTTP_STATUS__/d')
}

# Assert HTTP status is in the expected set (pipe-separated, e.g. "200|201")
assert_status() {
  local expected="$1"
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

# Extract the first non-empty JSON field from a list of jq expressions.
json_get_first() {
  local field value
  for field in "$@"; do
    value=$(json_get "$field")
    if [[ -n "$value" && "$value" != "null" ]]; then
      echo "$value"
      return 0
    fi
  done
  echo ""
}

# ── Chain helpers (ID continuity across surfaces) ─────────────────────────────
# chain_init — must be called once at the start of each scenario
chain_init() {
  echo '{}' > "$CHAIN_FILE"
  log_info "Chain initialised: ${CHAIN_FILE}"
}

# chain_set SURFACE KEY VALUE — record an ID from a given surface
chain_set() {
  local surface="$1" key="$2" value="$3"
  local tmp
  tmp=$(jq \
    --arg s "$surface" --arg k "$key" --arg v "$value" \
    '.[$s][$k] = $v' \
    "$CHAIN_FILE" 2>/dev/null \
    || jq --arg s "$surface" --arg k "$key" --arg v "$value" \
         '. + {($s): {($k): $v}}' "$CHAIN_FILE")
  echo "$tmp" > "$CHAIN_FILE"
  log_info "Chain [$surface] ${key}=${value}"
}

# chain_get SURFACE KEY — read an ID from the chain
chain_get() {
  local surface="$1" key="$2"
  jq -r --arg s "$surface" --arg k "$key" '.[$s][$k] // empty' "$CHAIN_FILE" 2>/dev/null || true
}

# assert_chain SURFACE KEY — fail if the chain entry is blank
assert_chain() {
  local surface="$1" key="$2"
  local val
  val=$(chain_get "$surface" "$key")
  if [[ -z "$val" ]]; then
    log_fail "Chain entry missing: [$surface].${key}"
    return 1
  fi
  log_ok  "Chain [$surface].${key} = ${val}"
}

# ── Evidence capture ──────────────────────────────────────────────────────────
# save_evidence SCENARIO SURFACE KEY VALUE
save_evidence() {
  local scenario="$1" surface="$2" key="$3" value="$4"
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | ${scenario} | ${surface} | ${key}=${value}" \
    >> "$EVIDENCE_FILE"
}

# ── Poll helper ───────────────────────────────────────────────────────────────
# poll_until_field PATH JSON_FIELD EXPECTED_VALUE
poll_until_field() {
  local path="$1" field="$2" expected="$3"
  local attempt=0

  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "$path"
    local actual
    actual=$(json_get ".data.${field}")
    if [[ "$actual" == "$expected" ]]; then
      return 0
    fi
    log_info "  poll $((attempt+1))/${E2E_POLL_MAX}: ${field}=${actual} (want ${expected})"
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  log_fail "Timed out waiting for ${field}=${expected} on ${path}"
  return 1
}

# ── Scenario summary ──────────────────────────────────────────────────────────
# print_chain_summary — emit the full chain at end of scenario
print_chain_summary() {
  echo -e "\n${BOLD}Chain summary:${RESET}"
  jq '.' "$CHAIN_FILE" 2>/dev/null || echo "(chain file not found)"
}
