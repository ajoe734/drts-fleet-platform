#!/usr/bin/env bash
# E2E-022 — Operations reporting shell
#
# Workflow target (SD §11.3):
#   multiple source orders
#   -> assign / redispatch / cancel / complete
#   -> complaints
#   -> daily report
#   -> supply snapshots
#   -> six-month summary
#   -> verify counts / coverage
#
# Coverage implemented here:
#   - tenant booking order completes end-to-end
#   - phone/call-center order dispatches, redispatches once, then cancels
#   - two complaint categories are recorded and closed against those orders
#   - daily dispatch records are rebuilt + exported via report job
#   - dispatchable supply snapshots are captured and listed
#   - monthly summaries are rebuilt and six-month summary is previewed + exported
#   - summary verification aggregates counts across all returned groups so mixed
#     order sources do not silently hide one path behind a single filter
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-022"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-022 — Operations reporting shell${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-022-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUFFIX="$(date +%s | tail -c 7)"
SERVICE_DATE="$(date -u +"%Y-%m-%d")"
PERIOD_MONTH="$(date -u +"%Y-%m")"

TENANT_BOOKING_ID=""
TENANT_ORDER_ID=""
TENANT_DISPATCH_JOB_ID=""
TENANT_TASK_ID=""

PHONE_ORDER_ID=""
PHONE_DISPATCH_JOB_ID=""
PHONE_REDIPATCH_JOB_ID=""
PHONE_SECOND_TASK_ID=""

ASSIGN_DRIVER_ID="$E2E_SEED_DRIVER_ID"
ASSIGN_VEHICLE_ID="$E2E_SEED_VEHICLE_ID"

TENANT_COMPLAINT_CASE_NO=""
PHONE_COMPLAINT_CASE_NO=""

DAILY_REPORT_JOB_ID=""
SUMMARY_REPORT_JOB_ID=""

shift_hours_ts() {
  local hours="$1"
  date -u -d "${hours} hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v"${hours}"H +"%Y-%m-%dT%H:%M:%SZ"
}

shift_months_from_date() {
  local base_date="$1"
  local months="$2"
  date -u -d "${base_date} ${months} months" +"%Y-%m-%d" 2>/dev/null \
    || date -u -j -f "%Y-%m-%d" "$base_date" -v"${months}"m +"%Y-%m-%d"
}

require_non_empty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    log_fail "${label} is required but was empty"
    exit 1
  fi
}

assert_equals() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "${label} expected '${expected}', got '${actual:-<empty>}'"
    exit 1
  fi
  log_ok "${label}=${actual}"
}

assert_int_equals() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ -z "$actual" || ! "$actual" =~ ^[0-9]+$ ]]; then
    log_fail "${label} expected integer ${expected}, got '${actual:-<empty>}'"
    exit 1
  fi
  if (( actual != expected )); then
    log_fail "${label} expected ${expected}, got ${actual}"
    exit 1
  fi
  log_ok "${label}=${actual}"
}

assert_number_gt_zero() {
  local label="$1"
  local actual="$2"
  if [[ -z "$actual" ]]; then
    log_fail "${label} expected > 0, got empty"
    exit 1
  fi
  if ! awk -v value="$actual" 'BEGIN { exit !(value > 0) }'; then
    log_fail "${label} expected > 0, got ${actual}"
    exit 1
  fi
  log_ok "${label}=${actual}"
}

poll_for_dispatch_job() {
  local order_id="$1"
  local job_id=""
  local attempt=0
  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/dispatch/tasks"
    assert_status "200"
    job_id=$(echo "$RESP_BODY" | jq -r --arg oid "$order_id" \
      '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
      2>/dev/null | head -1 || true)
    if [[ -n "$job_id" ]]; then
      printf '%s' "$job_id"
      return 0
    fi
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: dispatch job for orderId=${order_id} not visible yet"
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done
  return 1
}

