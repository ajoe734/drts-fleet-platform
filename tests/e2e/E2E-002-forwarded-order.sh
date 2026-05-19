#!/usr/bin/env bash
# E2E-002 — Forwarded order sandbox mirror lifecycle
#
# Surface chain: Forwarder mirror (ops) -> Driver App -> Ops/Finance guards
#
# This scenario uses the forwarder_sandbox provider introduced by FWD-SBX-001
# so WF-FWD-001 can be exercised deterministically without live partner creds.
#
# Verifies:
#   1. Sandbox inbound order becomes a visible forwarded mirror.
#   2. Driver sees the task through unified task views with routeLocked metadata.
#   3. Driver accept is relayed and reflected as accept_pending/confirmed/completed.
#   4. A second mirrored order can be cancelled_by_platform after accept.
#   5. Forwarded settlement remains shadow_only in the settlement matrix.
#   6. No owned dispatch job is created for either forwarded mirror order.
#
# Cross-ref: docs/04-uat/phase1-uat-scenarios.md §5 E2E-002, UAT DA-005,
#            NP-FWD-001, NP-FWD-002, NP-FWD-003.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-002"
FORWARDER_SANDBOX_PLATFORM="forwarder_sandbox"

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-002 — Forwarded order sandbox mirror lifecycle${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

PRIMARY_EXTERNAL_ORDER_ID="SBX-E2E-002-PRIMARY-${_E2E_RUN_ID}"
SECONDARY_EXTERNAL_ORDER_ID="SBX-E2E-002-CANCEL-${_E2E_RUN_ID}"

create_inbound_fixture() {
  local external_order_id="$1"
  local pickup_address="$2"
  local dropoff_address="$3"
  local fixture

  fixture=$(mktemp /tmp/drts-e2e-002-inbound-XXXXXX.json)
  jq -n \
    --arg platformCode "$FORWARDER_SANDBOX_PLATFORM" \
    --arg externalOrderId "$external_order_id" \
    --arg pickupAddress "$pickup_address" \
    --arg dropoffAddress "$dropoff_address" \
    '{
      platformCode: $platformCode,
      externalOrderId: $externalOrderId,
      payload: {
        serviceBucket: "standard_taxi",
        pickupAddress: $pickupAddress,
        dropoffAddress: $dropoffAddress,
        sandbox: true,
        scenario: "E2E-002"
      }
    }' > "$fixture"
  echo "$fixture"
}

create_driver_fixture() {
  local fixture

  fixture=$(mktemp /tmp/drts-e2e-002-driver-XXXXXX.json)
  jq -n --arg driverId "$E2E_SEED_DRIVER_ID" '{ driverId: $driverId }' > "$fixture"
  echo "$fixture"
}

create_sync_fixture() {
  local native_status="$1"
  local result="$2"
  local fixture

  fixture=$(mktemp /tmp/drts-e2e-002-sync-XXXXXX.json)
  jq -n \
    --arg nativeStatus "$native_status" \
    --arg result "$result" \
    '{
      nativeStatus: $nativeStatus,
      payload: {
        sandbox: true,
        result: $result,
        scenario: "E2E-002"
      }
    }' > "$fixture"
  echo "$fixture"
}

PRIMARY_INBOUND_FIXTURE=$(create_inbound_fixture \
  "$PRIMARY_EXTERNAL_ORDER_ID" \
  "台中市梧棲區中二路一段9號" \
  "台中市大安區興安路378號")
SECONDARY_INBOUND_FIXTURE=$(create_inbound_fixture \
  "$SECONDARY_EXTERNAL_ORDER_ID" \
  "台中市西屯區臺灣大道四段1727號" \
  "台中市北屯區松竹路一段1000號")
BROADCAST_FIXTURE=$(mktemp /tmp/drts-e2e-002-broadcast-XXXXXX.json)
DRIVER_FIXTURE=$(create_driver_fixture)
CONFIRMED_SYNC_FIXTURE=$(create_sync_fixture "confirmed_by_platform" "confirmed")
COMPLETED_SYNC_FIXTURE=$(mktemp /tmp/drts-e2e-002-completed-XXXXXX.json)
CANCELLED_SYNC_FIXTURE=$(create_sync_fixture "cancelled_by_platform" "cancelled_by_platform")
trap 'rm -f "$PRIMARY_INBOUND_FIXTURE" "$SECONDARY_INBOUND_FIXTURE" "$BROADCAST_FIXTURE" "$DRIVER_FIXTURE" "$CONFIRMED_SYNC_FIXTURE" "$COMPLETED_SYNC_FIXTURE" "$CANCELLED_SYNC_FIXTURE"' EXIT

