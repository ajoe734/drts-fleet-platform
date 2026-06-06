#!/usr/bin/env bash
# E2E-014 — Fleet partner revenue share + statement generation
#
# Surface chain:
#   Platform Admin -> Tenant Booking -> Ops Dispatch -> Driver Completion
#   -> Fleet Partner Statement (admin + self-service)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-014"
FLEET_PARTNER_ID="${E2E_FLEET_PARTNER_ID:-fleet-demo-001}"
FLEET_DRIVER_ID="${E2E_FLEET_DRIVER_ID:-drv-demo-001}"
FLEET_VEHICLE_ID="${E2E_FLEET_VEHICLE_ID:-veh-demo-001}"
FLEET_RULE_RATE_BPS="${E2E_FLEET_RULE_RATE_BPS:-800}"
DRIVER_FEE_BPS="${E2E_DRIVER_FEE_BPS:-1800}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-014-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

TENANT_ADMIN_USER_ID=""
BOOKING_ID=""
ORDER_ID=""
DISPATCH_JOB_ID=""
TASK_ID=""

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-014 — Fleet partner revenue share${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

ensure_tenant_admin() {
  http_call GET "/tenant/users"
  assert_status "200"

  local user_id
  user_id=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select((.roleCode // .role_code) == "tenant_admin" and (((.status // "") == "active") or ((.status // "") == "invited"))) | (.userId // .user_id)' \
    2>/dev/null | head -1 || true)
  if [[ -n "$user_id" ]]; then
    echo "$user_id"
    return 0
  fi

  local user_fixture="${TMP_DIR}/tenant-admin.json"
  jq -n \
    '{
      email: "e2e-014-tenant-admin@example.test",
      displayName: "E2E 014 Tenant Admin",
      roleCode: "tenant_admin"
    }' > "$user_fixture"
  http_call POST "/tenant/users" "$user_fixture"
  assert_status "200|201"
  user_id=$(json_get_first '.data.userId' '.data.user_id')
  [[ -n "$user_id" ]] || { log_fail "tenant admin bootstrap missing userId"; exit 1; }
  echo "$user_id"
}

ensure_driver_fee_plan() {
  http_call GET "/driver-fee-plans"
  assert_status "200"

  local fee_plan_id
  fee_plan_id=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select((.status // "") == "published") | (.feePlanId // .fee_plan_id)' \
    2>/dev/null | head -1 || true)
  if [[ -n "$fee_plan_id" ]]; then
    echo "$fee_plan_id"
    return 0
  fi

  local fee_plan_fixture="${TMP_DIR}/driver-fee-plan.json"
  local version_suffix
  version_suffix=$(date -u +"%Y%m%d%H%M%S")
  jq -n \
    --arg planName "E2E Driver Fee Plan" \
    --arg version "e2e-${version_suffix}" \
    --argjson serviceFeeBps "$DRIVER_FEE_BPS" \
    '{
      planName: $planName,
      version: $version,
      serviceFeeBps: $serviceFeeBps,
      reimbursementMode: "platform_funded"
    }' > "$fee_plan_fixture"

  http_call POST "/driver-fee-plans/publish" "$fee_plan_fixture"
  assert_status "200|201"
  fee_plan_id=$(json_get_first '.data.feePlanId' '.data.fee_plan_id')
  [[ -n "$fee_plan_id" ]] || { log_fail "driver fee plan publish missing feePlanId"; exit 1; }
  echo "$fee_plan_id"
}

poll_for_dispatch_job() {
  local attempt=0
  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/dispatch/tasks"
    if [[ "$RESP_STATUS" == "200" ]]; then
      DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
        '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
        2>/dev/null | head -1 || true)
      if [[ -n "$DISPATCH_JOB_ID" ]]; then
        return 0
      fi
    fi
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: dispatch job for orderId=${ORDER_ID} not visible yet"
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done
  return 1
}

log_surface "Platform Admin — fleet partner seed readiness"
switch_actor "platform_admin" "e2e-platform-admin-001"