assign_dispatch_job() {
  local dispatch_job_id="$1"
  local task_var="$2"
  local label="${3:-$dispatch_job_id}"
  local assign_fixture="${TMP_DIR}/assign-${label}.json"
  local task_id=""

  http_call GET "/dispatch/tasks/${dispatch_job_id}/candidates"
  assert_status "200"
  local candidate_vehicle_id candidate_driver_id
  candidate_vehicle_id=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
  candidate_driver_id=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)
  if [[ -n "$candidate_vehicle_id" ]]; then
    ASSIGN_VEHICLE_ID="$candidate_vehicle_id"
  fi
  if [[ -n "$candidate_driver_id" ]]; then
    ASSIGN_DRIVER_ID="$candidate_driver_id"
  fi

  jq -n \
    --arg dispatchJobId "$dispatch_job_id" \
    --arg vehicleId "$ASSIGN_VEHICLE_ID" \
    --arg driverId "$ASSIGN_DRIVER_ID" \
    '{dispatchJobId: $dispatchJobId, vehicleId: $vehicleId, driverId: $driverId}' \
    > "$assign_fixture"

  http_call POST "/dispatch/assign" "$assign_fixture"
  assert_status "200|201"
  task_id=$(json_get_first ".data.taskId" ".data.task_id")
  require_non_empty "$task_id" "taskId for ${label}"

  printf -v "$task_var" '%s' "$task_id"
}

dispatch_and_assign() {
  local order_id="$1"
  local job_var="$2"
  local task_var="$3"
  local dispatch_fixture="${TMP_DIR}/dispatch-${order_id}.json"
  local dispatch_job_id=""

  printf '%s\n' '{"mode":"auto"}' > "$dispatch_fixture"
  http_call POST "/orders/${order_id}/dispatch" "$dispatch_fixture"
  assert_status "200|201"
  dispatch_job_id=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
  if [[ -z "$dispatch_job_id" ]]; then
    dispatch_job_id="$(poll_for_dispatch_job "$order_id")"
  fi
  require_non_empty "$dispatch_job_id" "dispatchJobId for ${order_id}"

  assign_dispatch_job "$dispatch_job_id" "$task_var" "$order_id"
  printf -v "$job_var" '%s' "$dispatch_job_id"
}

complete_task() {
  local task_id="$1"
  local now_ts
  now_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  jq --arg ts "$now_ts" '.acceptedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" \
    > "${TMP_DIR}/accept-${task_id}.json"
  http_call POST "/driver/tasks/${task_id}/accept" "${TMP_DIR}/accept-${task_id}.json"
  assert_status "200|201"

  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.departedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-depart.json" \
    > "${TMP_DIR}/depart-${task_id}.json"
  http_call POST "/driver/tasks/${task_id}/depart" "${TMP_DIR}/depart-${task_id}.json"
  assert_status "200|201"

  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.arrivedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-arrived-pickup.json" \
    > "${TMP_DIR}/arrive-${task_id}.json"
  http_call POST "/driver/tasks/${task_id}/arrived_pickup" "${TMP_DIR}/arrive-${task_id}.json"
  assert_status "200|201"

  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.startedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-start.json" \
    > "${TMP_DIR}/start-${task_id}.json"
  http_call POST "/driver/tasks/${task_id}/start" "${TMP_DIR}/start-${task_id}.json"
  assert_status "200|201"

  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    '.completedAt = $ts | .signoff.signedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" \
    > "${TMP_DIR}/complete-${task_id}.json"
  http_call POST "/driver/tasks/${task_id}/complete" "${TMP_DIR}/complete-${task_id}.json"
  assert_status "200|201"
}