jq -n --arg driverId "$E2E_SEED_DRIVER_ID" \
  '{ candidateDriverIds: [$driverId] }' > "$BROADCAST_FIXTURE"

jq -n \
  '{
    nativeStatus: "completed",
    payload: {
      sandbox: true,
      result: "completed",
      scenario: "E2E-002",
      settlementReference: "SBX-STL-001"
    }
  }' > "$COMPLETED_SYNC_FIXTURE"

PRIMARY_MIRROR_ORDER_ID=""
SECONDARY_MIRROR_ORDER_ID=""

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Ops: create primary sandbox mirror and broadcast it
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — sandbox forwarded mirror creation"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "1.1 — POST /forwarder/orders/inbound (primary sandbox order)"
http_call POST "/forwarder/orders/inbound" "$PRIMARY_INBOUND_FIXTURE"
assert_status "200|201"

PRIMARY_MIRROR_ORDER_ID=$(json_get ".data.mirrorOrderId")
if [[ -z "$PRIMARY_MIRROR_ORDER_ID" ]]; then
  log_fail "Primary sandbox mirrorOrderId missing from inbound response."
  exit 1
fi

chain_set "ops" "primaryMirrorOrderId" "$PRIMARY_MIRROR_ORDER_ID"
save_evidence "$SCENARIO" "ops" "primaryMirrorOrderId" "$PRIMARY_MIRROR_ORDER_ID"
save_evidence "$SCENARIO" "ops" "primaryExternalOrderId" "$PRIMARY_EXTERNAL_ORDER_ID"
log_ok "Primary sandbox mirror created: ${PRIMARY_MIRROR_ORDER_ID}"

log_step "1.2 — POST /forwarder/orders/:orderId/broadcast"
http_call POST "/forwarder/orders/${PRIMARY_MIRROR_ORDER_ID}/broadcast" "$BROADCAST_FIXTURE"
assert_status "200|201"
log_ok "Primary sandbox mirror broadcasted to driver ${E2E_SEED_DRIVER_ID}"

log_step "1.3 — GET /forwarder/orders (verify mirror row)"
http_call GET "/forwarder/orders"
assert_status "200"

PRIMARY_MIRROR_STATUS=$(echo "$RESP_BODY" | \
  jq -r --arg externalOrderId "$PRIMARY_EXTERNAL_ORDER_ID" \
    '.data.items[] | select(.externalOrderId == $externalOrderId) | .status' \
    2>/dev/null | head -1 || true)

if [[ "$PRIMARY_MIRROR_STATUS" != "broadcasted" ]]; then
  log_fail "Expected primary mirror status broadcasted, got ${PRIMARY_MIRROR_STATUS:-empty}."
  exit 1
fi

save_evidence "$SCENARIO" "ops" "primaryMirrorStatus" "$PRIMARY_MIRROR_STATUS"
log_ok "Primary mirror visible in forwarder list with status=${PRIMARY_MIRROR_STATUS}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Driver: visibility and routeLocked/source metadata
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — forwarded task visibility"

switch_actor "driver_user" "$E2E_SEED_DRIVER_ID" "$E2E_SEED_TENANT_ID"

log_step "2.1 — GET /driver/task-views"
http_call GET "/driver/task-views"
assert_status "200"

FORWARDED_TASK_ID=$(echo "$RESP_BODY" | \
  jq -r --arg externalOrderId "$PRIMARY_EXTERNAL_ORDER_ID" \
    '.data.items[] | select(.externalOrderId == $externalOrderId) | .taskId' \
    2>/dev/null | head -1 || true)

if [[ -z "$FORWARDED_TASK_ID" ]]; then
  log_fail "Primary forwarded task is not visible to the seeded driver."
  exit 1
fi

chain_set "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
save_evidence "$SCENARIO" "driver" "forwardedTaskId" "$FORWARDED_TASK_ID"
log_ok "Driver sees primary forwarded task ${FORWARDED_TASK_ID}"

log_step "2.2 — GET /driver/task-views/:taskId"
http_call GET "/driver/task-views/${FORWARDED_TASK_ID}"
assert_status "200"