DRIVER_FEE_PLAN_ID=$(ensure_driver_fee_plan)
save_evidence "$SCENARIO" "platform_admin" "driverFeePlanId" "$DRIVER_FEE_PLAN_ID"
log_ok "driver fee plan ready: ${DRIVER_FEE_PLAN_ID}"

http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}"
assert_status "200"
save_evidence "$SCENARIO" "platform_admin" "fleetPartnerId" "$FLEET_PARTNER_ID"
log_ok "fleet partner available: ${FLEET_PARTNER_ID}"

http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}/drivers"
assert_status "200"
AFFILIATED_DRIVER_ID=$(echo "$RESP_BODY" | jq -r --arg driverId "$FLEET_DRIVER_ID" \
  '.data.items[] | select((.driverId // .driver_id) == $driverId) | (.driverId // .driver_id)' \
  2>/dev/null | head -1 || true)
if [[ "$AFFILIATED_DRIVER_ID" != "$FLEET_DRIVER_ID" ]]; then
  log_fail "Expected fleet affiliation for driver ${FLEET_DRIVER_ID}"
  exit 1
fi
save_evidence "$SCENARIO" "platform_admin" "affiliatedDriverId" "$AFFILIATED_DRIVER_ID"
log_ok "fleet affiliation present for driver ${AFFILIATED_DRIVER_ID}"

http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}/revenue-share-rules"
assert_status "200"
RULE_ID=$(echo "$RESP_BODY" | jq -r --arg partnerId "$FLEET_PARTNER_ID" \
  '.data.items[] | select((.fleetPartnerId // .fleet_partner_id) == $partnerId and (.formula == "percent_of_gross")) | (.ruleId // .rule_id)' \
  2>/dev/null | head -1 || true)
[[ -n "$RULE_ID" ]] || { log_fail "No percent_of_gross fleet revenue share rule found"; exit 1; }
save_evidence "$SCENARIO" "platform_admin" "ruleId" "$RULE_ID"
log_ok "revenue share rule ready: ${RULE_ID}"

log_surface "Tenant Portal — booking creation"
switch_actor "tenant_admin" "e2e-bootstrap-tenant-admin" "$E2E_SEED_TENANT_ID"
TENANT_ADMIN_USER_ID=$(ensure_tenant_admin)
chain_set "tenant" "adminUserId" "$TENANT_ADMIN_USER_ID"
save_evidence "$SCENARIO" "tenant" "adminUserId" "$TENANT_ADMIN_USER_ID"

WINDOW_START=$(date -u -d "+90 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+90M +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+120 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+120M +"%Y-%m-%dT%H:%M:%SZ")

BOOKING_FIXTURE="${TMP_DIR}/booking.json"
jq -n \
  --arg start "$WINDOW_START" \
  --arg end "$WINDOW_END" \
  '{
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: $start,
    reservationWindowEnd: $end,
    passenger: {
      name: "Fleet Partner Rider",
      phone: "0912000014"
    },
    bookedBy: {
      name: "Fleet Partner Tenant Admin",
      email: "e2e-014-tenant-admin@example.test"
    },
    pickup: {
      address: "台北車站"
    },
    dropoff: {
      address: "松山機場"
    },
    notes: "E2E-014 fleet partner revenue share"
  }' > "$BOOKING_FIXTURE"