create_and_close_complaint() {
  local related_order_id="$1"
  local category="$2"
  local resolution_code="$3"
  local case_var="$4"
  local complaint_fixture="${TMP_DIR}/complaint-${related_order_id}.json"
  local close_fixture="${TMP_DIR}/complaint-close-${related_order_id}.json"
  local case_no=""

  jq -n \
    --arg relatedOrderId "$related_order_id" \
    --arg category "$category" \
    '{
      caseSource: "ops",
      relatedOrderId: $relatedOrderId,
      category: $category,
      severity: "normal",
      description: ("E2E-022 " + $category + " follow-up")
    }' > "$complaint_fixture"

  http_call POST "/complaints" "$complaint_fixture"
  assert_status "200|201"
  case_no=$(json_get_first ".data.caseNo" ".data.case_no")
  require_non_empty "$case_no" "complaint caseNo"

  jq -n \
    --arg resolutionCode "$resolution_code" \
    '{resolutionCode: $resolutionCode, closingNote: "E2E-022 complaint closure"}' \
    > "$close_fixture"
  http_call POST "/complaints/${case_no}/close" "$close_fixture"
  assert_status "200|201"

  printf -v "$case_var" '%s' "$case_no"
}

create_report_job_and_wait() {
  local job_type="$1"
  local filters_json="$2"
  local job_var="$3"
  local fixture="${TMP_DIR}/report-${job_type}.json"
  local job_id=""

  jq -n \
    --arg jobType "$job_type" \
    --argjson filters "$filters_json" \
    '{jobType: $jobType, format: "json", filters: $filters}' \
    > "$fixture"
  http_call POST "/reports/jobs" "$fixture"
  assert_status "200|201"
  job_id=$(json_get_first ".data.jobId" ".data.job_id")
  require_non_empty "$job_id" "report jobId (${job_type})"
  poll_until_field "/reports/${job_id}" "status" "completed"
  http_call GET "/reports/${job_id}"
  assert_status "200"
  printf -v "$job_var" '%s' "$job_id"
}

month_first_day() {
  printf '%s-01' "$1"
}

SUMMARY_FROM="$(shift_months_from_date "$(month_first_day "$PERIOD_MONTH")" -5)"
SUMMARY_TO="$SERVICE_DATE"
SNAPSHOT_AT_ONE="${SERVICE_DATE}T01:05:00Z"
SNAPSHOT_AT_TWO="${SERVICE_DATE}T01:10:00Z"
LOCATION_AT_ONE="${SERVICE_DATE}T01:04:40Z"
LOCATION_AT_TWO="${SERVICE_DATE}T01:09:40Z"

# ══════════════════════════════════════════════════════════════════════════════
# 1. Create multiple source orders
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Tenant + call center — create source orders"

switch_actor "tenant_admin" "e2e-tenant-admin-022" "${E2E_SEED_TENANT_ID}"
TENANT_WINDOW_START="$(shift_hours_ts +1)"
TENANT_WINDOW_END="$(shift_hours_ts +2)"

jq \
  --arg ws "$TENANT_WINDOW_START" \
  --arg we "$TENANT_WINDOW_END" \
  --arg passengerName "E2E-022 Tenant Rider" \
  --arg staffId "e2e-022-tenant-${SUFFIX}" \
  --arg phone "+886900220001" \
  '.reservationWindowStart = $ws
   | .reservationWindowEnd = $we
   | .passenger.name = $passengerName
   | .passenger.phone = $phone
   | .bookedBy.staffId = $staffId' \
  "${SCRIPT_DIR}/fixtures/e2e-booking-enterprise.json" \
  > "${TMP_DIR}/tenant-booking.json"

log_step "1.1 — POST /tenant/bookings"
http_call POST "/tenant/bookings" "${TMP_DIR}/tenant-booking.json"
assert_status "200|201"
TENANT_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
require_non_empty "$TENANT_BOOKING_ID" "tenant bookingId"

log_step "1.2 — GET /tenant/bookings/:bookingId"
http_call GET "/tenant/bookings/${TENANT_BOOKING_ID}"
assert_status "200"
TENANT_ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
require_non_empty "$TENANT_ORDER_ID" "tenant orderId"
save_evidence "$SCENARIO" "tenant" "bookingId" "$TENANT_BOOKING_ID"
save_evidence "$SCENARIO" "tenant" "orderId" "$TENANT_ORDER_ID"
chain_set "tenant" "bookingId" "$TENANT_BOOKING_ID"
chain_set "tenant" "orderId" "$TENANT_ORDER_ID"

