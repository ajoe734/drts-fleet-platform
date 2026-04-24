#!/usr/bin/env bash
# DRTS Platform — Smoke Test Runner
#
# Runs the full critical-path smoke suite against a live staging (or local) API.
#
# Usage:
#   ./scripts/run-smoke-tests.sh [OPTIONS]
#
# Options:
#   -u, --api-url URL        API base URL (default: $SMOKE_API_URL or http://localhost:3001)
#       --actor-type TYPE     Bootstrap auth actor type (default: system)
#       --actor-id ID         Bootstrap auth actor ID (default: smoke-system-001)
#       --tenant-id ID        Tenant ID used in booking/billing/report fixtures
#       --driver-id ID        Driver ID used in dispatch assign
#       --vehicle-id ID       Vehicle ID used in dispatch assign
#   -s, --suite PATTERN      Run only tests matching pattern (e.g. "02|05")
#   -v, --verbose            Print full response bodies on failure
#   -h, --help               Show this help
#
# Environment variables (override defaults):
#   SMOKE_API_URL            API base URL (bare origin — no trailing slash, no /api suffix)
#   SMOKE_API_PATH_PREFIX    Path prefix prepended to every request (default: /api)
#   SMOKE_ACTOR_TYPE         Bootstrap auth actor type (x-actor-type header)
#   SMOKE_ACTOR_ID           Bootstrap auth actor ID (x-actor-id header)
#   SMOKE_REALM              Override realm derived from actor type (leave blank to auto-derive)
#   SMOKE_TENANT_ID          Tenant UUID (x-tenant-id header; must match S0002 seed)
#   SMOKE_INTERNAL_KEY       Optional x-drts-internal-key header for staging/internal envs
#   SMOKE_DRIVER_ID          Driver UUID (must match S0002 seed)
#   SMOKE_VEHICLE_ID         Vehicle UUID (must match S0002 seed)
#   SMOKE_TIMEOUT            Curl timeout per request in seconds (default: 30)
#   SMOKE_POLL_INTERVAL      Seconds between status polls (default: 3)
#   SMOKE_POLL_MAX           Max poll attempts for async jobs (default: 20)
#
# Auth model:
#   Protected staging can now sit behind Cloud IAP / OIDC.
#   Set SMOKE_AUTH_BEARER_TOKEN to satisfy the outer IAP boundary when targeting the
#   protected control-plane host. During the phased cutover, lib/helpers.sh still sends
#   bootstrap caller headers for the application-level identity path.
#   There is still no /api/auth/login endpoint for this smoke suite.
#   Use SMOKE_ACTOR_TYPE=system (default) for the full suite. The auth policy includes
#   the `system` realm for every protected smoke route, and the `system` preset includes
#   the required tenant/dispatch/driver/billing/report scopes.
#
# Exit codes:
#   0  All tests passed (or tests 03-04 gracefully skipped on empty DB)
#   1  One or more tests failed
#   2  Argument error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="${SCRIPT_DIR}/../tests/smoke"
STATE_FILE="/tmp/drts-smoke-state-$$.json"
export SMOKE_STATE_FILE="$STATE_FILE"

# ── Defaults ──────────────────────────────────────────────────────────────────
# Default to local direct API access. For the protected staging host, set
# SMOKE_AUTH_BEARER_TOKEN and point SMOKE_API_URL to the IAP host.
# Seed IDs must match infra/seeds/S0002__demo_operational_seed.sql.
export SMOKE_API_URL="${SMOKE_API_URL:-http://localhost:3001}"
export SMOKE_ACTOR_TYPE="${SMOKE_ACTOR_TYPE:-system}"
export SMOKE_ACTOR_ID="${SMOKE_ACTOR_ID:-smoke-system-001}"
export SMOKE_REALM="${SMOKE_REALM:-}"
export SMOKE_TENANT_ID="${SMOKE_TENANT_ID:-10000000-0000-0000-0000-000000000201}"   # TEN_ACME
export SMOKE_DRIVER_ID="${SMOKE_DRIVER_ID:-10000000-0000-0000-0000-000000000381}"   # 張司機
export SMOKE_VEHICLE_ID="${SMOKE_VEHICLE_ID:-10000000-0000-0000-0000-000000000351}" # ABC-1234
export SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-30}"
export SMOKE_POLL_INTERVAL="${SMOKE_POLL_INTERVAL:-3}"
export SMOKE_POLL_MAX="${SMOKE_POLL_MAX:-20}"

