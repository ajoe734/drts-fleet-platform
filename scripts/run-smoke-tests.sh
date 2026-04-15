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
#   -t, --token TOKEN        Bearer auth token (default: $SMOKE_AUTH_TOKEN)
#       --tenant-id ID       Tenant ID used in billing/report fixtures (default: smoke-tenant-01)
#       --driver-id ID       Driver ID used in dispatch assign (default: smoke-driver-01)
#       --vehicle-id ID      Vehicle ID used in dispatch assign (default: smoke-vehicle-01)
#   -s, --suite PATTERN      Run only tests matching pattern (e.g. "02 05")
#   -v, --verbose            Print full response bodies on failure
#   -h, --help               Show this help
#
# Environment variables (override defaults):
#   SMOKE_API_URL            API base URL
#   SMOKE_AUTH_TOKEN         Bearer token
#   SMOKE_TENANT_ID
#   SMOKE_DRIVER_ID
#   SMOKE_VEHICLE_ID
#   SMOKE_TIMEOUT            Curl timeout per request in seconds (default: 30)
#   SMOKE_POLL_INTERVAL      Seconds between status polls (default: 3)
#   SMOKE_POLL_MAX           Max poll attempts (default: 20)
#
# Exit codes:
#   0  All tests passed
#   1  One or more tests failed
#   2  Argument error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="${SCRIPT_DIR}/../tests/smoke"
STATE_FILE="/tmp/drts-smoke-state-$$.json"
export SMOKE_STATE_FILE="$STATE_FILE"

# ── Defaults ──────────────────────────────────────────────────────────────────
export SMOKE_API_URL="${SMOKE_API_URL:-http://localhost:3001}"
export SMOKE_AUTH_TOKEN="${SMOKE_AUTH_TOKEN:-}"
export SMOKE_TENANT_ID="${SMOKE_TENANT_ID:-smoke-tenant-01}"
export SMOKE_DRIVER_ID="${SMOKE_DRIVER_ID:-smoke-driver-01}"
export SMOKE_VEHICLE_ID="${SMOKE_VEHICLE_ID:-smoke-vehicle-01}"
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
    -t|--token)      SMOKE_AUTH_TOKEN="$2"; shift 2 ;;
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
echo -e "  Auth token : ${SMOKE_AUTH_TOKEN:+(set)}${SMOKE_AUTH_TOKEN:-${YELLOW}(none)${RESET}}"
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
