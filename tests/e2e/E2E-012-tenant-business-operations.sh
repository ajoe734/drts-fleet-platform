#!/usr/bin/env bash
# E2E-012 — Tenant business operations shell
#
# Workflow family:
#   WF-TEN-BIZ-001
#
# SD §9 target flow:
#   tenant login
#   -> create booking
#   -> trip completed
#   -> tenant dashboard shows counts
#   -> payable summary updates
#   -> statement generated
#   -> report export includes order/user/cost center/service product
#
# Current repo reality:
#   - the booking/dispatch/driver/invoice/report-job chain is implemented and
#     must hard-pass
#   - tenant dashboard / payables / statements endpoints may exist in the
#     current repo tip or may still be absent on the deployed staging runtime;
#     when present they must hard-pass, otherwise they are recorded as probes
#     and invoice/statement evidence remains the runnable fallback
#   - tenant report jobs must preserve filters, emit tenant-business rows,
#     and expose tenant-scoped completion audit evidence
#
# Therefore this shell uses a split gate:
#   HARD FAIL
#     - tenant booking creation/read-back loses orderId or costCenter binding
#     - dispatch assignment cannot produce a driver task
#     - driver lifecycle cannot reach completed
#     - driver statement generation does not include the completed orderId
#     - tenant invoice generation does not include the completed orderId
#     - tenant report job cannot be queued/completed or loses filter binding
#     - tenant report export does not include order/user/cost center/service product rows
#     - tenant audit does not expose invoice and report completion side effects
#   PROBE + RECORD
#     - GET /tenant/dashboard when not yet deployed on the target env
#     - GET /tenant/payables/summary when not yet deployed on the target env
#     - GET /tenant/payables/line-items when not yet deployed on the target env
#     - GET /tenant/statements when not yet deployed on the target env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-012"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-012 — Tenant business operations shell${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-012-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUFFIX="$(date +%s | tail -c 7)"
CC_CODE="CC-TENBIZ-${SUFFIX}"
CC_NAME="E2E-012 tenant ops ${SUFFIX}"
BOOKED_BY_NAME="E2E Tenant Operator"
BOOKED_BY_STAFF_ID="e2e-tenbiz-${SUFFIX}"
BOOKED_BY_EMAIL="tenant-biz-admin@example.test"

TENANT_ADMIN_USER_ID=""
TENANT_FINANCE_USER_ID=""
BOOKING_ID=""
ORDER_ID=""
DISPATCH_JOB_ID=""
TASK_ID=""
INVOICE_ID=""
REPORT_JOB_ID=""
DRIVER_STATEMENT_ID=""
PERIOD_MONTH=""

poll_for_dispatch_job() {
  if [[ -n "${DISPATCH_JOB_ID:-}" ]]; then
    return 0
  fi

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

poll_report_job_completed() {
  local attempt=0
  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/tenant/reports/${REPORT_JOB_ID}"
    if [[ "$RESP_STATUS" == "200" ]]; then
      local status
      status=$(json_get '.data.status')
      if [[ "$status" == "completed" ]]; then
        return 0
      fi
      if [[ "$status" == "failed" ]]; then
        log_fail "Report job ${REPORT_JOB_ID} failed"
        log_fail "Body: ${RESP_BODY}"
        exit 1
      fi
      log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: report status=${status}"
    else
      log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: report detail HTTP ${RESP_STATUS}"
    fi
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done
  return 1
}

probe_route() {
  local surface="$1"
  local path="$2"
  http_call GET "$path"
  save_evidence "$SCENARIO" "$surface" "httpStatus" "$RESP_STATUS"
  if [[ "$RESP_STATUS" == "200" ]]; then
    log_ok "${path} available"
    return 0
  fi
  if [[ "$RESP_STATUS" =~ ^(404|405)$ ]]; then
    log_warn "${path} unavailable on this env (HTTP ${RESP_STATUS})"
    return 1
  fi
  log_fail "${path} probe failed with HTTP ${RESP_STATUS}; route exists but did not satisfy the tenant business contract"
  log_fail "Body: ${RESP_BODY}"
  exit 1
}

assert_number_ge() {
  local label="$1"
  local actual="$2"
  local minimum="$3"
  if [[ -z "$actual" || ! "$actual" =~ ^[0-9]+$ ]]; then
    log_fail "${label} expected integer >= ${minimum}, got '${actual:-<empty>}'"
    exit 1
  fi
  if (( actual < minimum )); then
    log_fail "${label} expected >= ${minimum}, got ${actual}"
    exit 1
  fi
  log_ok "${label}=${actual} (>= ${minimum})"
}

require_report_filter() {
  local key="$1"
  local expected="$2"
  local snake_key="$key"
  local actual
  case "$key" in
    tenantId) snake_key="tenant_id" ;;
    orderId) snake_key="order_id" ;;
    userId) snake_key="user_id" ;;
    costCenterCode) snake_key="cost_center_code" ;;
    serviceProduct) snake_key="service_product" ;;
  esac
  actual=$(echo "$RESP_BODY" | jq -r --arg key "$key" --arg snakeKey "$snake_key" \
    '.data.filters[$key] // .data.filters[$snakeKey] // empty' 2>/dev/null || true)
  if [[ "$actual" != "$expected" ]]; then
    log_fail "Report filter ${key} expected '${expected}', got '${actual:-<empty>}'"
    exit 1
  fi
  save_evidence "$SCENARIO" "report" "filter.${key}" "$actual"
  log_ok "Report filter preserved: ${key}=${actual}"
}