SUITE_PATTERN=""
VERBOSE=false

# ── Arg parsing ───────────────────────────────────────────────────────────────
usage() {
  awk 'NR==1{next} /^set -/{exit} /^#/{sub(/^# ?/,""); print}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--api-url)    SMOKE_API_URL="$2"; shift 2 ;;
    --actor-type)    SMOKE_ACTOR_TYPE="$2"; shift 2 ;;
    --actor-id)      SMOKE_ACTOR_ID="$2"; shift 2 ;;
    --tenant-id)     SMOKE_TENANT_ID="$2"; shift 2 ;;
    --driver-id)     SMOKE_DRIVER_ID="$2"; shift 2 ;;
    --vehicle-id)    SMOKE_VEHICLE_ID="$2"; shift 2 ;;
    -s|--suite)      SUITE_PATTERN="$2"; shift 2 ;;
    -v|--verbose)    VERBOSE=true; shift ;;
    -h|--help)       usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage 2 ;;
  esac
done

# ── Colour helpers ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────
for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}[ERROR]${RESET} Required command not found: ${cmd}" >&2
    exit 1
  fi
done

if [[ ! -d "$SMOKE_DIR" ]]; then
  echo -e "${RED}[ERROR]${RESET} Smoke test directory not found: ${SMOKE_DIR}" >&2
  exit 1
fi

# ── Setup ─────────────────────────────────────────────────────────────────────
echo '{}' > "$STATE_FILE"
trap 'rm -f "$STATE_FILE"' EXIT

# ── Collect test scripts ──────────────────────────────────────────────────────
mapfile -t ALL_TESTS < <(find "$SMOKE_DIR" -maxdepth 1 -name '[0-9][0-9]-*.sh' | sort)

if [[ ${#ALL_TESTS[@]} -eq 0 ]]; then
  echo -e "${YELLOW}[WARN]${RESET} No test scripts found in ${SMOKE_DIR}" >&2
  exit 0
fi

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  DRTS Platform — Smoke Test Suite${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "  API URL    : ${CYAN}${SMOKE_API_URL}${RESET}"
echo -e "  Tenant     : ${SMOKE_TENANT_ID}"
echo -e "  Driver     : ${SMOKE_DRIVER_ID}"
echo -e "  Vehicle    : ${SMOKE_VEHICLE_ID}"
if [[ -n "${SMOKE_AUTH_BEARER_TOKEN:-}" ]]; then
  auth_label="Bearer + bootstrap"
else
  auth_label="Bootstrap headers"
fi
echo -e "  Auth       : ${auth_label}"
echo -e "  Actor type : ${SMOKE_ACTOR_TYPE}"
echo -e "  Started    : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# ── Run tests ─────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; SKIP=0
declare -a FAILURES=()
START_TIME=$(date +%s)

for test_script in "${ALL_TESTS[@]}"; do
  test_name=$(basename "$test_script" .sh)

  # Filter by suite pattern if specified
  if [[ -n "$SUITE_PATTERN" ]] && ! echo "$test_name" | grep -qE "$SUITE_PATTERN"; then
    (( SKIP++ )) || true
    echo -e "${YELLOW}[SKIP]${RESET}  ${test_name}"
    continue
  fi

  # Run test in a subshell so failures don't abort the runner
  if bash "$test_script" 2>&1; then
    (( PASS++ )) || true
  else
    exit_code=$?
    (( FAIL++ )) || true
    FAILURES+=("$test_name")
    echo -e "${RED}[FAIL]${RESET}  ${test_name} (exit ${exit_code})"
    if $VERBOSE; then
      echo -e "       State: $(cat "$STATE_FILE" 2>/dev/null || echo '(empty)')"
    fi
  fi
done

END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Results${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "  ${GREEN}Passed${RESET} : ${PASS}"
echo -e "  ${RED}Failed${RESET} : ${FAIL}"
echo -e "  ${YELLOW}Skipped${RESET}: ${SKIP}"
echo -e "  Elapsed: ${ELAPSED}s"

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo ""
  echo -e "  ${RED}Failed tests:${RESET}"
  for f in "${FAILURES[@]}"; do
    echo -e "    • ${f}"
  done
fi

echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