switch_actor "ops_user" "e2e-ops-022"
jq \
  --arg callId "e2e-022-call-${SUFFIX}" \
  --arg agentId "e2e-022-agent-${SUFFIX}" \
  --arg recordingId "e2e-022-rec-${SUFFIX}" \
  --arg passengerName "E2E-022 Phone Rider" \
  --arg passengerPhone "+886900220002" \
  '.callId = $callId
   | .agentId = $agentId
   | .recordingId = $recordingId
   | .passenger.name = $passengerName
   | .passenger.phone = $passengerPhone' \
  "${SCRIPT_DIR}/fixtures/e2e-phone-booking.json" \
  > "${TMP_DIR}/phone-order.json"

log_step "1.3 — POST /call-center/orders"
http_call POST "/call-center/orders" "${TMP_DIR}/phone-order.json"
assert_status "200|201"
PHONE_ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
require_non_empty "$PHONE_ORDER_ID" "phone orderId"
save_evidence "$SCENARIO" "phone" "orderId" "$PHONE_ORDER_ID"
chain_set "phone" "orderId" "$PHONE_ORDER_ID"

log_step "1.4 — GET /orders/:orderId"
http_call GET "/orders/${PHONE_ORDER_ID}"
assert_status "200"
assert_equals "phone orderSource" "$(json_get_first ".data.orderSource" ".data.order_source")" "phone"
assert_equals "phone order status" "$(json_get ".data.status")" "ready_for_dispatch"

# ══════════════════════════════════════════════════════════════════════════════
# 2. Assign / complete tenant order
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Dispatch + driver — complete tenant order"

log_step "2.1 — dispatch and assign tenant order"
dispatch_and_assign "$TENANT_ORDER_ID" TENANT_DISPATCH_JOB_ID TENANT_TASK_ID
save_evidence "$SCENARIO" "dispatch" "tenantDispatchJobId" "$TENANT_DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "dispatch" "tenantTaskId" "$TENANT_TASK_ID"
chain_set "dispatch" "tenantDispatchJobId" "$TENANT_DISPATCH_JOB_ID"
chain_set "dispatch" "tenantTaskId" "$TENANT_TASK_ID"

switch_actor "driver_user" "e2e-driver-${ASSIGN_DRIVER_ID}" "${E2E_SEED_TENANT_ID}"
log_step "2.2 — complete tenant driver lifecycle"
complete_task "$TENANT_TASK_ID"

switch_actor "tenant_admin" "e2e-tenant-admin-022" "${E2E_SEED_TENANT_ID}"
log_step "2.3 — verify tenant booking completed"
http_call GET "/tenant/bookings/${TENANT_BOOKING_ID}"
assert_status "200"
assert_equals "tenant booking final status" "$(json_get ".data.status")" "completed"

# ══════════════════════════════════════════════════════════════════════════════
# 3. Assign / redispatch / cancel phone order
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Dispatch — redispatch and cancel phone order"

switch_actor "ops_user" "e2e-ops-022"
log_step "3.1 — dispatch and assign phone order"
dispatch_and_assign "$PHONE_ORDER_ID" PHONE_DISPATCH_JOB_ID PHONE_SECOND_TASK_ID
save_evidence "$SCENARIO" "dispatch" "phoneDispatchJobId" "$PHONE_DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "dispatch" "phoneFirstTaskId" "$PHONE_SECOND_TASK_ID"

log_step "3.2 — POST /orders/:orderId/redispatch"
jq -n \
  '{reasonCode: "operator_redispatch", operatorId: "e2e-ops-022", reasonNote: "E2E-022 redispatch coverage"}' \
  > "${TMP_DIR}/redispatch-phone.json"
http_call POST "/orders/${PHONE_ORDER_ID}/redispatch" "${TMP_DIR}/redispatch-phone.json"
assert_status "200|201"
PHONE_REDIPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
if [[ -z "$PHONE_REDIPATCH_JOB_ID" ]]; then
  PHONE_REDIPATCH_JOB_ID="$(poll_for_dispatch_job "$PHONE_ORDER_ID")"