FORWARDED_ROUTE_LOCKED=$(json_get ".data.routeLocked")
FORWARDED_SOURCE_PLATFORM=$(json_get ".data.sourcePlatform")
FORWARDED_ACTION_STATE=$(json_get ".data.driverActionState")

save_evidence "$SCENARIO" "driver" "routeLocked" "${FORWARDED_ROUTE_LOCKED:-false}"
save_evidence "$SCENARIO" "driver" "sourcePlatform" "${FORWARDED_SOURCE_PLATFORM:-unknown}"
save_evidence "$SCENARIO" "driver" "initialDriverActionState" "${FORWARDED_ACTION_STATE:-unknown}"

if [[ "$FORWARDED_ROUTE_LOCKED" != "true" ]]; then
  log_fail "Expected routeLocked=true on the forwarded task."
  exit 1
fi

if [[ "$FORWARDED_SOURCE_PLATFORM" != "$FORWARDER_SANDBOX_PLATFORM" ]]; then
  log_fail "Expected sourcePlatform=${FORWARDER_SANDBOX_PLATFORM}, got ${FORWARDED_SOURCE_PLATFORM:-empty}."
  exit 1
fi

log_ok "Forwarded task metadata confirmed: routeLocked=true, sourcePlatform=${FORWARDED_SOURCE_PLATFORM}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Driver accept, status sync, completed sync
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — accept relay and sandbox status sync"

log_step "3.1 — POST /driver/forwarded-orders/:taskId/accept"
http_call POST "/driver/forwarded-orders/${FORWARDED_TASK_ID}/accept" "$DRIVER_FIXTURE"
assert_status "200|201"

ACCEPT_OUTCOME=$(json_get ".data.outcome")
ACCEPT_MIRROR_ORDER_ID=$(json_get ".data.managementCorrelationIds.mirrorOrderId")
if [[ "$ACCEPT_OUTCOME" != "accept_pending" ]]; then
  log_fail "Expected accept outcome accept_pending, got ${ACCEPT_OUTCOME:-empty}."
  exit 1
fi

if [[ "$ACCEPT_MIRROR_ORDER_ID" != "$PRIMARY_MIRROR_ORDER_ID" ]]; then
  log_fail "Accept response mirrorOrderId mismatch."
  exit 1
fi

save_evidence "$SCENARIO" "driver" "acceptOutcome" "$ACCEPT_OUTCOME"
log_ok "Forwarded accept relay acknowledged with outcome=${ACCEPT_OUTCOME}"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "3.2 — POST /forwarder/orders/:orderId/sync-status (confirmed_by_platform)"
http_call POST "/forwarder/orders/${PRIMARY_MIRROR_ORDER_ID}/sync-status" "$CONFIRMED_SYNC_FIXTURE"
assert_status "200|201"
PRIMARY_CONFIRMED_STATUS=$(json_get ".data.status")
if [[ "$PRIMARY_CONFIRMED_STATUS" != "confirmed_by_platform" ]]; then
  log_fail "Expected confirmed_by_platform after sync, got ${PRIMARY_CONFIRMED_STATUS:-empty}."
  exit 1
fi
save_evidence "$SCENARIO" "ops" "primaryStatusAfterConfirmedSync" "$PRIMARY_CONFIRMED_STATUS"

switch_actor "driver_user" "$E2E_SEED_DRIVER_ID" "$E2E_SEED_TENANT_ID"

log_step "3.3 — GET /driver/task-views/:taskId (confirmed state)"
http_call GET "/driver/task-views/${FORWARDED_TASK_ID}"
assert_status "200"
PRIMARY_DRIVER_CONFIRMED_STATUS=$(json_get ".data.localStatus")
if [[ "$PRIMARY_DRIVER_CONFIRMED_STATUS" != "confirmed_by_platform" ]]; then
  log_fail "Driver view did not reflect confirmed_by_platform."
  exit 1
fi
save_evidence "$SCENARIO" "driver" "primaryDriverConfirmedStatus" "$PRIMARY_DRIVER_CONFIRMED_STATUS"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "3.4 — POST /forwarder/orders/:orderId/sync-status (completed)"
http_call POST "/forwarder/orders/${PRIMARY_MIRROR_ORDER_ID}/sync-status" "$COMPLETED_SYNC_FIXTURE"
assert_status "200|201"
PRIMARY_COMPLETED_STATUS=$(json_get ".data.status")
if [[ "$PRIMARY_COMPLETED_STATUS" != "completed_synced" ]]; then
  log_fail "Expected completed_synced after completed sync, got ${PRIMARY_COMPLETED_STATUS:-empty}."
  exit 1