http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"
BOOKING_ID=$(json_get_first '.data.bookingId' '.data.booking_id')
ORDER_ID=$(json_get_first '.data.orderId' '.data.order_id')
if [[ -z "$BOOKING_ID" || -z "$ORDER_ID" ]]; then
  http_call GET "/tenant/bookings"
  assert_status "200"
  BOOKING_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select((.notes // "") == "E2E-014 fleet partner revenue share") | (.bookingId // .booking_id)' \
    2>/dev/null | head -1 || true)
  ORDER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select((.notes // "") == "E2E-014 fleet partner revenue share") | (.orderId // .order_id)' \
    2>/dev/null | head -1 || true)
fi
[[ -n "$BOOKING_ID" && -n "$ORDER_ID" ]] || { log_fail "booking lookup missing bookingId/orderId"; exit 1; }
chain_set "tenant" "bookingId" "$BOOKING_ID"
chain_set "tenant" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "tenant" "bookingId" "$BOOKING_ID"
save_evidence "$SCENARIO" "tenant" "orderId" "$ORDER_ID"
log_ok "booking created: bookingId=${BOOKING_ID}, orderId=${ORDER_ID}"

log_surface "Ops Console — dispatch + assignment"
switch_actor "ops_user" "e2e-ops-014"
DISPATCH_FIXTURE="${TMP_DIR}/dispatch.json"
printf '%s\n' '{"mode":"auto"}' > "$DISPATCH_FIXTURE"
http_call POST "/orders/${ORDER_ID}/dispatch" "$DISPATCH_FIXTURE"
assert_status "200|201"

if ! poll_for_dispatch_job; then
  log_fail "No dispatch job found for orderId=${ORDER_ID}"
  exit 1
fi
chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
log_ok "dispatch job found: ${DISPATCH_JOB_ID}"

ASSIGN_FIXTURE="${TMP_DIR}/assign.json"
jq -n \
  --arg dispatchJobId "$DISPATCH_JOB_ID" \
  --arg vehicleId "$FLEET_VEHICLE_ID" \
  --arg driverId "$FLEET_DRIVER_ID" \
  '{dispatchJobId: $dispatchJobId, vehicleId: $vehicleId, driverId: $driverId}' > "$ASSIGN_FIXTURE"

http_call POST "/dispatch/assign" "$ASSIGN_FIXTURE"
assert_status "200|201"
TASK_ID=$(json_get_first '.data.taskId' '.data.task_id')
[[ -n "$TASK_ID" ]] || { log_fail "dispatch assign missing taskId"; exit 1; }
chain_set "ops" "taskId" "$TASK_ID"
save_evidence "$SCENARIO" "ops" "taskId" "$TASK_ID"
log_ok "dispatch assigned: taskId=${TASK_ID}"

log_surface "Driver app — lifecycle completion"
switch_actor "driver_user" "e2e-driver-${FLEET_DRIVER_ID}" "$E2E_SEED_TENANT_ID"
ACCEPT_AT=$(date -u -d "-6 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-6M +"%Y-%m-%dT%H:%M:%SZ")
DEPART_AT=$(date -u -d "-5 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ")
ARRIVE_AT=$(date -u -d "-4 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-4M +"%Y-%m-%dT%H:%M:%SZ")
START_AT=$(date -u -d "-3 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-3M +"%Y-%m-%dT%H:%M:%SZ")
COMPLETE_AT=$(date -u -d "-2 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-2M +"%Y-%m-%dT%H:%M:%SZ")
PERIOD_MONTH="${COMPLETE_AT:0:7}"

jq -n --arg acceptedAt "$ACCEPT_AT" '{acceptedAt: $acceptedAt}' > "${TMP_DIR}/accept.json"
http_call POST "/driver/tasks/${TASK_ID}/accept" "${TMP_DIR}/accept.json"
assert_status "200|201"

jq -n --arg departedAt "$DEPART_AT" '{departedAt: $departedAt}' > "${TMP_DIR}/depart.json"
http_call POST "/driver/tasks/${TASK_ID}/depart" "${TMP_DIR}/depart.json"
assert_status "200|201"

jq -n --arg arrivedAt "$ARRIVE_AT" '{arrivedAt: $arrivedAt}' > "${TMP_DIR}/arrive.json"
http_call POST "/driver/tasks/${TASK_ID}/arrived_pickup" "${TMP_DIR}/arrive.json"
assert_status "200|201"

jq -n --arg startedAt "$START_AT" '{startedAt: $startedAt}' > "${TMP_DIR}/start.json"
http_call POST "/driver/tasks/${TASK_ID}/start" "${TMP_DIR}/start.json"
assert_status "200|201"

sed "s/__COMPLETED_AT__/${COMPLETE_AT}/" \
  "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" > "${TMP_DIR}/complete.json"
http_call POST "/driver/tasks/${TASK_ID}/complete" "${TMP_DIR}/complete.json"
assert_status "200|201"
log_ok "driver lifecycle completed"

log_surface "Fleet partner statements — admin"
switch_actor "platform_admin" "e2e-platform-admin-001"
http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}/statements?periodMonth=${PERIOD_MONTH}"
assert_status "200"

STATEMENT_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | (.statementId // .statement_id)' 2>/dev/null | head -1 || true)
[[ -n "$STATEMENT_ID" ]] || { log_fail "fleet partner statement missing"; exit 1; }

STATEMENT_ORDER_ID=$(echo "$RESP_BODY" | jq -r --arg orderId "$ORDER_ID" \
  '.data.items[].lines[] | select((.orderId // .order_id) == $orderId) | (.orderId // .order_id)' \
  2>/dev/null | head -1 || true)
[[ "$STATEMENT_ORDER_ID" == "$ORDER_ID" ]] || { log_fail "statement lines missing completed orderId=${ORDER_ID}"; exit 1; }

LINE_GROSS=$(echo "$RESP_BODY" | jq -r --arg orderId "$ORDER_ID" \
  '.data.items[].lines[] | select((.orderId // .order_id) == $orderId) | (.grossEarning.amountMinor // .gross_earning.amount_minor)' \
  2>/dev/null | head -1 || true)
LINE_SHARE=$(echo "$RESP_BODY" | jq -r --arg orderId "$ORDER_ID" \
  '.data.items[].lines[] | select((.orderId // .order_id) == $orderId) | (.shareAmount.amountMinor // .share_amount.amount_minor)' \
  2>/dev/null | head -1 || true)
[[ -n "$LINE_GROSS" && -n "$LINE_SHARE" ]] || { log_fail "statement line missing gross/share amounts"; exit 1; }

EXPECTED_SHARE=$(( LINE_GROSS * FLEET_RULE_RATE_BPS / 10000 ))
if [[ "$LINE_SHARE" -ne "$EXPECTED_SHARE" ]]; then
  log_fail "Expected shareAmount=${EXPECTED_SHARE}, got ${LINE_SHARE}"
  exit 1
fi

save_evidence "$SCENARIO" "fleet_admin" "statementId" "$STATEMENT_ID"
save_evidence "$SCENARIO" "fleet_admin" "grossAmountMinor" "$LINE_GROSS"
save_evidence "$SCENARIO" "fleet_admin" "shareAmountMinor" "$LINE_SHARE"
log_ok "fleet statement calculated correctly: ${LINE_SHARE}"

log_surface "Fleet partner portal — self-service statement"
switch_actor "partner_api_key" "e2e-fleet-partner-portal"
set_partner_context "$FLEET_PARTNER_ID"
http_call GET "/fleet-partner/statements?periodMonth=${PERIOD_MONTH}"
assert_status "200"

PORTAL_STATEMENT_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | (.statementId // .statement_id)' 2>/dev/null | head -1 || true)
[[ "$PORTAL_STATEMENT_ID" == "$STATEMENT_ID" ]] || {
  log_fail "fleet partner portal statement mismatch: expected ${STATEMENT_ID}, got ${PORTAL_STATEMENT_ID:-<empty>}"
  exit 1
}

PORTAL_SHARE=$(echo "$RESP_BODY" | jq -r --arg orderId "$ORDER_ID" \
  '.data.items[].lines[] | select((.orderId // .order_id) == $orderId) | (.shareAmount.amountMinor // .share_amount.amount_minor)' \
  2>/dev/null | head -1 || true)
[[ "$PORTAL_SHARE" == "$LINE_SHARE" ]] || {
  log_fail "fleet partner portal share mismatch: expected ${LINE_SHARE}, got ${PORTAL_SHARE:-<empty>}"
  exit 1
}

chain_set "fleet" "statementId" "$STATEMENT_ID"
save_evidence "$SCENARIO" "fleet_portal" "statementId" "$PORTAL_STATEMENT_ID"
save_evidence "$SCENARIO" "fleet_portal" "shareAmountMinor" "$PORTAL_SHARE"

print_chain_summary
log_ok "E2E-014 completed."
