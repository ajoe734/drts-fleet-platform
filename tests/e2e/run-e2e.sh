#!/usr/bin/env bash
# run-e2e.sh — DRTS cross-surface E2E test suite runner
#
# Executes all E2E scenario scripts under tests/e2e/ and emits a pass/fail summary.
# Each scenario runs with a shared run ID so chain and evidence files are co-located.
#
# Usage:
#   ./tests/e2e/run-e2e.sh
#   ./tests/e2e/run-e2e.sh --suite 001          # run only E2E-001
#   ./tests/e2e/run-e2e.sh --suite 001,004       # run 001 and 004
#   ./tests/e2e/run-e2e.sh --suite 005           # run tenant-governance flow
#   ./tests/e2e/run-e2e.sh --dry-run             # list scenarios, no execution
#   ./tests/e2e/run-e2e.sh --help
#
# Environment:
#   E2E_API_URL          API bare origin (default: http://localhost:3001)
#   E2E_AUTH_BEARER_TOKEN Optional bearer token for private Cloud Run ingress
#   E2E_SEED_TENANT_ID   TEN_ACME seed tenant (default: S0002 UUID)
#   E2E_SEED_DRIVER_ID   張司機 seed driver   (default: S0002 UUID)
#   E2E_SEED_VEHICLE_ID  ABC-1234 seed vehicle (default: S0002 UUID)
#   (See tests/e2e/lib/helpers.sh for the full variable list)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Defaults ──────────────────────────────────────────────────────────────────
SUITE_FILTER=""   # comma-separated pattern list, e.g. "001,004"
DRY_RUN=false
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --suite LIST    Comma-separated scenario numbers to run (e.g. 001,004)
  --dry-run       List scenarios without executing
  --verbose       Show full scenario output even on success
  --help          Show this help
EOF
}

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --suite)   SUITE_FILTER="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 2 ;;
  esac
done

# ── Discover scenarios ────────────────────────────────────────────────────────
# Collect all E2E-NNN-*.sh files in alphabetical order
mapfile -t ALL_SCENARIOS < <(
  find "$SCRIPT_DIR" -maxdepth 1 -name 'E2E-*.sh' | sort
)

if [[ ${#ALL_SCENARIOS[@]} -eq 0 ]]; then
  echo -e "${YELLOW}No E2E scenario scripts found in ${SCRIPT_DIR}${RESET}"
  exit 0
fi

# Apply suite filter if given
SCENARIOS=()
for s in "${ALL_SCENARIOS[@]}"; do
  base=$(basename "$s")
  if [[ -z "$SUITE_FILTER" ]]; then
    SCENARIOS+=("$s")
  else
    IFS=',' read -ra FILTERS <<< "$SUITE_FILTER"
    for f in "${FILTERS[@]}"; do
      if echo "$base" | grep -q "E2E-${f}"; then
        SCENARIOS+=("$s")
        break
      fi
    done
  fi
done

if [[ ${#SCENARIOS[@]} -eq 0 ]]; then
  echo -e "${YELLOW}No scenarios match filter: ${SUITE_FILTER}${RESET}"
  exit 0
fi

# ── Dry-run mode ──────────────────────────────────────────────────────────────
if $DRY_RUN; then
  echo -e "${BOLD}E2E scenarios (dry-run):${RESET}"
  for s in "${SCENARIOS[@]}"; do
    echo "  $(basename "$s")"
  done
  exit 0
fi

# ── Run-scoped state files (shared across all scenarios in this run) ──────────
export E2E_RUN_ID="$$"
export E2E_CHAIN_FILE="/tmp/drts-e2e-chain-${E2E_RUN_ID}.json"
export E2E_EVIDENCE_FILE="/tmp/drts-e2e-evidence-${E2E_RUN_ID}.log"

echo '{}' > "$E2E_CHAIN_FILE"
: > "$E2E_EVIDENCE_FILE"

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  DRTS Cross-Surface E2E Suite${RESET}"
echo -e "${BOLD}  API: ${E2E_API_URL:-http://localhost:3001}${RESET}"
echo -e "${BOLD}  Bearer auth: $([[ -n ${E2E_AUTH_BEARER_TOKEN:-} ]] && echo enabled || echo disabled)${RESET}"
echo -e "${BOLD}  Run ID: ${E2E_RUN_ID}${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo ""

# ── Execute scenarios ─────────────────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0
FAILED_NAMES=()

for scenario in "${SCENARIOS[@]}"; do
  name=$(basename "$scenario" .sh)
  echo -e "${CYAN}▶ Running: ${name}${RESET}"

  # Run each scenario in a subshell so failures don't abort the runner
  set +e
  if $VERBOSE; then
    bash "$scenario"
    exit_code=$?
  else
    output=$(bash "$scenario" 2>&1)
    exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
      echo "$output"
    fi
  fi
  set -e

  if [[ $exit_code -eq 0 ]]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓ PASS${RESET}  ${name}"
  else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$name")
    echo -e "  ${RED}✗ FAIL${RESET}  ${name} (exit ${exit_code})"
  fi
  echo ""
done

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL=$(( PASS + FAIL + SKIP ))
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E Results: ${PASS}/${TOTAL} passed${RESET}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}  Failed scenarios:${RESET}"
  for n in "${FAILED_NAMES[@]}"; do
    echo -e "${RED}    - ${n}${RESET}"
  done
fi

echo ""
echo -e "  Chain file:    ${E2E_CHAIN_FILE}"
echo -e "  Evidence log:  ${E2E_EVIDENCE_FILE}"

if [[ -s "$E2E_EVIDENCE_FILE" ]]; then
  echo ""
  echo -e "${BOLD}Evidence capture:${RESET}"
  cat "$E2E_EVIDENCE_FILE"
fi

echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo ""

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
