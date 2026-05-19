#!/usr/bin/env bash
# E2E-006 — Driver multi-platform owned + forwarded chain
#
# Surface chain:
#   Driver App (mixed inbox) ──► Driver App (owned vs forwarded detail) ──►
#   Ops Console (no-owned-assignment check) ──► Earnings API (by-platform)
#
# This scenario verifies that a mixed multi-platform driver view can:
#   1. Show at least one owned task and one forwarded task together.
#   2. Keep forwarded task routeLocked + sourcePlatform metadata intact.
#   3. Avoid creating an owned dispatch_assignment for the forwarded task.
#   4. Expose by-platform earnings breakdown through the platform earnings API.
#
# Environment note:
#   Mixed owned+forwarded visibility depends on seeded driver tasks or live
#   external-platform adapter data. When the environment lacks that mixed seed,
#   the scenario exits 0 with warnings instead of hard-failing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-006"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-006 — Driver multi-platform owned + forwarded chain${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

OWNED_TASK_ID=""
OWNED_TASK_STATUS=""
OWNED_SOURCE_PLATFORM=""
FORWARDED_TASK_ID=""
FORWARDED_TASK_STATUS=""
FORWARDED_SOURCE_PLATFORM=""
FORWARDED_ROUTE_LOCKED=""
FORWARDED_ACCEPTED_AT=""

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Driver App: mixed owned + forwarded visibility
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — mixed task inbox visibility"

switch_actor "driver_user" "e2e-driver-${E2E_SEED_DRIVER_ID}" "$E2E_SEED_TENANT_ID"

log_step "1.1 — GET /driver/tasks (find owned + forwarded tasks)"
http_call GET "/driver/tasks"
assert_status "200"

TOTAL_TASKS=$(json_get ".data.items | length")
log_info "Total driver tasks visible: ${TOTAL_TASKS:-0}"

OWNED_TASK_ID=$(echo "$RESP_BODY" | \
  jq -r '.data.items[] | select(((.sourcePlatform // .source_platform) == null) or ((.sourcePlatform // .source_platform) == "drts")) | (.taskId // .task_id)' \
    2>/dev/null | head -1 || true)
FORWARDED_TASK_ID=$(echo "$RESP_BODY" | \
  jq -r '.data.items[] | select(((.sourcePlatform // .source_platform) != null) and ((.sourcePlatform // .source_platform) != "drts")) | (.taskId // .task_id)' \
    2>/dev/null | head -1 || true)

if [[ -z "$OWNED_TASK_ID" || -z "$FORWARDED_TASK_ID" ]]; then
  log_warn "E2E-006 requires one owned task and one forwarded task in the same driver inbox."
  log_warn "ownedTaskId=${OWNED_TASK_ID:-<missing>} forwardedTaskId=${FORWARDED_TASK_ID:-<missing>}"
  log_warn "Gracefully skipping — mixed multi-platform seed data is not available in this environment."
  exit 0
fi

chain_set "driver" "ownedTaskId" "$OWNED_TASK_ID"
chain_set "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
save_evidence "$SCENARIO" "driver" "ownedTaskId" "$OWNED_TASK_ID"
save_evidence "$SCENARIO" "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
log_ok "Found ownedTaskId=${OWNED_TASK_ID} and forwardedTaskId=${FORWARDED_TASK_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Driver App: distinguish owned vs forwarded detail
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — owned vs forwarded task detail"

log_step "2.1 — GET /driver/tasks/:ownedTaskId"
http_call GET "/driver/tasks/${OWNED_TASK_ID}"
assert_status "200"

OWNED_TASK_STATUS=$(json_get_first ".data.status" ".data.taskStatus")
OWNED_SOURCE_PLATFORM=$(json_get_first ".data.sourcePlatform" ".data.source_platform")
OWNED_ROUTE_LOCKED=$(json_get_first ".data.routeLocked" ".data.route_locked")

save_evidence "$SCENARIO" "driver" "ownedTaskStatus" "${OWNED_TASK_STATUS:-unknown}"
save_evidence "$SCENARIO" "driver" "ownedSourcePlatform" "${OWNED_SOURCE_PLATFORM:-drts}"

if [[ -n "$OWNED_SOURCE_PLATFORM" && "$OWNED_SOURCE_PLATFORM" != "null" && "$OWNED_SOURCE_PLATFORM" != "drts" ]]; then
  log_fail "Expected owned task sourcePlatform to be null/drts, got ${OWNED_SOURCE_PLATFORM}"
  exit 1
fi

if [[ "${OWNED_ROUTE_LOCKED:-false}" == "true" ]]; then
  log_warn "Owned task surfaced with routeLocked=true; continuing, but this blurs owned vs forwarded authority."
else
  log_ok "Owned task keeps local authority metadata"
fi

log_step "2.2 — GET /driver/tasks/:forwardedTaskId"
http_call GET "/driver/tasks/${FORWARDED_TASK_ID}"
assert_status "200"

FORWARDED_TASK_STATUS=$(json_get_first ".data.status" ".data.taskStatus")
FORWARDED_SOURCE_PLATFORM=$(json_get_first ".data.sourcePlatform" ".data.source_platform")
FORWARDED_ROUTE_LOCKED=$(json_get_first ".data.routeLocked" ".data.route_locked")

save_evidence "$SCENARIO" "driver" "forwardedTaskStatus" "${FORWARDED_TASK_STATUS:-unknown}"
save_evidence "$SCENARIO" "driver" "forwardedSourcePlatform" "${FORWARDED_SOURCE_PLATFORM:-unknown}"
save_evidence "$SCENARIO" "driver" "forwardedRouteLocked" "${FORWARDED_ROUTE_LOCKED:-false}"