fi
require_non_empty "$PHONE_REDIPATCH_JOB_ID" "phone redispatchJobId"
save_evidence "$SCENARIO" "dispatch" "phoneRedispatchJobId" "$PHONE_REDIPATCH_JOB_ID"

log_step "3.3 — assign redispatched phone order"
PHONE_SECOND_TASK_ID=""
assign_dispatch_job "$PHONE_REDIPATCH_JOB_ID" PHONE_SECOND_TASK_ID "$PHONE_ORDER_ID-redispatch"
save_evidence "$SCENARIO" "dispatch" "phoneSecondTaskId" "$PHONE_SECOND_TASK_ID"

log_step "3.4 — POST /passenger/orders/:orderId/cancel"
jq -n '{reason: "passenger_cancelled"}' > "${TMP_DIR}/cancel-phone.json"
http_call POST "/passenger/orders/${PHONE_ORDER_ID}/cancel" "${TMP_DIR}/cancel-phone.json"
assert_status "200|201"

log_step "3.5 — GET /orders/:orderId"
http_call GET "/orders/${PHONE_ORDER_ID}"
assert_status "200"
assert_equals "phone order final status" "$(json_get ".data.status")" "cancelled"

# ══════════════════════════════════════════════════════════════════════════════
# 4. Complaints
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Complaints — create and close category evidence"

switch_actor "ops_user" "e2e-ops-022"
log_step "4.1 — complaint for completed tenant order"
create_and_close_complaint \
  "$TENANT_ORDER_ID" \
  "late_arrival" \
  "resolved_with_apology" \
  TENANT_COMPLAINT_CASE_NO

log_step "4.2 — complaint for cancelled phone order"
create_and_close_complaint \
  "$PHONE_ORDER_ID" \
  "no_arrival" \
  "resolved_with_corrective_action" \
  PHONE_COMPLAINT_CASE_NO

save_evidence "$SCENARIO" "complaints" "tenantCaseNo" "$TENANT_COMPLAINT_CASE_NO"
save_evidence "$SCENARIO" "complaints" "phoneCaseNo" "$PHONE_COMPLAINT_CASE_NO"

# ══════════════════════════════════════════════════════════════════════════════
# 5. Daily report rebuild + report job verification
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Reporting — daily dispatch records"

log_step "5.1 — POST /reports/daily-dispatch-records/rebuild"
jq -n --arg serviceDate "$SERVICE_DATE" '{serviceDate: $serviceDate}' \
  > "${TMP_DIR}/daily-rebuild.json"
http_call POST "/reports/daily-dispatch-records/rebuild" "${TMP_DIR}/daily-rebuild.json"
assert_status "200|201"

log_step "5.2 — GET /reports/daily-dispatch-records"
http_call GET "/reports/daily-dispatch-records?serviceDate=${SERVICE_DATE}"
assert_status "200"
DAILY_ROW_COUNT=$(echo "$RESP_BODY" | jq -r '.data.items | length' 2>/dev/null || true)
assert_int_equals "daily row count" "${DAILY_ROW_COUNT:-0}" 2

