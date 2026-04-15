#!/usr/bin/env bash
# Smoke test 03 — Dispatch assign
# Retrieves an open dispatch job (created by the booking in test 02) and
# manually assigns a driver + vehicle via POST /dispatch/assign.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

log_step "03 — Dispatch assign"

# ── 1. Find an open dispatch job ──────────────────────────────────────────────
http_call GET "/dispatch/tasks"
assert_status "200"

DISPATCH_JOB_ID=$(json_get ".data.items[0].dispatchJobId")
if [[ -z "$DISPATCH_JOB_ID" ]]; then
  log_warn "No open dispatch jobs found; skipping dispatch assign."
  log_warn "This is expected when staging DB is empty — seed a booking first."
  exit 0
fi

log_info "Found dispatchJobId=${DISPATCH_JOB_ID}"

# ── 2. List candidates (informational) ───────────────────────────────────────
http_call GET "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates"
assert_status "200"
CANDIDATE_COUNT=$(json_get ".data.items | length")
log_info "Candidate count for job: ${CANDIDATE_COUNT:-0}"

# ── 3. Assign ─────────────────────────────────────────────────────────────────
FIXTURE_TMP=$(mktemp /tmp/drts-smoke-dispatch-XXXXXX.json)
trap 'rm -f "$FIXTURE_TMP"' EXIT

jq \
  --arg jobId   "$DISPATCH_JOB_ID" \
  --arg vehicle "$SMOKE_VEHICLE_ID" \
  --arg driver  "$SMOKE_DRIVER_ID" \
  '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
  "${SCRIPT_DIR}/fixtures/dispatch-assign.json" > "$FIXTURE_TMP"

http_call POST "/dispatch/assign" "$FIXTURE_TMP"
assert_status "200|201"

TASK_ID=$(json_get ".data.taskId")
if [[ -z "$TASK_ID" ]]; then
  # Some implementations return the dispatchJobId on the assignment record
  TASK_ID=$(json_get ".data.dispatchJobId")
fi

state_set "dispatchJobId" "$DISPATCH_JOB_ID"
[[ -n "$TASK_ID" ]] && state_set "taskId" "$TASK_ID"

log_ok "POST /dispatch/assign → HTTP ${RESP_STATUS}, dispatchJobId=${DISPATCH_JOB_ID}"