if [[ -z "$FORWARDED_SOURCE_PLATFORM" || "$FORWARDED_SOURCE_PLATFORM" == "null" || "$FORWARDED_SOURCE_PLATFORM" == "drts" ]]; then
  log_fail "Expected forwarded task to carry non-DRTS sourcePlatform metadata."
  exit 1
fi

if [[ "${FORWARDED_ROUTE_LOCKED:-false}" != "true" ]]; then
  log_fail "Expected forwarded task routeLocked=true, got ${FORWARDED_ROUTE_LOCKED:-false}"
  exit 1
fi

chain_set "driver" "forwardedSourcePlatform" "$FORWARDED_SOURCE_PLATFORM"
log_ok "Forwarded task routeLocked=true, sourcePlatform=${FORWARDED_SOURCE_PLATFORM}"

log_step "2.3 — POST /driver/tasks/:forwardedTaskId/accept (when pending)"
if [[ "${FORWARDED_TASK_STATUS:-}" == "pending_acceptance" ]]; then
  FORWARDED_ACCEPTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  ACCEPT_FIXTURE=$(mktemp /tmp/drts-e2e-006-accept-XXXXXX.json)
  trap 'rm -f "$ACCEPT_FIXTURE"' EXIT
  jq --arg ts "$FORWARDED_ACCEPTED_AT" '.acceptedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" > "$ACCEPT_FIXTURE"

  http_call POST "/driver/tasks/${FORWARDED_TASK_ID}/accept" "$ACCEPT_FIXTURE"
  assert_status "200|201"
  save_evidence "$SCENARIO" "driver" "forwardedAcceptedAt" "$FORWARDED_ACCEPTED_AT"
  log_ok "Forwarded task accepted"

  log_step "2.4 — GET /driver/tasks/:forwardedTaskId (verify state after accept)"
  http_call GET "/driver/tasks/${FORWARDED_TASK_ID}"
  assert_status "200"
  FORWARDED_TASK_STATUS=$(json_get_first ".data.status" ".data.taskStatus")
  save_evidence "$SCENARIO" "driver" "forwardedTaskStatusAfterAccept" "${FORWARDED_TASK_STATUS:-unknown}"
  log_ok "Forwarded task status after accept: ${FORWARDED_TASK_STATUS:-unknown}"
else
  log_warn "Forwarded task status=${FORWARDED_TASK_STATUS:-unknown}; skipping accept mutation because it is not pending_acceptance."
fi

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Ops Console: forwarded task must not create owned assignment
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — no-owned-assignment check"

switch_actor "ops_user" "e2e-ops-001"

log_step "3.1 — GET /dispatch/tasks"
http_call GET "/dispatch/tasks"
assert_status "200"

OWNED_JOB_FOR_FORWARDED=$(echo "$RESP_BODY" | \
  jq -r --arg tid "$FORWARDED_TASK_ID" \
    '.data.items[] | select((.sourceTaskId // .source_task_id) == $tid or (.forwardedTaskId // .forwarded_task_id) == $tid) | (.dispatchJobId // .dispatch_job_id)' \
  2>/dev/null | head -1 || true)

if [[ -n "$OWNED_JOB_FOR_FORWARDED" ]]; then
  log_fail "Found owned dispatch_assignment for forwarded task ${FORWARDED_TASK_ID}: dispatchJobId=${OWNED_JOB_FOR_FORWARDED}"
  exit 1
fi

save_evidence "$SCENARIO" "ops" "forwardedOwnedAssignmentDetected" "false"
log_ok "No owned dispatch job found for forwarded task"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Earnings API: by-platform breakdown remains available
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — by-platform earnings breakdown"

log_step "4.1 — GET /platform-earnings/summary"
http_call GET "/platform-earnings/summary"
assert_status "200"

EARNINGS_DRIVER_ID=$(json_get ".data.driverId")
EARNINGS_TOTAL_NET=$(json_get ".data.totalNet.amountMinor")
save_evidence "$SCENARIO" "earnings" "driverId" "${EARNINGS_DRIVER_ID:-unknown}"
save_evidence "$SCENARIO" "earnings" "totalNetAmountMinor" "${EARNINGS_TOTAL_NET:-0}"
log_ok "Platform earnings summary driverId=${EARNINGS_DRIVER_ID:-unknown} totalNet=${EARNINGS_TOTAL_NET:-0}"

log_step "4.2 — GET /platform-earnings/by-platform"
http_call GET "/platform-earnings/by-platform"
assert_status "200"

PLATFORM_ITEM_COUNT=$(json_get ".data.items | length")
if [[ "${PLATFORM_ITEM_COUNT:-0}" -le 0 ]]; then
  log_fail "Expected at least one platform earnings item, got ${PLATFORM_ITEM_COUNT:-0}"
  exit 1
fi

PLATFORM_CODES=$(echo "$RESP_BODY" | jq -r '[.data.items[].platformCode] | join(",")' 2>/dev/null || true)
chain_set "earnings" "platformCodes" "${PLATFORM_CODES:-unknown}"
save_evidence "$SCENARIO" "earnings" "platformCodes" "${PLATFORM_CODES:-unknown}"
save_evidence "$SCENARIO" "earnings" "platformItemCount" "${PLATFORM_ITEM_COUNT:-0}"
log_ok "Platform earnings breakdown returned ${PLATFORM_ITEM_COUNT} items: ${PLATFORM_CODES:-unknown}"

# ══════════════════════════════════════════════════════════════════════════════
# CHAIN VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
log_step "Chain continuity assertions"
assert_chain "driver" "ownedTaskId"
assert_chain "driver" "forwardedTaskId"
assert_chain "driver" "forwardedSourcePlatform"
assert_chain "earnings" "platformCodes"

print_chain_summary

echo ""
log_ok "E2E-006 complete — driver multi-platform owned + forwarded chain passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