TENANT_DAILY_STATUS=$(echo "$RESP_BODY" | jq -r --arg oid "$TENANT_ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.finalStatus // .final_status)' \
  2>/dev/null | head -1 || true)
PHONE_DAILY_STATUS=$(echo "$RESP_BODY" | jq -r --arg oid "$PHONE_ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.finalStatus // .final_status)' \
  2>/dev/null | head -1 || true)
PHONE_REDIPATCH_COUNT=$(echo "$RESP_BODY" | jq -r --arg oid "$PHONE_ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.redispatchCount // .redispatch_count)' \
  2>/dev/null | head -1 || true)
TENANT_COMPLAINT_COUNT=$(echo "$RESP_BODY" | jq -r --arg oid "$TENANT_ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.complaintCount // .complaint_count)' \
  2>/dev/null | head -1 || true)
PHONE_COMPLAINT_COUNT=$(echo "$RESP_BODY" | jq -r --arg oid "$PHONE_ORDER_ID" \
  '.data.items[] | select((.orderId // .order_id) == $oid) | (.complaintCount // .complaint_count)' \
  2>/dev/null | head -1 || true)

assert_equals "tenant daily finalStatus" "$TENANT_DAILY_STATUS" "completed"
assert_equals "phone daily finalStatus" "$PHONE_DAILY_STATUS" "cancelled"
assert_int_equals "phone daily redispatchCount" "$PHONE_REDIPATCH_COUNT" 1
assert_int_equals "tenant daily complaintCount" "$TENANT_COMPLAINT_COUNT" 1
assert_int_equals "phone daily complaintCount" "$PHONE_COMPLAINT_COUNT" 1

log_step "5.3 — POST /reports/jobs (daily_dispatch_record)"
create_report_job_and_wait \
  "daily_dispatch_record" \
  "{\"serviceDate\":\"${SERVICE_DATE}\"}" \
  DAILY_REPORT_JOB_ID

DAILY_JOB_ROW_COUNT=$(echo "$RESP_BODY" | jq -r '.data.rows | length' 2>/dev/null || true)
assert_int_equals "daily report job row count" "${DAILY_JOB_ROW_COUNT:-0}" 2

# ══════════════════════════════════════════════════════════════════════════════
# 6. Supply snapshots
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Reporting — dispatchable supply snapshots"

log_step "6.1 — seed driver locations for complete snapshots"
jq -n \
  --arg driverId "$ASSIGN_DRIVER_ID" \
  --arg recordedAt "$LOCATION_AT_ONE" \
  '{driverId: $driverId, lat: 24.2668, lng: 120.6204, accuracyM: 25, recordedAt: $recordedAt}' \
  > "${TMP_DIR}/driver-location-1.json"
http_call POST "/regulatory-registry/driver-location" "${TMP_DIR}/driver-location-1.json"
assert_status "200|201"

jq -n \
  --arg driverId "$ASSIGN_DRIVER_ID" \
  --arg recordedAt "$LOCATION_AT_TWO" \
  '{driverId: $driverId, lat: 24.2668, lng: 120.6204, accuracyM: 20, recordedAt: $recordedAt}' \
  > "${TMP_DIR}/driver-location-2.json"
http_call POST "/regulatory-registry/driver-location" "${TMP_DIR}/driver-location-2.json"
assert_status "200|201"

log_step "6.2 — POST /reports/dispatchable-supply-snapshots/rebuild"
jq -n --arg snapshotAt "$SNAPSHOT_AT_ONE" '{snapshotAt: $snapshotAt}' \
  > "${TMP_DIR}/snapshot-1.json"
http_call POST "/reports/dispatchable-supply-snapshots/rebuild" "${TMP_DIR}/snapshot-1.json"
assert_status "200|201"

jq -n --arg snapshotAt "$SNAPSHOT_AT_TWO" '{snapshotAt: $snapshotAt}' \
  > "${TMP_DIR}/snapshot-2.json"
http_call POST "/reports/dispatchable-supply-snapshots/rebuild" "${TMP_DIR}/snapshot-2.json"
assert_status "200|201"

log_step "6.3 — GET /reports/dispatchable-supply-snapshots"
http_call GET "/reports/dispatchable-supply-snapshots"
assert_status "200"
SNAPSHOT_LIST_COUNT=$(echo "$RESP_BODY" | jq -r '.data.items | length' 2>/dev/null || true)
assert_number_gt_zero "snapshot list count" "${SNAPSHOT_LIST_COUNT:-0}"

COMPLETE_SNAPSHOT_COUNT=$(echo "$RESP_BODY" | jq -r \
  '[.data.items[] | select((.sourceHealth // .source_health) == "complete")] | length' \
  2>/dev/null || true)
assert_number_gt_zero "complete snapshot count" "${COMPLETE_SNAPSHOT_COUNT:-0}"

# ══════════════════════════════════════════════════════════════════════════════
# 7. Six-month summary rebuild + verification
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Reporting — monthly + six-month operations summary"

log_step "7.1 — POST /reports/monthly-operations-summaries/rebuild"
jq -n --arg periodMonth "$PERIOD_MONTH" '{periodMonth: $periodMonth}' \
  > "${TMP_DIR}/monthly-rebuild.json"
http_call POST "/reports/monthly-operations-summaries/rebuild" "${TMP_DIR}/monthly-rebuild.json"
assert_status "200|201"

log_step "7.2 — GET /reports/operations-summary/preview"
http_call GET "/reports/operations-summary/preview?from=${SUMMARY_FROM}&to=${SUMMARY_TO}"
assert_status "200"
SUMMARY_GROUP_COUNT=$(echo "$RESP_BODY" | jq -r '.data.items | length' 2>/dev/null || true)
assert_number_gt_zero "summary group count" "${SUMMARY_GROUP_COUNT:-0}"

SUMMARY_TOTAL_DEMAND=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.demandRequestCount // .demand_request_count // 0)] | add' 2>/dev/null || true)
SUMMARY_TOTAL_DISPATCH=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.actualDispatchCount // .actual_dispatch_count // 0)] | add' 2>/dev/null || true)
SUMMARY_TOTAL_COMPLETED=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.completedTripCount // .completed_trip_count // 0)] | add' 2>/dev/null || true)
SUMMARY_TOTAL_CANCELLED=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.cancelledOrderCount // .cancelled_order_count // 0)] | add' 2>/dev/null || true)
SUMMARY_TOTAL_COMPLAINTS=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.complaintCount // .complaint_count // 0)] | add' 2>/dev/null || true)
SUMMARY_TOTAL_VALID_SNAPSHOTS=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.validSnapshotCount // .valid_snapshot_count // 0)] | add' 2>/dev/null || true)
SUMMARY_MAX_COVERAGE=$(echo "$RESP_BODY" | jq -r '[.data.items[] | (.snapshotCoverageRate // .snapshot_coverage_rate // 0)] | max' 2>/dev/null || true)

assert_int_equals "summary total demandRequestCount" "${SUMMARY_TOTAL_DEMAND:-0}" 2
assert_int_equals "summary total actualDispatchCount" "${SUMMARY_TOTAL_DISPATCH:-0}" 2
assert_int_equals "summary total completedTripCount" "${SUMMARY_TOTAL_COMPLETED:-0}" 1
assert_int_equals "summary total cancelledOrderCount" "${SUMMARY_TOTAL_CANCELLED:-0}" 1
assert_int_equals "summary total complaintCount" "${SUMMARY_TOTAL_COMPLAINTS:-0}" 2
assert_number_gt_zero "summary total validSnapshotCount" "${SUMMARY_TOTAL_VALID_SNAPSHOTS:-0}"
assert_number_gt_zero "summary max snapshotCoverageRate" "${SUMMARY_MAX_COVERAGE:-0}"

log_step "7.3 — POST /reports/jobs (six_month_operations_summary)"
create_report_job_and_wait \
  "six_month_operations_summary" \
  "{\"from\":\"${SUMMARY_FROM}\",\"to\":\"${SUMMARY_TO}\"}" \
  SUMMARY_REPORT_JOB_ID

SUMMARY_JOB_GROUP_COUNT=$(echo "$RESP_BODY" | jq -r '.data.rows | length' 2>/dev/null || true)
assert_number_gt_zero "summary report job row count" "${SUMMARY_JOB_GROUP_COUNT:-0}"

save_evidence "$SCENARIO" "reporting" "dailyReportJobId" "$DAILY_REPORT_JOB_ID"
save_evidence "$SCENARIO" "reporting" "summaryReportJobId" "$SUMMARY_REPORT_JOB_ID"

log_step "Chain continuity assertions"
assert_chain "tenant" "bookingId"
assert_chain "tenant" "orderId"
assert_chain "phone" "orderId"
assert_chain "dispatch" "tenantDispatchJobId"
assert_chain "dispatch" "tenantTaskId"

print_chain_summary

echo ""
log_ok "E2E-022 complete — operations reporting flow passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