fi
save_evidence "$SCENARIO" "ops" "primaryStatusAfterCompletedSync" "$PRIMARY_COMPLETED_STATUS"

switch_actor "driver_user" "$E2E_SEED_DRIVER_ID" "$E2E_SEED_TENANT_ID"

log_step "3.5 — GET /driver/task-views/:taskId (completed sync reflected)"
http_call GET "/driver/task-views/${FORWARDED_TASK_ID}"
assert_status "200"
PRIMARY_DRIVER_COMPLETED_STATUS=$(json_get ".data.localStatus")
PRIMARY_DRIVER_COMPLETED_ACTION_STATE=$(json_get ".data.driverActionState")
if [[ "$PRIMARY_DRIVER_COMPLETED_STATUS" != "completed_synced" ]]; then
  log_fail "Driver view did not reflect completed_synced."
  exit 1
fi
save_evidence "$SCENARIO" "driver" "primaryDriverCompletedStatus" "$PRIMARY_DRIVER_COMPLETED_STATUS"
save_evidence "$SCENARIO" "driver" "primaryDriverCompletedActionState" "${PRIMARY_DRIVER_COMPLETED_ACTION_STATE:-unknown}"
log_ok "Primary forwarded task completed through sandbox status sync"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Secondary mirror cancellation path
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops + Driver — sandbox cancellation path"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "4.1 — POST /forwarder/orders/inbound (secondary sandbox order)"
http_call POST "/forwarder/orders/inbound" "$SECONDARY_INBOUND_FIXTURE"
assert_status "200|201"

SECONDARY_MIRROR_ORDER_ID=$(json_get ".data.mirrorOrderId")
if [[ -z "$SECONDARY_MIRROR_ORDER_ID" ]]; then
  log_fail "Secondary sandbox mirrorOrderId missing from inbound response."
  exit 1
fi

chain_set "ops" "secondaryMirrorOrderId" "$SECONDARY_MIRROR_ORDER_ID"
save_evidence "$SCENARIO" "ops" "secondaryMirrorOrderId" "$SECONDARY_MIRROR_ORDER_ID"
save_evidence "$SCENARIO" "ops" "secondaryExternalOrderId" "$SECONDARY_EXTERNAL_ORDER_ID"

log_step "4.2 — POST /forwarder/orders/:orderId/broadcast"
http_call POST "/forwarder/orders/${SECONDARY_MIRROR_ORDER_ID}/broadcast" "$BROADCAST_FIXTURE"
assert_status "200|201"

switch_actor "driver_user" "$E2E_SEED_DRIVER_ID" "$E2E_SEED_TENANT_ID"

log_step "4.3 — GET /driver/task-views (find secondary order)"
http_call GET "/driver/task-views"
assert_status "200"

SECONDARY_FORWARDED_TASK_ID=$(echo "$RESP_BODY" | \
  jq -r --arg externalOrderId "$SECONDARY_EXTERNAL_ORDER_ID" \
    '.data.items[] | select(.externalOrderId == $externalOrderId) | .taskId' \
    2>/dev/null | head -1 || true)

if [[ -z "$SECONDARY_FORWARDED_TASK_ID" ]]; then
  log_fail "Secondary forwarded task is not visible to the seeded driver."
  exit 1
fi

save_evidence "$SCENARIO" "driver" "secondaryForwardedTaskId" "$SECONDARY_FORWARDED_TASK_ID"

log_step "4.4 — POST /driver/forwarded-orders/:taskId/accept (secondary order)"
http_call POST "/driver/forwarded-orders/${SECONDARY_FORWARDED_TASK_ID}/accept" "$DRIVER_FIXTURE"
assert_status "200|201"
SECONDARY_ACCEPT_OUTCOME=$(json_get ".data.outcome")
if [[ "$SECONDARY_ACCEPT_OUTCOME" != "accept_pending" ]]; then
  log_fail "Expected secondary accept outcome accept_pending."
  exit 1
fi

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "4.5 — POST /forwarder/orders/:orderId/sync-status (cancelled_by_platform)"
http_call POST "/forwarder/orders/${SECONDARY_MIRROR_ORDER_ID}/sync-status" "$CANCELLED_SYNC_FIXTURE"
assert_status "200|201"
SECONDARY_CANCELLED_STATUS=$(json_get ".data.status")
if [[ "$SECONDARY_CANCELLED_STATUS" != "cancelled_by_platform" ]]; then
  log_fail "Expected cancelled_by_platform after cancel sync."
  exit 1
