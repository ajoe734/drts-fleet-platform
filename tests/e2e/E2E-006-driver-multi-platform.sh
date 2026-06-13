#!/usr/bin/env bash
# E2E-006 — Driver multi-platform owned + forwarded chain
#
# Surface chain:
#   Tenant/Ops seed setup -> Driver App owned inbox + forwarded task views ->
#   Ops Console no-owned-assignment guard -> Earnings API by-platform summary
#
# This scenario verifies that a realistic mixed driver workday can:
#   1. Create one DRTS-owned assignment and one forwarded sandbox offer for the
#      same seeded driver during the scenario, instead of relying on ambient data.
#   2. Show owned work through /driver/tasks and forwarded work through the
#      unified forwarded task-view surface.
#   3. Keep forwarded task routeLocked + sourcePlatform metadata intact.
#   4. Relay forwarded accept through the forwarder endpoint, never the owned
#      task endpoint.
#   5. Avoid creating an owned dispatch_assignment for forwarded work.
#   6. Expose by-platform earnings breakdown through the platform earnings API.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-006"
FORWARDER_SANDBOX_PLATFORM="forwarder_sandbox"

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-006 — Driver multi-platform owned + forwarded chain${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_FILES=()
cleanup_tmp() {
  if [[ ${#TMP_FILES[@]} -gt 0 ]]; then
    rm -f "${TMP_FILES[@]}"
  fi
}
trap cleanup_tmp EXIT

make_tmp() {
  local name="$1"
  local file
  file=$(mktemp "/tmp/${name}-XXXXXX.json")
  TMP_FILES+=("$file")
  echo "$file"
}

utc_plus() {
  local offset="$1"
  date -u -d "$offset" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v"${offset}" +"%Y-%m-%dT%H:%M:%SZ"
}

OWNED_BOOKING_ID=""
OWNED_ORDER_ID=""
OWNED_DISPATCH_JOB_ID=""
OWNED_TASK_ID=""
OWNED_TASK_STATUS=""
OWNED_SOURCE_PLATFORM=""
OWNED_ROUTE_LOCKED=""
MIXED_DRIVER_ID="${E2E_SEED_DRIVER_ID}"
MIXED_VEHICLE_ID="${E2E_SEED_VEHICLE_ID}"
FORWARDED_EXTERNAL_ORDER_ID="SBX-E2E-006-MIXED-${_E2E_RUN_ID}"
FORWARDED_MIRROR_ORDER_ID=""
FORWARDED_TASK_ID=""
FORWARDED_TASK_STATUS=""
FORWARDED_SOURCE_PLATFORM=""
FORWARDED_ROUTE_LOCKED=""
FORWARDED_ACTION_STATE=""
FORWARDED_ACCEPT_OUTCOME=""

create_owned_seed() {
  local booking_fixture dispatch_fixture assign_fixture
  local window_start window_end attempt

  log_surface "Seed setup — owned DRTS assignment"
  switch_actor "tenant_admin" "e2e-tenant-admin-006" "${E2E_SEED_TENANT_ID}"

  window_start=$(utc_plus "+1 hour")
  window_end=$(utc_plus "+2 hours")
  booking_fixture=$(make_tmp "drts-e2e-006-booking")
  jq \
    --arg ws "$window_start" \
    --arg we "$window_end" \
    '.reservationWindowStart = $ws
     | .reservationWindowEnd = $we
     | .passenger.name = "E2E-006 Owned Passenger"
     | .bookedBy.staffId = "e2e-006-staff"' \
    "${SCRIPT_DIR}/fixtures/e2e-booking-enterprise.json" > "$booking_fixture"

  log_step "0.1 — POST /tenant/bookings (owned seed)"
  http_call POST "/tenant/bookings" "$booking_fixture"
  assert_status "200|201"

  OWNED_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
  if [[ -z "$OWNED_BOOKING_ID" ]]; then
    log_fail "Owned seed bookingId missing from response."
    exit 1
  fi

  log_step "0.2 — GET /tenant/bookings/:bookingId (resolve orderId)"
  http_call GET "/tenant/bookings/${OWNED_BOOKING_ID}"
  assert_status "200"
  OWNED_ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
  if [[ -z "$OWNED_ORDER_ID" ]]; then
    log_fail "Owned seed booking read-back did not expose orderId."
    exit 1
  fi

  chain_set "seed" "ownedBookingId" "$OWNED_BOOKING_ID"
  chain_set "seed" "ownedOrderId" "$OWNED_ORDER_ID"
  save_evidence "$SCENARIO" "seed" "ownedBookingId" "$OWNED_BOOKING_ID"
  save_evidence "$SCENARIO" "seed" "ownedOrderId" "$OWNED_ORDER_ID"

  switch_actor "ops_user" "e2e-ops-006"
  dispatch_fixture=$(make_tmp "drts-e2e-006-dispatch")
  printf '%s\n' '{"mode":"auto"}' > "$dispatch_fixture"

  log_step "0.3 — POST /orders/:orderId/dispatch (owned seed)"
  http_call POST "/orders/${OWNED_ORDER_ID}/dispatch" "$dispatch_fixture"
  assert_status "200|201"
  OWNED_DISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")

  attempt=0
  while [[ -z "$OWNED_DISPATCH_JOB_ID" && $attempt -lt $E2E_POLL_MAX ]]; do
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: owned dispatch job not visible yet"
    sleep "$E2E_POLL_INTERVAL"
    http_call GET "/dispatch/tasks"
    assert_status "200"
    OWNED_DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$OWNED_ORDER_ID" \
      '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
      2>/dev/null | head -1 || true)
    attempt=$((attempt + 1))
  done

  if [[ -z "$OWNED_DISPATCH_JOB_ID" ]]; then
    log_fail "Owned seed dispatchJobId was not created for orderId=${OWNED_ORDER_ID}."
    exit 1
  fi

  chain_set "seed" "ownedDispatchJobId" "$OWNED_DISPATCH_JOB_ID"
  save_evidence "$SCENARIO" "seed" "ownedDispatchJobId" "$OWNED_DISPATCH_JOB_ID"

  log_step "0.4 — GET /dispatch/tasks/:dispatchJobId/candidates (resolve mixed driver)"
  http_call GET "/dispatch/tasks/${OWNED_DISPATCH_JOB_ID}/candidates"
  assert_status "200"

  CANDIDATE_COUNT=$(json_get ".data.items | length")
  CANDIDATE_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
  CANDIDATE_DRIVER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)

  if [[ -n "$CANDIDATE_VEHICLE_ID" ]]; then
    MIXED_VEHICLE_ID="$CANDIDATE_VEHICLE_ID"
  fi
  if [[ -n "$CANDIDATE_DRIVER_ID" ]]; then
    MIXED_DRIVER_ID="$CANDIDATE_DRIVER_ID"
  fi

  chain_set "seed" "mixedDriverId" "$MIXED_DRIVER_ID"
  chain_set "seed" "mixedVehicleId" "$MIXED_VEHICLE_ID"
  save_evidence "$SCENARIO" "seed" "candidateCount" "${CANDIDATE_COUNT:-0}"
  save_evidence "$SCENARIO" "seed" "mixedDriverId" "$MIXED_DRIVER_ID"
  save_evidence "$SCENARIO" "seed" "mixedVehicleId" "$MIXED_VEHICLE_ID"
  log_ok "Mixed work target driverId=${MIXED_DRIVER_ID}, vehicleId=${MIXED_VEHICLE_ID}, candidates=${CANDIDATE_COUNT:-0}"

  assign_fixture=$(make_tmp "drts-e2e-006-assign")
  jq \
    --arg jobId "$OWNED_DISPATCH_JOB_ID" \
    --arg vehicle "$MIXED_VEHICLE_ID" \
    --arg driver "$MIXED_DRIVER_ID" \
    '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
    "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$assign_fixture"

  log_step "0.5 — POST /dispatch/assign (owned seed to mixed driver)"
  http_call POST "/dispatch/assign" "$assign_fixture"
  assert_status "200|201"
  OWNED_TASK_ID=$(json_get_first ".data.taskId" ".data.task_id")

  if [[ -z "$OWNED_TASK_ID" ]]; then
    switch_actor "driver_user" "$MIXED_DRIVER_ID" "$E2E_SEED_TENANT_ID"
    http_call GET "/driver/tasks"
    assert_status "200"
    OWNED_TASK_ID=$(echo "$RESP_BODY" | jq -r --arg jobId "$OWNED_DISPATCH_JOB_ID" \
      '.data.items[] | select((.dispatchJobId // .dispatch_job_id) == $jobId) | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)
  fi

  if [[ -z "$OWNED_TASK_ID" ]]; then
    log_fail "Owned seed assignment did not produce a driver task."
    exit 1
  fi

  chain_set "driver" "ownedTaskId" "$OWNED_TASK_ID"
  save_evidence "$SCENARIO" "driver" "ownedTaskId" "$OWNED_TASK_ID"
  log_ok "Owned seed ready: bookingId=${OWNED_BOOKING_ID}, orderId=${OWNED_ORDER_ID}, taskId=${OWNED_TASK_ID}"
}

create_forwarded_seed() {
  local inbound_fixture broadcast_fixture attempt mirror_status

  log_surface "Seed setup — forwarded sandbox offer"
  switch_actor "ops_user" "e2e-ops-006"

  inbound_fixture=$(make_tmp "drts-e2e-006-forwarded-inbound")
  jq -n \
    --arg platformCode "$FORWARDER_SANDBOX_PLATFORM" \
    --arg externalOrderId "$FORWARDED_EXTERNAL_ORDER_ID" \
    '{
      platformCode: $platformCode,
      externalOrderId: $externalOrderId,
      payload: {
        serviceBucket: "standard_taxi",
        pickupAddress: "台北市信義區松仁路 100 號",
        dropoffAddress: "桃園國際機場 第一航廈",
        sandbox: true,
        scenario: "E2E-006",
        mixedDriverInbox: true
      }
    }' > "$inbound_fixture"

  broadcast_fixture=$(make_tmp "drts-e2e-006-forwarded-broadcast")
  jq -n --arg driverId "$MIXED_DRIVER_ID" \
    '{ candidateDriverIds: [$driverId] }' > "$broadcast_fixture"

  log_step "0.6 — POST /forwarder/orders/inbound (forwarded seed)"
  http_call POST "/forwarder/orders/inbound" "$inbound_fixture"
  assert_status "200|201"
  FORWARDED_MIRROR_ORDER_ID=$(json_get_first ".data.mirrorOrderId" ".data.mirror_order_id")
  if [[ -z "$FORWARDED_MIRROR_ORDER_ID" ]]; then
    log_fail "Forwarded seed mirrorOrderId missing from inbound response."
    exit 1
  fi

  log_step "0.7 — POST /forwarder/orders/:orderId/broadcast (to mixed driver)"
  http_call POST "/forwarder/orders/${FORWARDED_MIRROR_ORDER_ID}/broadcast" "$broadcast_fixture"
  assert_status "200|201"

  log_step "0.8 — GET /forwarder/orders (verify forwarded mirror row)"
  http_call GET "/forwarder/orders"
  assert_status "200"
  mirror_status=$(echo "$RESP_BODY" | jq -r --arg externalOrderId "$FORWARDED_EXTERNAL_ORDER_ID" \
    '.data.items[] | select((.externalOrderId // .external_order_id) == $externalOrderId) | .status' \
    2>/dev/null | head -1 || true)
  if [[ "$mirror_status" != "broadcasted" ]]; then
    log_fail "Expected forwarded mirror status broadcasted, got ${mirror_status:-empty}."
    exit 1
  fi

  chain_set "seed" "forwardedMirrorOrderId" "$FORWARDED_MIRROR_ORDER_ID"
  chain_set "seed" "forwardedExternalOrderId" "$FORWARDED_EXTERNAL_ORDER_ID"
  save_evidence "$SCENARIO" "seed" "forwardedMirrorOrderId" "$FORWARDED_MIRROR_ORDER_ID"
  save_evidence "$SCENARIO" "seed" "forwardedExternalOrderId" "$FORWARDED_EXTERNAL_ORDER_ID"

  switch_actor "driver_user" "$MIXED_DRIVER_ID" "$E2E_SEED_TENANT_ID"

  log_step "0.9 — GET /driver/task-views (resolve forwarded task)"
  attempt=0
  while [[ -z "$FORWARDED_TASK_ID" && $attempt -lt $E2E_POLL_MAX ]]; do
    http_call GET "/driver/task-views"
    assert_status "200"
    FORWARDED_TASK_ID=$(echo "$RESP_BODY" | jq -r --arg externalOrderId "$FORWARDED_EXTERNAL_ORDER_ID" \
      '.data.items[] | select((.externalOrderId // .external_order_id) == $externalOrderId) | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)
    if [[ -n "$FORWARDED_TASK_ID" ]]; then
      break
    fi
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: forwarded task not visible yet"
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  if [[ -z "$FORWARDED_TASK_ID" ]]; then
    log_fail "Forwarded seed task is not visible to driverId=${MIXED_DRIVER_ID}."
    exit 1
  fi

  chain_set "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
  save_evidence "$SCENARIO" "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
  log_ok "Forwarded seed ready: mirrorOrderId=${FORWARDED_MIRROR_ORDER_ID}, taskId=${FORWARDED_TASK_ID}"
}

# ══════════════════════════════════════════════════════════════════════════════
# LEG 0 — Build deterministic mixed driver work
# ══════════════════════════════════════════════════════════════════════════════
create_owned_seed
create_forwarded_seed

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Driver App: mixed owned + forwarded visibility
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — mixed owned + forwarded visibility"
switch_actor "driver_user" "$MIXED_DRIVER_ID" "$E2E_SEED_TENANT_ID"

log_step "1.1 — GET /driver/tasks (owned task inbox)"
http_call GET "/driver/tasks"
assert_status "200"

OWNED_VISIBLE=$(echo "$RESP_BODY" | jq -r --arg taskId "$OWNED_TASK_ID" \
  '.data.items[] | select((.taskId // .task_id) == $taskId) | (.taskId // .task_id)' \
  2>/dev/null | head -1 || true)
if [[ "$OWNED_VISIBLE" != "$OWNED_TASK_ID" ]]; then
  log_fail "Owned task ${OWNED_TASK_ID} is not visible through /driver/tasks."
  exit 1
fi

OWNED_TASK_COUNT=$(json_get ".data.items | length")
save_evidence "$SCENARIO" "driver" "ownedInboxTaskCount" "${OWNED_TASK_COUNT:-0}"
log_ok "Owned driver inbox contains taskId=${OWNED_TASK_ID}"

log_step "1.2 — GET /driver/task-views (forwarded task view)"
http_call GET "/driver/task-views"
assert_status "200"

FORWARDED_VISIBLE=$(echo "$RESP_BODY" | jq -r --arg taskId "$FORWARDED_TASK_ID" \
  '.data.items[] | select((.taskId // .task_id) == $taskId) | (.taskId // .task_id)' \
  2>/dev/null | head -1 || true)
if [[ "$FORWARDED_VISIBLE" != "$FORWARDED_TASK_ID" ]]; then
  log_fail "Forwarded task ${FORWARDED_TASK_ID} is not visible through /driver/task-views."
  exit 1
fi

FORWARDED_TASK_VIEW_COUNT=$(json_get ".data.items | length")
save_evidence "$SCENARIO" "driver" "forwardedTaskViewCount" "${FORWARDED_TASK_VIEW_COUNT:-0}"
save_evidence "$SCENARIO" "driver" "mixedSeedAvailable" "true"
log_ok "Forwarded driver task view contains taskId=${FORWARDED_TASK_ID}"

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
save_evidence "$SCENARIO" "driver" "ownedRouteLocked" "${OWNED_ROUTE_LOCKED:-false}"

if [[ -n "$OWNED_SOURCE_PLATFORM" && "$OWNED_SOURCE_PLATFORM" != "null" && "$OWNED_SOURCE_PLATFORM" != "drts" ]]; then
  log_fail "Expected owned task sourcePlatform to be null/drts, got ${OWNED_SOURCE_PLATFORM}."
  exit 1
fi

if [[ "${OWNED_ROUTE_LOCKED:-false}" == "true" ]]; then
  log_fail "Owned task must not be routeLocked=true."
  exit 1
fi

log_ok "Owned task keeps local DRTS authority metadata"

log_step "2.2 — GET /driver/task-views/:forwardedTaskId"
http_call GET "/driver/task-views/${FORWARDED_TASK_ID}"
assert_status "200"

FORWARDED_TASK_STATUS=$(json_get_first ".data.localStatus" ".data.local_status" ".data.status" ".data.taskStatus" ".data.task_status")
FORWARDED_SOURCE_PLATFORM=$(json_get_first ".data.sourcePlatform" ".data.source_platform")
FORWARDED_ROUTE_LOCKED=$(json_get_first ".data.routeLocked" ".data.route_locked")
FORWARDED_ACTION_STATE=$(json_get_first ".data.driverActionState" ".data.driver_action_state" ".data.actionState" ".data.action_state")

save_evidence "$SCENARIO" "driver" "forwardedTaskStatus" "${FORWARDED_TASK_STATUS:-unknown}"
save_evidence "$SCENARIO" "driver" "forwardedSourcePlatform" "${FORWARDED_SOURCE_PLATFORM:-unknown}"
save_evidence "$SCENARIO" "driver" "forwardedRouteLocked" "${FORWARDED_ROUTE_LOCKED:-false}"
save_evidence "$SCENARIO" "driver" "forwardedActionState" "${FORWARDED_ACTION_STATE:-unknown}"

if [[ "$FORWARDED_SOURCE_PLATFORM" != "$FORWARDER_SANDBOX_PLATFORM" ]]; then
  log_fail "Expected forwarded task sourcePlatform=${FORWARDER_SANDBOX_PLATFORM}, got ${FORWARDED_SOURCE_PLATFORM:-empty}."
  exit 1
fi

if [[ "${FORWARDED_ROUTE_LOCKED:-false}" != "true" ]]; then
  log_fail "Expected forwarded task routeLocked=true, got ${FORWARDED_ROUTE_LOCKED:-false}."
  exit 1
fi

chain_set "driver" "forwardedSourcePlatform" "$FORWARDED_SOURCE_PLATFORM"
log_ok "Forwarded task routeLocked=true, sourcePlatform=${FORWARDED_SOURCE_PLATFORM}"

log_step "2.3 — POST /driver/forwarded-orders/:forwardedTaskId/accept"
FORWARDED_ACCEPT_FIXTURE=$(make_tmp "drts-e2e-006-forwarded-accept")
jq -n --arg driverId "$MIXED_DRIVER_ID" '{ driverId: $driverId }' > "$FORWARDED_ACCEPT_FIXTURE"
http_call POST "/driver/forwarded-orders/${FORWARDED_TASK_ID}/accept" "$FORWARDED_ACCEPT_FIXTURE"
assert_status "200|201"

FORWARDED_ACCEPT_OUTCOME=$(json_get ".data.outcome")
FORWARDED_ACCEPT_MIRROR_ORDER_ID=$(json_get_first ".data.managementCorrelationIds.mirrorOrderId" ".data.management_correlation_ids.mirror_order_id")
save_evidence "$SCENARIO" "driver" "forwardedAcceptOutcome" "${FORWARDED_ACCEPT_OUTCOME:-unknown}"

if [[ "$FORWARDED_ACCEPT_OUTCOME" != "accept_pending" ]]; then
  log_fail "Expected forwarded accept outcome accept_pending, got ${FORWARDED_ACCEPT_OUTCOME:-empty}."
  exit 1
fi

if [[ "$FORWARDED_ACCEPT_MIRROR_ORDER_ID" != "$FORWARDED_MIRROR_ORDER_ID" ]]; then
  log_fail "Forwarded accept mirrorOrderId mismatch: expected ${FORWARDED_MIRROR_ORDER_ID}, got ${FORWARDED_ACCEPT_MIRROR_ORDER_ID:-empty}."
  exit 1
fi

log_ok "Forwarded accept relay acknowledged with outcome=${FORWARDED_ACCEPT_OUTCOME}"

log_step "2.4 — GET /driver/task-views/:forwardedTaskId (verify accept_pending)"
http_call GET "/driver/task-views/${FORWARDED_TASK_ID}"
assert_status "200"

FORWARDED_TASK_STATUS=$(json_get_first ".data.localStatus" ".data.local_status" ".data.status" ".data.taskStatus" ".data.task_status")
FORWARDED_ACTION_STATE=$(json_get_first ".data.driverActionState" ".data.driver_action_state" ".data.actionState" ".data.action_state")
save_evidence "$SCENARIO" "driver" "forwardedTaskStatusAfterAccept" "${FORWARDED_TASK_STATUS:-unknown}"
save_evidence "$SCENARIO" "driver" "forwardedActionStateAfterAccept" "${FORWARDED_ACTION_STATE:-unknown}"

if [[ "$FORWARDED_TASK_STATUS" != "accept_pending" ]]; then
  log_fail "Expected forwarded localStatus accept_pending after accept, got ${FORWARDED_TASK_STATUS:-empty}."
  exit 1
fi

if [[ "$FORWARDED_ACTION_STATE" != "awaiting_platform" ]]; then
  log_fail "Expected forwarded driverActionState awaiting_platform after accept, got ${FORWARDED_ACTION_STATE:-empty}."
  exit 1
fi

log_ok "Forwarded task moved to accept_pending / awaiting_platform"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Ops Console: forwarded task must not create owned assignment
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — no-owned-assignment check"

switch_actor "ops_user" "e2e-ops-006"

log_step "3.1 — GET /dispatch/tasks"
http_call GET "/dispatch/tasks"
assert_status "200"

OWNED_JOB_FOR_FORWARDED=$(echo "$RESP_BODY" | \
  jq -r --arg mirrorOrderId "$FORWARDED_MIRROR_ORDER_ID" --arg forwardedTaskId "$FORWARDED_TASK_ID" \
    '.data.items[]
     | select(
         (.orderId // .order_id // "") == $mirrorOrderId
         or (.sourceTaskId // .source_task_id // "") == $forwardedTaskId
         or (.forwardedTaskId // .forwarded_task_id // "") == $forwardedTaskId
       )
     | (.dispatchJobId // .dispatch_job_id)' \
    2>/dev/null | head -1 || true)

if [[ -n "$OWNED_JOB_FOR_FORWARDED" ]]; then
  log_fail "Found owned dispatch job for forwarded task ${FORWARDED_TASK_ID}: dispatchJobId=${OWNED_JOB_FOR_FORWARDED}"
  exit 1
fi

save_evidence "$SCENARIO" "ops" "forwardedOwnedAssignmentDetected" "false"
log_ok "No owned dispatch job found for forwarded mirror/task"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Earnings API: by-platform breakdown remains available
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — by-platform earnings breakdown"

log_step "4.1 — GET /platform-earnings/summary"
http_call GET "/platform-earnings/summary"
assert_status "200"

EARNINGS_DRIVER_ID=$(json_get_first ".data.driverId" ".data.driver_id")
EARNINGS_TOTAL_NET=$(json_get_first ".data.totalNet.amountMinor" ".data.total_net.amount_minor")
save_evidence "$SCENARIO" "earnings" "driverId" "${EARNINGS_DRIVER_ID:-unknown}"
save_evidence "$SCENARIO" "earnings" "totalNetAmountMinor" "${EARNINGS_TOTAL_NET:-0}"
log_ok "Platform earnings summary driverId=${EARNINGS_DRIVER_ID:-unknown} totalNet=${EARNINGS_TOTAL_NET:-0}"

log_step "4.2 — GET /platform-earnings/by-platform"
http_call GET "/platform-earnings/by-platform"
assert_status "200"

PLATFORM_ITEM_COUNT=$(json_get ".data.items | length")
if [[ "${PLATFORM_ITEM_COUNT:-0}" -le 0 ]]; then
  log_fail "Expected at least one platform earnings item, got ${PLATFORM_ITEM_COUNT:-0}."
  exit 1
fi

PLATFORM_CODES=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.platformCode // .platform_code)] | join(",")' 2>/dev/null || true)
chain_set "earnings" "platformCodes" "${PLATFORM_CODES:-unknown}"
save_evidence "$SCENARIO" "earnings" "platformCodes" "${PLATFORM_CODES:-unknown}"
save_evidence "$SCENARIO" "earnings" "platformItemCount" "${PLATFORM_ITEM_COUNT:-0}"
log_ok "Platform earnings breakdown returned ${PLATFORM_ITEM_COUNT} items: ${PLATFORM_CODES:-unknown}"

# ══════════════════════════════════════════════════════════════════════════════
# CHAIN VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
log_step "Chain continuity assertions"
assert_chain "seed" "ownedBookingId"
assert_chain "seed" "ownedOrderId"
assert_chain "seed" "ownedDispatchJobId"
assert_chain "seed" "mixedDriverId"
assert_chain "seed" "mixedVehicleId"
assert_chain "seed" "forwardedMirrorOrderId"
assert_chain "seed" "forwardedExternalOrderId"
assert_chain "driver" "ownedTaskId"
assert_chain "driver" "forwardedTaskId"
assert_chain "driver" "forwardedSourcePlatform"
assert_chain "earnings" "platformCodes"

print_chain_summary

echo ""
log_ok "E2E-006 complete — deterministic driver multi-platform owned + forwarded chain passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