require_report_field_equals() {
  local label="$1"
  local jq_expr="$2"
  local expected="$3"
  local value
  value=$(json_get "$jq_expr")
  if [[ "$value" != "$expected" ]]; then
    save_evidence "$SCENARIO" "report" "$label" "${value:-NOT_PRESENT}"
    log_fail "Report evidence field ${label} expected '${expected}', got '${value:-<empty>}'"
    exit 1
  fi
  save_evidence "$SCENARIO" "report" "$label" "$value"
  log_ok "Report evidence field ${label}=${value}"
}

require_report_field_present() {
  local label="$1"
  local jq_expr="$2"
  local value
  value=$(json_get "$jq_expr")
  if [[ -z "$value" || "$value" == "null" ]]; then
    save_evidence "$SCENARIO" "report" "$label" "NOT_PRESENT"
    log_fail "Report evidence field ${label} not present"
    exit 1
  fi
  save_evidence "$SCENARIO" "report" "$label" "$value"
  log_ok "Report evidence field ${label}=${value}"
}

discover_tenant_user_ids() {
  TENANT_ADMIN_USER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select((.roleCode // .role_code) == "tenant_admin" and .status == "active") | (.userId // .user_id)' \
    2>/dev/null | head -1 || true)
  TENANT_FINANCE_USER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select((.roleCode // .role_code) == "tenant_finance_admin" and .status == "active") | (.userId // .user_id)' \
    2>/dev/null | head -1 || true)
}

ensure_active_tenant_user() {
  local role_code="$1"
  local email="$2"
  local display_name="$3"
  local fixture="${TMP_DIR}/tenant-user-${role_code}.json"
  local role_fixture="${TMP_DIR}/tenant-user-role-${role_code}.json"
  local user_id

  user_id=$(echo "$RESP_BODY" | jq -r \
    --arg email "$email" \
    '.data.items[] | select((.email | ascii_downcase) == ($email | ascii_downcase)) | (.userId // .user_id)' \
    2>/dev/null | head -1 || true)

  if [[ -z "$user_id" ]]; then
    jq -n \
      --arg email "$email" \
      --arg displayName "$display_name" \
      --arg roleCode "$role_code" \
      '{email: $email, displayName: $displayName, roleCode: $roleCode}' > "$fixture"
    http_call POST "/tenant/users" "$fixture"
    if [[ "$RESP_STATUS" =~ ^(200|201)$ ]]; then
      user_id=$(json_get_first '.data.userId' '.data.user_id')
    elif [[ "$RESP_STATUS" == "409" ]]; then
      http_call GET "/tenant/users"
      assert_status "200"
      user_id=$(echo "$RESP_BODY" | jq -r \
        --arg email "$email" \
        '.data.items[] | select((.email | ascii_downcase) == ($email | ascii_downcase)) | (.userId // .user_id)' \
        2>/dev/null | head -1 || true)
    else
      log_fail "Unable to create tenant user ${email}: HTTP ${RESP_STATUS}"
      log_fail "Body: ${RESP_BODY}"
      exit 1
    fi
  fi

  if [[ -z "$user_id" ]]; then
    log_fail "Unable to resolve tenant user ${email} after create/check"
    exit 1
  fi

  jq -n \
    --arg roleCode "$role_code" \
    '{roleCode: $roleCode, status: "active"}' > "$role_fixture"
  http_call POST "/tenant/users/${user_id}/role" "$role_fixture"
  assert_status "200|201"
  log_ok "tenant user ready: ${email} (${role_code})"
}

log_surface "Tenant login / actor discovery"
switch_actor "tenant_admin" "e2e-bootstrap-tenant-admin" "$E2E_SEED_TENANT_ID"
http_call GET "/tenant/users"
assert_status "200"

discover_tenant_user_ids
if [[ -z "$TENANT_ADMIN_USER_ID" ]]; then
  log_warn "No active tenant_admin user found; bootstrapping an idempotent E2E tenant admin."
  ensure_active_tenant_user "tenant_admin" "e2e-012-admin@acme.example" "E2E 012 Tenant Admin"
  http_call GET "/tenant/users"
  assert_status "200"
  discover_tenant_user_ids
fi
if [[ -z "$TENANT_FINANCE_USER_ID" ]]; then
  log_warn "No active tenant_finance_admin user found; bootstrapping an idempotent E2E finance admin."
  ensure_active_tenant_user "tenant_finance_admin" "e2e-012-finance@acme.example" "E2E 012 Tenant Finance"
  http_call GET "/tenant/users"
  assert_status "200"
  discover_tenant_user_ids
fi

[[ -n "$TENANT_ADMIN_USER_ID" ]] || { log_fail "No active tenant_admin user found"; exit 1; }
if [[ -z "$TENANT_FINANCE_USER_ID" ]]; then
  TENANT_FINANCE_USER_ID="$TENANT_ADMIN_USER_ID"
fi

chain_set "tenant" "adminUserId" "$TENANT_ADMIN_USER_ID"
chain_set "tenant" "financeUserId" "$TENANT_FINANCE_USER_ID"
save_evidence "$SCENARIO" "tenant" "adminUserId" "$TENANT_ADMIN_USER_ID"
save_evidence "$SCENARIO" "tenant" "financeUserId" "$TENANT_FINANCE_USER_ID"
log_ok "tenant login context resolved"

log_surface "Tenant setup — cost center"
switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
CC_FIXTURE="${TMP_DIR}/cost-center.json"
jq -n \
  --arg code "$CC_CODE" \
  --arg name "$CC_NAME" \
  --arg ownerUserId "$TENANT_ADMIN_USER_ID" \
  '{code: $code, name: $name, ownerUserId: $ownerUserId}' > "$CC_FIXTURE"

http_call POST "/tenant/cost-centers" "$CC_FIXTURE"
assert_status "200|201"
chain_set "tenant" "costCenterCode" "$CC_CODE"
save_evidence "$SCENARIO" "tenant" "costCenterCode" "$CC_CODE"
log_ok "cost center created: ${CC_CODE}"

log_surface "Tenant portal — create booking"
WINDOW_START=$(date -u -d "+70 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+70M +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+100 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+100M +"%Y-%m-%dT%H:%M:%SZ")
BOOKING_FIXTURE="${TMP_DIR}/booking.json"
jq \
  --arg start "$WINDOW_START" \
  --arg end "$WINDOW_END" \
  --arg cc "$CC_CODE" \
  --arg bookedByName "$BOOKED_BY_NAME" \
  --arg bookedByStaffId "$BOOKED_BY_STAFF_ID" \
  --arg bookedByEmail "$BOOKED_BY_EMAIL" \
  '
    .reservationWindowStart = $start
    | .reservationWindowEnd = $end
    | .costCenter = $cc
    | .notes = "E2E-012 tenant business operations"
    | .bookedBy.name = $bookedByName
    | .bookedBy.staffId = $bookedByStaffId
    | .bookedBy.email = $bookedByEmail
    | .passenger.name = "Tenant Biz Rider"
    | .passenger.phone = "+886912000012"
    | .pickup.address = "台北車站"
    | .dropoff.address = "松山機場"
  ' "${SCRIPT_DIR}/fixtures/e2e-booking-enterprise.json" > "$BOOKING_FIXTURE"

http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"
BOOKING_ID=$(json_get_first '.data.bookingId' '.data.booking_id')
ORDER_ID=$(json_get_first '.data.orderId' '.data.order_id')
[[ -n "$BOOKING_ID" && -n "$ORDER_ID" ]] || {
  log_fail "booking response missing bookingId/orderId"
  log_fail "Body: ${RESP_BODY}"
  exit 1
}
chain_set "tenant" "bookingId" "$BOOKING_ID"
chain_set "tenant" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "tenant" "bookingId" "$BOOKING_ID"
save_evidence "$SCENARIO" "tenant" "orderId" "$ORDER_ID"
log_ok "booking created: bookingId=${BOOKING_ID}, orderId=${ORDER_ID}"

log_step "Verify booking read-back"
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"
READBACK_CC=$(json_get_first '.data.costCenter' '.data.costCenterCode' '.data.cost_center' '.data.cost_center_code')
READBACK_SUBTYPE=$(json_get_first '.data.businessDispatchSubtype' '.data.business_dispatch_subtype' '.data.serviceProduct' '.data.service_product')
if [[ "$READBACK_CC" != "$CC_CODE" ]]; then
  log_fail "Expected booking costCenter ${CC_CODE}, got '${READBACK_CC:-<empty>}'"
  exit 1
fi
if [[ "$READBACK_SUBTYPE" != "enterprise_dispatch" ]]; then
  log_fail "Expected businessDispatchSubtype enterprise_dispatch, got '${READBACK_SUBTYPE:-<empty>}'"
  exit 1
fi
save_evidence "$SCENARIO" "tenant" "readbackCostCenter" "$READBACK_CC"
save_evidence "$SCENARIO" "tenant" "readbackServiceProduct" "$READBACK_SUBTYPE"
log_ok "booking read-back preserved cost center + service product binding"

log_surface "Ops console — dispatch assign"
switch_actor "ops_user" "e2e-ops-012"
DISPATCH_FIXTURE="${TMP_DIR}/dispatch.json"
printf '%s\n' '{"mode":"auto"}' > "$DISPATCH_FIXTURE"

http_call POST "/orders/${ORDER_ID}/dispatch" "$DISPATCH_FIXTURE"
assert_status "200|201"
DISPATCH_JOB_ID=$(json_get_first '.data.dispatchJobId' '.data.dispatch_job_id')
if [[ -n "$DISPATCH_JOB_ID" ]]; then
  chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
  save_evidence "$SCENARIO" "ops" "dispatchJobIdAfterTrigger" "$DISPATCH_JOB_ID"
  log_ok "dispatch triggered: ${DISPATCH_JOB_ID}"
else
  log_warn "dispatch trigger response did not include dispatchJobId; falling back to queue poll"
fi

if ! poll_for_dispatch_job; then
  log_fail "No dispatch job found for orderId=${ORDER_ID}"
  exit 1
fi
chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
log_ok "dispatch job found: ${DISPATCH_JOB_ID}"

http_call GET "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates"
assert_status "200"
ASSIGN_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
ASSIGN_DRIVER_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)
if [[ -z "$ASSIGN_VEHICLE_ID" ]]; then
  ASSIGN_VEHICLE_ID="$E2E_SEED_VEHICLE_ID"
fi
if [[ -z "$ASSIGN_DRIVER_ID" ]]; then
  ASSIGN_DRIVER_ID="$E2E_SEED_DRIVER_ID"
fi

ASSIGN_FIXTURE="${TMP_DIR}/assign.json"
jq -n \
  --arg dispatchJobId "$DISPATCH_JOB_ID" \
  --arg vehicleId "$ASSIGN_VEHICLE_ID" \
  --arg driverId "$ASSIGN_DRIVER_ID" \
  '{dispatchJobId: $dispatchJobId, vehicleId: $vehicleId, driverId: $driverId}' > "$ASSIGN_FIXTURE"

http_call POST "/dispatch/assign" "$ASSIGN_FIXTURE"
assert_status "200|201"
TASK_ID=$(json_get_first '.data.taskId' '.data.task_id')
[[ -n "$TASK_ID" ]] || { log_fail "dispatch/assign response missing taskId"; exit 1; }
chain_set "ops" "taskId" "$TASK_ID"
save_evidence "$SCENARIO" "ops" "taskId" "$TASK_ID"
save_evidence "$SCENARIO" "ops" "driverId" "$ASSIGN_DRIVER_ID"
save_evidence "$SCENARIO" "ops" "vehicleId" "$ASSIGN_VEHICLE_ID"
log_ok "dispatch assigned: taskId=${TASK_ID}"

log_surface "Driver app — lifecycle to completed"
switch_actor "driver_user" "e2e-driver-${ASSIGN_DRIVER_ID}" "$E2E_SEED_TENANT_ID"
ACCEPT_AT=$(date -u -d "-6 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-6M +"%Y-%m-%dT%H:%M:%SZ")
DEPART_AT=$(date -u -d "-5 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ")
ARRIVE_AT=$(date -u -d "-4 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-4M +"%Y-%m-%dT%H:%M:%SZ")
START_AT=$(date -u -d "-3 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-3M +"%Y-%m-%dT%H:%M:%SZ")
COMPLETE_AT=$(date -u -d "-2 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-2M +"%Y-%m-%dT%H:%M:%SZ")

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

jq --arg completedAt "$COMPLETE_AT" \
  '.completedAt = $completedAt | .signoff.signedAt = $completedAt' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" > "${TMP_DIR}/complete.json"
http_call POST "/driver/tasks/${TASK_ID}/complete" "${TMP_DIR}/complete.json"
assert_status "200|201"

http_call GET "/driver/tasks/${TASK_ID}"
assert_status "200"
TASK_STATUS=$(json_get '.data.status')
[[ "$TASK_STATUS" == "completed" ]] || { log_fail "Expected completed task, got '${TASK_STATUS:-<empty>}'"; exit 1; }
save_evidence "$SCENARIO" "driver" "taskStatus" "$TASK_STATUS"
save_evidence "$SCENARIO" "driver" "completedAt" "$COMPLETE_AT"
PERIOD_MONTH="${COMPLETE_AT:0:7}"
save_evidence "$SCENARIO" "driver" "periodMonth" "$PERIOD_MONTH"
log_ok "driver lifecycle completed"

log_surface "Tenant portal — completed order visibility"
switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
http_call GET "/tenant/orders?serviceProduct=enterprise_dispatch&costCenterCode=${CC_CODE}&status=completed"
assert_status "200"
VISIBLE_ORDER_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.orderId // .order_id)' 2>/dev/null | head -1 || true)
VISIBLE_ORDER_USER_EMAIL=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | ((.bookedBy // .booked_by).email // empty)' 2>/dev/null | head -1 || true)
VISIBLE_ORDER_USER_STAFF_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | ((.bookedBy // .booked_by).staffId // (.bookedBy // .booked_by).staff_id // empty)' 2>/dev/null | head -1 || true)
VISIBLE_ORDER_USER_NAME=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | ((.bookedBy // .booked_by).name // empty)' 2>/dev/null | head -1 || true)
VISIBLE_ORDER_COST_CENTER=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.costCenter // .costCenterCode // .cost_center // .cost_center_code // empty)' 2>/dev/null | head -1 || true)
VISIBLE_ORDER_SERVICE_PRODUCT=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.businessDispatchSubtype // .business_dispatch_subtype // .serviceProduct // .service_product // empty)' 2>/dev/null | head -1 || true)

[[ "$VISIBLE_ORDER_ID" == "$ORDER_ID" ]] || {
  log_fail "tenant orders list does not surface completed orderId=${ORDER_ID}"
  exit 1
}
if [[ "$VISIBLE_ORDER_USER_EMAIL" != "$BOOKED_BY_EMAIL" && \
      "$VISIBLE_ORDER_USER_STAFF_ID" != "$BOOKED_BY_STAFF_ID" && \
      "$VISIBLE_ORDER_USER_NAME" != "$BOOKED_BY_NAME" ]]; then
  log_fail "tenant orders list did not preserve bookedBy attribution for orderId=${ORDER_ID}"
  log_fail "Observed bookedBy.email='${VISIBLE_ORDER_USER_EMAIL:-<empty>}', staffId='${VISIBLE_ORDER_USER_STAFF_ID:-<empty>}', name='${VISIBLE_ORDER_USER_NAME:-<empty>}'"
  exit 1
fi
[[ "$VISIBLE_ORDER_COST_CENTER" == "$CC_CODE" ]] || {
  log_fail "tenant orders list costCenter expected ${CC_CODE}, got '${VISIBLE_ORDER_COST_CENTER:-<empty>}'"
  exit 1
}
[[ "$VISIBLE_ORDER_SERVICE_PRODUCT" == "enterprise_dispatch" ]] || {
  log_fail "tenant orders list businessDispatchSubtype expected enterprise_dispatch, got '${VISIBLE_ORDER_SERVICE_PRODUCT:-<empty>}'"
  exit 1
}
save_evidence "$SCENARIO" "tenant" "visibleOrderId" "$VISIBLE_ORDER_ID"
save_evidence "$SCENARIO" "tenant" "visibleOrderUserEmail" "${VISIBLE_ORDER_USER_EMAIL:-NOT_PRESENT}"
save_evidence "$SCENARIO" "tenant" "visibleOrderUserStaffId" "${VISIBLE_ORDER_USER_STAFF_ID:-NOT_PRESENT}"
save_evidence "$SCENARIO" "tenant" "visibleOrderUserName" "${VISIBLE_ORDER_USER_NAME:-NOT_PRESENT}"
save_evidence "$SCENARIO" "tenant" "visibleOrderCostCenter" "$VISIBLE_ORDER_COST_CENTER"
save_evidence "$SCENARIO" "tenant" "visibleOrderServiceProduct" "$VISIBLE_ORDER_SERVICE_PRODUCT"
log_ok "tenant orders view preserved order/user/cost center/service product visibility"

log_surface "Billing — generate driver statement for completed trip"
switch_actor "platform_admin" "e2e-platform-admin-012"
http_call GET "/driver-fee-plans"
assert_status "200"
FEE_PLAN_COUNT=$(echo "$RESP_BODY" | jq -r '(.data.items // []) | length' 2>/dev/null || echo "0")
FEE_PLAN_VERSION="e2e-012-${SUFFIX}"
FEE_PLAN_FIXTURE="${TMP_DIR}/driver-fee-plan.json"
jq -n \
  --arg version "$FEE_PLAN_VERSION" \
  '{
    planName: "E2E-012 Driver Fee Plan",
    version: $version,
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded"
  }' > "$FEE_PLAN_FIXTURE"

# Driver statements are idempotent by period + driver + fee-plan version. A
# run-scoped version avoids reusing an older statement that predates this order.
http_call POST "/driver-fee-plans/publish" "$FEE_PLAN_FIXTURE"
if [[ "$RESP_STATUS" == "409" ]]; then
  log_warn "driver fee plan ${FEE_PLAN_VERSION} already exists; continuing"
else
  assert_status "200|201"
  log_ok "published driver fee plan ${FEE_PLAN_VERSION} (existing plans before publish: ${FEE_PLAN_COUNT:-0})"
fi

switch_actor "ops_user" "e2e-ops-012"
STATEMENT_FIXTURE="${TMP_DIR}/driver-statement.json"
jq -n \
  --arg periodMonth "$PERIOD_MONTH" \
  --arg driverId "$ASSIGN_DRIVER_ID" \
  '{periodMonth: $periodMonth, driverId: $driverId}' > "$STATEMENT_FIXTURE"

http_call POST "/driver-statements/generate" "$STATEMENT_FIXTURE"
assert_status "200|201"
DRIVER_STATEMENT_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.items[] | select(any(.lines[]?; (.orderId // .order_id) == $oid)) | (.statementId // .statement_id)' \
  2>/dev/null | head -1 || true)
[[ -n "$DRIVER_STATEMENT_ID" ]] || {
  log_fail "driver statement generation response missing statement for orderId=${ORDER_ID}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
}
chain_set "billing" "driverStatementId" "$DRIVER_STATEMENT_ID"
save_evidence "$SCENARIO" "billing" "driverStatementId" "$DRIVER_STATEMENT_ID"
log_ok "driver statement generated: ${DRIVER_STATEMENT_ID}"

log_surface "Tenant business surfaces — dashboard / payable / statement"
switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

if probe_route "dashboard" "/tenant/dashboard"; then
  DASHBOARD_BOOKING_COUNT=$(json_get_first '.data.bookingCount' '.data.booking_count')
  DASHBOARD_COMPLETED_COUNT=$(json_get_first '.data.completedTripCount' '.data.completed_trip_count')
  DASHBOARD_PAYABLE_MINOR=$(json_get_first '.data.estimatedPayableAmountMinor' '.data.estimated_payable_amount_minor')
  assert_number_ge "dashboard.bookingCount" "$DASHBOARD_BOOKING_COUNT" 1
  assert_number_ge "dashboard.completedTripCount" "$DASHBOARD_COMPLETED_COUNT" 1
  assert_number_ge "dashboard.estimatedPayableAmountMinor" "$DASHBOARD_PAYABLE_MINOR" 1
  save_evidence "$SCENARIO" "dashboard" "bookingCount" "$DASHBOARD_BOOKING_COUNT"
  save_evidence "$SCENARIO" "dashboard" "completedTripCount" "$DASHBOARD_COMPLETED_COUNT"
  save_evidence "$SCENARIO" "dashboard" "estimatedPayableAmountMinor" "$DASHBOARD_PAYABLE_MINOR"
else
  save_evidence "$SCENARIO" "dashboard" "bookingCount" "PROBE_ONLY"
  save_evidence "$SCENARIO" "dashboard" "completedTripCount" "PROBE_ONLY"
  save_evidence "$SCENARIO" "dashboard" "estimatedPayableAmountMinor" "PROBE_ONLY"
fi

if probe_route "payables" "/tenant/payables/summary?periodMonth=${PERIOD_MONTH}"; then
  PAYABLE_TOTAL_TRIPS=$(json_get_first '.data.totalTrips' '.data.total_trips')
  PAYABLE_COMPLETED_TRIPS=$(json_get_first '.data.completedTrips' '.data.completed_trips')
  PAYABLE_AMOUNT_MINOR=$(json_get_first '.data.payableAmountMinor' '.data.payable_amount_minor')
  assert_number_ge "payables.totalTrips" "$PAYABLE_TOTAL_TRIPS" 1
  assert_number_ge "payables.completedTrips" "$PAYABLE_COMPLETED_TRIPS" 1
  assert_number_ge "payables.payableAmountMinor" "$PAYABLE_AMOUNT_MINOR" 1
  save_evidence "$SCENARIO" "payables" "periodMonth" "$PERIOD_MONTH"
  save_evidence "$SCENARIO" "payables" "totalTrips" "$PAYABLE_TOTAL_TRIPS"
  save_evidence "$SCENARIO" "payables" "completedTrips" "$PAYABLE_COMPLETED_TRIPS"
  save_evidence "$SCENARIO" "payables" "payableAmountMinor" "$PAYABLE_AMOUNT_MINOR"
else
  save_evidence "$SCENARIO" "payables" "periodMonth" "$PERIOD_MONTH"
  save_evidence "$SCENARIO" "payables" "totalTrips" "PROBE_ONLY"
  save_evidence "$SCENARIO" "payables" "completedTrips" "PROBE_ONLY"
  save_evidence "$SCENARIO" "payables" "payableAmountMinor" "PROBE_ONLY"
fi

if probe_route "payables" "/tenant/payables/line-items?periodMonth=${PERIOD_MONTH}&serviceProduct=enterprise_dispatch&costCenterCode=${CC_CODE}"; then
  LINE_ORDER_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.orderId // .order_id)' 2>/dev/null | head -1 || true)
  LINE_SERVICE_PRODUCT=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.serviceProduct // .service_product)' 2>/dev/null | head -1 || true)
  LINE_COST_CENTER=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.costCenterCode // .cost_center_code // .costCenter // .cost_center)' 2>/dev/null | head -1 || true)
  [[ "$LINE_ORDER_ID" == "$ORDER_ID" ]] || { log_fail "payable line item missing orderId=${ORDER_ID}"; exit 1; }
  [[ "$LINE_SERVICE_PRODUCT" == "enterprise_dispatch" ]] || { log_fail "payable line item serviceProduct expected enterprise_dispatch, got '${LINE_SERVICE_PRODUCT:-<empty>}'"; exit 1; }
  [[ "$LINE_COST_CENTER" == "$CC_CODE" ]] || { log_fail "payable line item costCenterCode expected ${CC_CODE}, got '${LINE_COST_CENTER:-<empty>}'"; exit 1; }
  save_evidence "$SCENARIO" "payables" "lineItemOrderId" "$LINE_ORDER_ID"
  save_evidence "$SCENARIO" "payables" "lineItemServiceProduct" "$LINE_SERVICE_PRODUCT"
  save_evidence "$SCENARIO" "payables" "lineItemCostCenterCode" "$LINE_COST_CENTER"
  log_ok "payable line item preserved order/service product/cost center"
else
  save_evidence "$SCENARIO" "payables" "lineItemOrderId" "PROBE_ONLY"
  save_evidence "$SCENARIO" "payables" "lineItemServiceProduct" "PROBE_ONLY"
  save_evidence "$SCENARIO" "payables" "lineItemCostCenterCode" "PROBE_ONLY"
fi

if probe_route "statements" "/tenant/statements?periodMonth=${PERIOD_MONTH}"; then
  TENANT_STATEMENT_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[] | select(any(.lines[]?; (.orderId // .order_id) == $oid)) | (.statementId // .statement_id)' \
    2>/dev/null | head -1 || true)
  [[ -n "$TENANT_STATEMENT_ID" ]] || {
    log_fail "tenant statements response missing statement containing orderId=${ORDER_ID}"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  }
  save_evidence "$SCENARIO" "billing" "tenantStatementId" "$TENANT_STATEMENT_ID"
  log_ok "tenant statement surfaced completed order: ${TENANT_STATEMENT_ID}"
else
  save_evidence "$SCENARIO" "billing" "tenantStatementId" "PROBE_ONLY"
fi

log_surface "Billing — tenant invoice"
PERIOD_START=$(date -u -d "-1 day" +"%Y-%m-%dT00:00:00Z" 2>/dev/null || date -u -v-1d +"%Y-%m-%dT00:00:00Z")
PERIOD_END=$(date -u -d "-1 minute" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1M +"%Y-%m-%dT%H:%M:%SZ")
INVOICE_FIXTURE="${TMP_DIR}/invoice.json"
jq -n \
  --arg tenantId "$E2E_SEED_TENANT_ID" \
  --arg periodStart "$PERIOD_START" \
  --arg periodEnd "$PERIOD_END" \
  '{tenantId: $tenantId, periodStart: $periodStart, periodEnd: $periodEnd}' > "$INVOICE_FIXTURE"

http_call POST "/tenant/invoices/generate" "$INVOICE_FIXTURE"
assert_status "200|201"
INVOICE_ID=$(json_get_first '.data.invoiceId' '.data.invoice_id')
[[ -n "$INVOICE_ID" ]] || { log_fail "invoice generation missing invoiceId"; exit 1; }
chain_set "billing" "invoiceId" "$INVOICE_ID"
save_evidence "$SCENARIO" "billing" "invoiceId" "$INVOICE_ID"
log_ok "invoice generated: ${INVOICE_ID}"

ORDER_IN_INVOICE=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
  '.data.lines[] | select((.orderId // .order_id) == $oid) | (.orderId // .order_id)' 2>/dev/null | head -1 || true)
if [[ "$ORDER_IN_INVOICE" != "$ORDER_ID" ]]; then
  log_fail "Generated invoice does not include completed orderId=${ORDER_ID}"
  exit 1
fi
save_evidence "$SCENARIO" "billing" "invoiceLineOrderId" "$ORDER_IN_INVOICE"
log_ok "invoice line bound to completed order"

http_call GET "/tenant/invoices/${INVOICE_ID}"
assert_status "200"
save_evidence "$SCENARIO" "billing" "invoiceStatus" "$(json_get '.data.status')"

log_surface "Reporting — tenant export job"
REPORT_FIXTURE="${TMP_DIR}/report-job.json"
jq -n \
  --arg orderId "$ORDER_ID" \
  --arg userId "$TENANT_ADMIN_USER_ID" \
  --arg costCenterCode "$CC_CODE" \
  --arg serviceProduct "enterprise_dispatch" \
  '{
    jobType: "monthly_trip_report",
    format: "json",
    filters: {
      orderId: $orderId,
      userId: $userId,
      costCenterCode: $costCenterCode,
      serviceProduct: $serviceProduct
    }
  }' > "$REPORT_FIXTURE"

http_call POST "/tenant/reports/jobs" "$REPORT_FIXTURE"
assert_status "200|201"
REPORT_JOB_ID=$(json_get_first '.data.jobId' '.data.job_id')
[[ -n "$REPORT_JOB_ID" ]] || { log_fail "report job queue response missing jobId"; exit 1; }
chain_set "report" "jobId" "$REPORT_JOB_ID"
save_evidence "$SCENARIO" "report" "jobId" "$REPORT_JOB_ID"
log_ok "report job queued: ${REPORT_JOB_ID}"

if ! poll_report_job_completed; then
  log_fail "report job ${REPORT_JOB_ID} did not reach completed"
  exit 1
fi

REPORT_STATUS=$(json_get '.data.status')
REPORT_ARTIFACT_ID=$(json_get_first '.data.artifact.artifactId' '.data.artifact.artifact_id')
[[ "$REPORT_STATUS" == "completed" ]] || { log_fail "report status not completed"; exit 1; }
[[ -n "$REPORT_ARTIFACT_ID" ]] || { log_fail "completed report missing artifactId"; exit 1; }
save_evidence "$SCENARIO" "report" "artifactId" "$REPORT_ARTIFACT_ID"
log_ok "report artifact ready: ${REPORT_ARTIFACT_ID}"

require_report_filter "tenantId" "$E2E_SEED_TENANT_ID"
require_report_filter "orderId" "$ORDER_ID"
require_report_filter "userId" "$TENANT_ADMIN_USER_ID"
require_report_filter "costCenterCode" "$CC_CODE"
require_report_filter "serviceProduct" "enterprise_dispatch"

require_report_field_equals "row.orderId" '.data.rows[0].orderId // .data.rows[0].order_id' "$ORDER_ID"
require_report_field_equals "row.userId" '.data.rows[0].userId // .data.rows[0].user_id' "$TENANT_ADMIN_USER_ID"
require_report_field_equals "row.costCenterCode" '.data.rows[0].costCenterCode // .data.rows[0].cost_center_code' "$CC_CODE"
require_report_field_equals "row.serviceProduct" '.data.rows[0].serviceProduct // .data.rows[0].service_product' "enterprise_dispatch"
require_report_field_equals "row.sourceMarker" '.data.rows[0].sourceMarker // .data.rows[0].source_marker' "owned_mobility_order_feed"
require_report_field_equals "row.costCenterSourceMarker" '.data.rows[0].costCenterSourceMarker // .data.rows[0].cost_center_source_marker' "tenant_partner_cost_center_directory"
require_report_field_present "row.sourceUpdatedAt" '.data.rows[0].sourceUpdatedAt // .data.rows[0].source_updated_at'
require_report_field_present "row.producerRequestId" '.data.rows[0].producerRequestId // .data.rows[0].producer_request_id'

log_surface "Audit evidence"
http_call GET "/tenant/audit"
assert_status "200"
INVOICE_AUDIT_ID=$(echo "$RESP_BODY" | jq -r --arg invoiceId "$INVOICE_ID" \
  '.data.items[] | select((.resourceType // .resource_type) == "tenant_invoice" and (.resourceId // .resource_id) == $invoiceId and (.actionName // .action_name) == "generate_tenant_invoice") | (.auditId // .audit_id)' \
  2>/dev/null | head -1 || true)
REPORT_AUDIT_ID=$(echo "$RESP_BODY" | jq -r --arg jobId "$REPORT_JOB_ID" \
  '.data.items[] | select((.resourceType // .resource_type) == "report_job" and (.resourceId // .resource_id) == $jobId and (.actionName // .action_name) == "complete_report_job") | (.auditId // .audit_id)' \
  2>/dev/null | head -1 || true)
if [[ -z "$INVOICE_AUDIT_ID" ]]; then
  save_evidence "$SCENARIO" "audit" "invoiceAuditId" "NOT_PRESENT"
  log_fail "Invoice audit row not present"
  exit 1
fi
save_evidence "$SCENARIO" "audit" "invoiceAuditId" "$INVOICE_AUDIT_ID"
log_ok "Invoice audit row present: ${INVOICE_AUDIT_ID}"

if [[ -z "$REPORT_AUDIT_ID" ]]; then
  save_evidence "$SCENARIO" "audit" "reportAuditId" "NOT_PRESENT"
  log_fail "Report audit row not present"
  exit 1
fi
save_evidence "$SCENARIO" "audit" "reportAuditId" "$REPORT_AUDIT_ID"
log_ok "Report audit row present: ${REPORT_AUDIT_ID}"

log_step "Chain continuity assertions"
assert_chain "tenant" "bookingId"
assert_chain "tenant" "orderId"
assert_chain "ops" "dispatchJobId"
assert_chain "ops" "taskId"
assert_chain "billing" "driverStatementId"
assert_chain "billing" "invoiceId"
assert_chain "report" "jobId"

print_chain_summary

echo ""
log_ok "E2E-012 complete — tenant booking → trip completion → payable/statement evidence → invoice → report chain passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
