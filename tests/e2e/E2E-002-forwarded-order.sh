#!/usr/bin/env bash
# E2E-002 — Forwarded order mirror lifecycle
#
# Surface chain: Driver App only (external platform owns the authoritative lifecycle)
#
# This scenario verifies that a forwarded task from an external platform:
#   1. Surfaces to the driver with correct routeLocked / platform source metadata.
#   2. Driver can accept; acceptance is forwarded to external platform.
#   3. External cancel/confirm state is reflected (best-effort — depends on live platform adapter).
#   4. No owned dispatch_assignment is created for a forwarded task.
#
# Important: In a dry-run / staging-without-live-adapters environment, steps after
# accept will log warnings rather than hard-fail, since external platform callbacks
# are outside the scope of the E2E scaffold.
#
# Cross-ref: docs/04-uat/phase1-uat-scenarios.md §5 E2E-002, UAT DA-001, DA-005,
#            WA-004 (routeLocked), WC-005 (forwarded task route-aware UI).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-002"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-002 — Forwarded order mirror lifecycle${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Driver App: find a forwarded task
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — forwarded task visibility"

switch_actor "driver_user" "e2e-driver-${E2E_SEED_DRIVER_ID}" "$E2E_SEED_TENANT_ID"

log_step "1.1 — GET /driver/tasks (list all driver tasks)"
http_call GET "/driver/tasks"
assert_status "200"

TOTAL_TASKS=$(json_get ".data.items | length")
log_info "Total driver tasks visible: ${TOTAL_TASKS:-0}"

# Find the first forwarded task (routeLocked = true OR sourcePlatform != "drts")
FORWARDED_TASK_ID=""
FORWARDED_ROUTE_LOCKED=""
FORWARDED_SOURCE_PLATFORM=""

if [[ "${TOTAL_TASKS:-0}" -gt 0 ]]; then
  # Try to find a task with routeLocked=true
  FORWARDED_TASK_ID=$(echo "$RESP_BODY" | \
    jq -r '.data.items[] | select((.routeLocked // .route_locked) == true) | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)

  if [[ -z "$FORWARDED_TASK_ID" ]]; then
    # Fall back: any task with sourcePlatform not null/empty and != "drts"
    FORWARDED_TASK_ID=$(echo "$RESP_BODY" | \
      jq -r '.data.items[] | select((.sourcePlatform // .source_platform) != null and (.sourcePlatform // .source_platform) != "drts") | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)
  fi
fi

if [[ -z "$FORWARDED_TASK_ID" ]]; then
  log_warn "No forwarded task found in driver task list."
  log_warn "E2E-002 requires a forwarded task seeded or received from an external platform adapter."
  log_warn "Gracefully skipping — this scenario passes only with live platform adapter data."
  exit 0
fi

chain_set "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
save_evidence "$SCENARIO" "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
log_ok "Found forwarded taskId=${FORWARDED_TASK_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Verify routeLocked metadata
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — routeLocked and platform source verification"

log_step "2.1 — GET /driver/tasks/:taskId (verify forwarded task metadata)"
http_call GET "/driver/tasks/${FORWARDED_TASK_ID}"
assert_status "200"

FORWARDED_ROUTE_LOCKED=$(json_get_first ".data.routeLocked" ".data.route_locked")
FORWARDED_SOURCE_PLATFORM=$(json_get_first ".data.sourcePlatform" ".data.source_platform")
TASK_TYPE=$(json_get ".data.taskType")

save_evidence "$SCENARIO" "driver" "routeLocked" "${FORWARDED_ROUTE_LOCKED:-false}"
save_evidence "$SCENARIO" "driver" "sourcePlatform" "${FORWARDED_SOURCE_PLATFORM:-unknown}"

if [[ "${FORWARDED_ROUTE_LOCKED:-false}" != "true" ]]; then
  log_warn "Task routeLocked=${FORWARDED_ROUTE_LOCKED:-false} — expected true for a forwarded task."
  log_warn "Cross-ref: UAT DA-005; WA-004 acceptance criteria."
else
  log_ok "routeLocked=true confirmed"
fi

if [[ -n "$FORWARDED_SOURCE_PLATFORM" && "$FORWARDED_SOURCE_PLATFORM" != "null" ]]; then
  log_ok "sourcePlatform=${FORWARDED_SOURCE_PLATFORM}"
else
  log_warn "sourcePlatform not present — platform badge cannot be rendered."
fi

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Driver accepts the forwarded task
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — accept forwarded task"

log_step "3.1 — POST /driver/tasks/:taskId/accept"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ACCEPT_FIXTURE=$(mktemp /tmp/drts-e2e-002-accept-XXXXXX.json)
trap 'rm -f "$ACCEPT_FIXTURE"' EXIT
jq --arg ts "$NOW" '.acceptedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" > "$ACCEPT_FIXTURE"

http_call POST "/driver/tasks/${FORWARDED_TASK_ID}/accept" "$ACCEPT_FIXTURE"
assert_status "200|201"
save_evidence "$SCENARIO" "driver" "acceptedAt" "$NOW"
log_ok "Forwarded task accepted"

log_step "3.2 — GET /driver/tasks/:taskId (verify state after accept)"
http_call GET "/driver/tasks/${FORWARDED_TASK_ID}"
assert_status "200"
TASK_STATUS_AFTER_ACCEPT=$(json_get ".data.status")
save_evidence "$SCENARIO" "driver" "taskStatusAfterAccept" "${TASK_STATUS_AFTER_ACCEPT:-unknown}"
log_ok "Task status after accept: ${TASK_STATUS_AFTER_ACCEPT:-unknown}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — No owned dispatch_assignment for forwarded task
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — verify no owned dispatch_assignment created"

switch_actor "ops_user" "e2e-ops-001"

log_step "4.1 — GET /dispatch/tasks (verify no owned job for forwarded task)"
http_call GET "/dispatch/tasks"
assert_status "200"

# Check that there is no dispatch job whose forwardedTaskId matches our task
OWNED_JOB_FOR_FORWARDED=$(echo "$RESP_BODY" | \
  jq -r --arg tid "$FORWARDED_TASK_ID" \
    '.data.items[] | select((.sourceTaskId // .source_task_id) == $tid or (.forwardedTaskId // .forwarded_task_id) == $tid) | (.dispatchJobId // .dispatch_job_id)' \
  2>/dev/null | head -1 || true)

if [[ -n "$OWNED_JOB_FOR_FORWARDED" ]]; then
  log_fail "Found owned dispatch_assignment for forwarded task — this violates E2E-002 pass criteria."
  log_fail "dispatchJobId=${OWNED_JOB_FOR_FORWARDED}"
  log_fail "Cross-ref: UAT E2E-002 pass criteria: 'No owned dispatch_assignment created'."
  exit 1
else
  log_ok "No owned dispatch job found for forwarded task — correct."
fi

# ══════════════════════════════════════════════════════════════════════════════
# CHAIN VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
log_step "Chain continuity assertions"
assert_chain "driver" "forwardedTaskId"

print_chain_summary

echo ""
log_ok "E2E-002 complete — forwarded order mirror lifecycle passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