fi
save_evidence "$SCENARIO" "ops" "secondaryStatusAfterCancelSync" "$SECONDARY_CANCELLED_STATUS"

switch_actor "driver_user" "$E2E_SEED_DRIVER_ID" "$E2E_SEED_TENANT_ID"

log_step "4.6 — GET /driver/task-views/:taskId (cancel reflected)"
http_call GET "/driver/task-views/${SECONDARY_FORWARDED_TASK_ID}"
assert_status "200"
SECONDARY_DRIVER_CANCELLED_STATUS=$(json_get ".data.localStatus")
if [[ "$SECONDARY_DRIVER_CANCELLED_STATUS" != "cancelled_by_platform" ]]; then
  log_fail "Driver view did not reflect cancelled_by_platform."
  exit 1
fi
save_evidence "$SCENARIO" "driver" "secondaryDriverCancelledStatus" "$SECONDARY_DRIVER_CANCELLED_STATUS"
log_ok "Secondary forwarded task cancelled by platform as expected"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 5 — Settlement row and no-owned-dispatch guard
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops + Finance — forwarded settlement row and no-owned-assignment guard"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "5.1 — GET /settlement/matrix"
http_call GET "/settlement/matrix"
assert_status "200"

SETTLEMENT_ROW=$(echo "$RESP_BODY" | \
  jq -c '.data.items[] | select((.channelKey // .channel_key) == "forwarded_shadow")' \
    2>/dev/null | head -1 || true)

if [[ -z "$SETTLEMENT_ROW" ]]; then
  log_fail "forwarded_shadow settlement row missing from settlement matrix."
  exit 1
fi

SETTLEMENT_LEDGER_MODE=$(echo "$SETTLEMENT_ROW" | jq -r '.localLedgerMode // .local_ledger_mode // empty' 2>/dev/null || true)
if [[ "$SETTLEMENT_LEDGER_MODE" != "shadow_only" ]]; then
  log_fail "Expected forwarded_shadow localLedgerMode=shadow_only, got ${SETTLEMENT_LEDGER_MODE:-empty}."
  exit 1
fi

save_evidence "$SCENARIO" "finance" "settlementChannelKey" "forwarded_shadow"
save_evidence "$SCENARIO" "finance" "settlementLedgerMode" "$SETTLEMENT_LEDGER_MODE"
log_ok "Settlement matrix confirms forwarded_shadow / shadow_only"

log_step "5.2 — GET /dispatch/tasks (verify no owned dispatch job for either mirror)"
http_call GET "/dispatch/tasks"
assert_status "200"

OWNED_JOB_FOR_PRIMARY=$(echo "$RESP_BODY" | \
  jq -r --arg tid "$PRIMARY_MIRROR_ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id // .sourceTaskId // .source_task_id // .forwardedTaskId // .forwarded_task_id) == $tid) | (.dispatchJobId // .dispatch_job_id)' \
    2>/dev/null | head -1 || true)
OWNED_JOB_FOR_SECONDARY=$(echo "$RESP_BODY" | \
  jq -r --arg tid "$SECONDARY_MIRROR_ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id // .sourceTaskId // .source_task_id // .forwardedTaskId // .forwarded_task_id) == $tid) | (.dispatchJobId // .dispatch_job_id)' \
    2>/dev/null | head -1 || true)

if [[ -n "$OWNED_JOB_FOR_PRIMARY" || -n "$OWNED_JOB_FOR_SECONDARY" ]]; then
  log_fail "Found owned dispatch job for a forwarded sandbox mirror."
  log_fail "primary dispatchJobId=${OWNED_JOB_FOR_PRIMARY:-none}; secondary dispatchJobId=${OWNED_JOB_FOR_SECONDARY:-none}"
  exit 1
fi

save_evidence "$SCENARIO" "ops" "ownedDispatchAssignmentCreated" "false"
log_ok "No owned dispatch job found for either forwarded sandbox mirror"

# ══════════════════════════════════════════════════════════════════════════════
# CHAIN VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
log_step "Chain continuity assertions"
assert_chain "ops" "primaryMirrorOrderId"
assert_chain "driver" "forwardedTaskId"
assert_chain "ops" "secondaryMirrorOrderId"

print_chain_summary

echo ""
log_ok "E2E-002 complete — forwarded sandbox mirror lifecycle passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
