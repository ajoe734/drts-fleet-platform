#!/usr/bin/env bash
# E2E-022 — Operations reporting shell
#
# SD §11.3 target flow:
#   multiple source orders
#   -> assign / redispatch / cancel / complete
#   -> complaints
#   -> daily report
#   -> supply snapshots
#   -> six-month summary
#   -> verify counts / coverage
#
# This scenario is written for the hermetic runner:
#   ./tests/e2e/run-e2e-hermetic.sh 022
#
# Hard fail:
#   - the app / phone / tenant-portal orders do not reach the intended end state
#   - complaint creation does not bind back to the owned orders
#   - daily dispatch records lose source / lifecycle / complaint facts
#   - dispatchable supply snapshots for the taxi_realtime group do not reach
#     complete source health after fresh locations are recorded for every
#     dispatch candidate the scenario discovered
#   - monthly summary / preview / report-job surfaces lose counts, complaint
#     grouping, or coverage math
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
SUMMARY_MONTH="${SERVICE_DATE:0:7}"
SUMMARY_FROM_DATE="${SUMMARY_MONTH}-01"
SUMMARY_TO_DATE=$(
  date -u -d "${SUMMARY_FROM_DATE} +1 month -1 day" +"%Y-%m-%d" 2>/dev/null \
    || date -u -j -f "%Y-%m-%d" "${SUMMARY_FROM_DATE}" -v+1m -v-1d +"%Y-%m-%d"
)
PORTAL_WINDOW_START="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
PORTAL_WINDOW_END=$(
  date -u -d "+30 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+30M +"%Y-%m-%dT%H:%M:%SZ"
)

APP_ORDER_ID=""
APP_DISPATCH_JOB_ID=""
APP_TASK_ID=""
APP_DRIVER_ID=""
APP_VEHICLE_ID=""

PHONE_ORDER_ID=""
PHONE_DISPATCH_JOB_ID=""
PHONE_REDISPATCH_JOB_ID=""
PHONE_TASK_ID=""
PHONE_DRIVER_ID=""
PHONE_VEHICLE_ID=""

PORTAL_BOOKING_ID=""
PORTAL_ORDER_ID=""
PORTAL_DISPATCH_JOB_ID=""
PORTAL_TASK_ID=""
PORTAL_DRIVER_ID=""
PORTAL_VEHICLE_ID=""

APP_COMPLAINT_CASE_NO=""
PHONE_COMPLAINT_CASE_NO=""

DAILY_REPORT_JOB_ID=""
SUMMARY_REPORT_JOB_ID=""
TAXI_BUSINESS_AREA=""

declare -a TAXI_CANDIDATE_DRIVERS=()
declare -a TAXI_CANDIDATE_VEHICLES=()
declare -a CANDIDATE_LINES=()

current_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

assert_non_empty() {
  local label="$1" value="${2:-}"
  if [[ -z "$value" || "$value" == "null" ]]; then
    log_fail "${label} is empty"
    exit 1
  fi
  log_ok "${label}=${value}"
}

assert_equals() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "${label} expected '${expected}', got '${actual:-<empty>}'"
    exit 1
  fi
  log_ok "${label}=${actual}"
}

assert_int_equals() {
  local label="$1" expected="$2" actual="$3"
  if [[ -z "$actual" || ! "$actual" =~ ^-?[0-9]+$ ]]; then
    log_fail "${label} expected integer ${expected}, got '${actual:-<empty>}'"
    exit 1
  fi
  if (( actual != expected )); then
    log_fail "${label} expected ${expected}, got ${actual}"
    exit 1
  fi
  log_ok "${label}=${actual}"
}

assert_int_ge() {
  local label="$1" minimum="$2" actual="$3"
  if [[ -z "$actual" || ! "$actual" =~ ^-?[0-9]+$ ]]; then
    log_fail "${label} expected integer >= ${minimum}, got '${actual:-<empty>}'"
    exit 1
  fi
  if (( actual < minimum )); then
    log_fail "${label} expected >= ${minimum}, got ${actual}"
    exit 1
  fi
  log_ok "${label}=${actual} (>= ${minimum})"
}

round_four() {
  awk -v value="$1" 'BEGIN { printf "%.4f", value + 0 }'
}

unique_count() {
  if [[ $# -eq 0 ]]; then
    echo 0
    return 0
  fi
  printf '%s\n' "$@" | awk 'NF { seen[$0]=1 } END { print length(seen) }'
}

json_field_from_object() {
  local json_object="$1" jq_expr="$2"
  echo "$json_object" | jq -r "${jq_expr} // empty" 2>/dev/null || true
}

extract_item_by_order_id() {
  local order_id="$1"
  echo "$RESP_BODY" | jq -c --arg oid "$order_id" \
    '(.data.items // .data.records // [])[]?
     | select((.orderId // .order_id) == $oid)' \
    2>/dev/null | head -1 || true
}

extract_item_by_snapshot_at() {
  local snapshot_at="$1"
  echo "$RESP_BODY" | jq -c --arg sat "$snapshot_at" \
    '(.data.items // .data.records // [])[]?
     | select((.snapshotAt // .snapshot_at) == $sat)' \
    2>/dev/null | head -1 || true
}

extract_snapshot_record() {
  local snapshot_at="$1" business_area="$2" service_product_code="$3"
  echo "$RESP_BODY" | jq -c \
    --arg sat "$snapshot_at" \
    --arg area "$business_area" \
    --arg serviceProductCode "$service_product_code" \
    '(.data.items // .data.records // [])[]?
     | select((.snapshotAt // .snapshot_at) == $sat)
     | select((.businessArea // .business_area) == $area)
     | select((.serviceProductCode // .service_product_code) == $serviceProductCode)' \
    2>/dev/null | head -1 || true
}

record_taxi_candidate_union() {
  local line driver_id vehicle_id
  for line in "${CANDIDATE_LINES[@]}"; do
    driver_id="${line%%$'\t'*}"
    vehicle_id="${line#*$'\t'}"
    TAXI_CANDIDATE_DRIVERS+=("$driver_id")
    TAXI_CANDIDATE_VEHICLES+=("$vehicle_id")
  done
}

write_app_order_fixture() {
  local path="$1"
  jq -n \
    --arg pickup "10 E2E App Pickup ${SUFFIX}" \
    --arg dropoff "20 E2E App Dropoff ${SUFFIX}" \
    --arg passengerName "E2E App Rider ${SUFFIX}" \
    --arg passengerPhone "+886900100${SUFFIX}" \
    '{
      pickup: {
        address: $pickup,
        lat: 25.041,
        lng: 121.55,
        placeId: "e2e-022-app-taipei-core-pickup",
        geocodeProvider: "drts_mock_map",
        geocodeConfidence: "exact",
        coordinateSource: "provider_candidate",
        coordinateAccuracyM: 12,
        providerCandidateId: "mock-e2e-022-app-taipei-core-pickup"
      },
      dropoff: {
        address: $dropoff,
        lat: 25.06,
        lng: 121.58,
        placeId: "e2e-022-app-taipei-core-dropoff",
        geocodeProvider: "drts_mock_map",
        geocodeConfidence: "exact",
        coordinateSource: "provider_candidate",
        coordinateAccuracyM: 14,
        providerCandidateId: "mock-e2e-022-app-taipei-core-dropoff"
      },
      passenger: {
        name: $passengerName,
        phone: $passengerPhone
      },
      rideType: "immediate",
      paymentMethod: "cash"
    }' > "$path"
}

write_call_center_order_fixture() {
  local path="$1"
  jq -n \
    --arg callId "e2e-022-call-${SUFFIX}" \
    --arg agentId "e2e-022-agent-${SUFFIX}" \
    --arg recordingId "e2e-022-rec-${SUFFIX}" \
    --arg pickup "30 E2E Phone Pickup ${SUFFIX}" \
    --arg dropoff "40 E2E Phone Dropoff ${SUFFIX}" \
    --arg passengerName "E2E Phone Rider ${SUFFIX}" \
    --arg passengerPhone "+886900200${SUFFIX}" \
    '{
      callId: $callId,
      agentId: $agentId,
      recordingId: $recordingId,
      pickup: {
        address: $pickup,
        lat: 25.042,
        lng: 121.552,
        placeId: "e2e-022-phone-taipei-core-pickup",
        geocodeProvider: "drts_mock_map",
        geocodeConfidence: "exact",
        coordinateSource: "provider_candidate",
        coordinateAccuracyM: 12,
        providerCandidateId: "mock-e2e-022-phone-taipei-core-pickup"
      },
      dropoff: {
        address: $dropoff,
        lat: 25.061,
        lng: 121.579,
        placeId: "e2e-022-phone-taipei-core-dropoff",
        geocodeProvider: "drts_mock_map",
        geocodeConfidence: "exact",
        coordinateSource: "provider_candidate",
        coordinateAccuracyM: 14,
        providerCandidateId: "mock-e2e-022-phone-taipei-core-dropoff"
      },
      passenger: {
        name: $passengerName,
        phone: $passengerPhone
      },
      notes: "E2E-022 phone order"
    }' > "$path"
}

write_portal_booking_fixture() {
  local path="$1"
  jq \
    --arg ws "$PORTAL_WINDOW_START" \
    --arg we "$PORTAL_WINDOW_END" \
    '.reservationWindowStart = $ws | .reservationWindowEnd = $we' \
    "${SCRIPT_DIR}/fixtures/e2e-booking-enterprise.json" > "$path"
}

write_assign_fixture() {
  local path="$1" dispatch_job_id="$2" vehicle_id="$3" driver_id="$4"
  jq \
    --arg jobId "$dispatch_job_id" \
    --arg vehicleId "$vehicle_id" \
    --arg driverId "$driver_id" \
    '.dispatchJobId = $jobId | .vehicleId = $vehicleId | .driverId = $driverId' \
    "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$path"
}

write_cancel_fixture() {
  local path="$1" reason="$2"
  jq -n --arg reason "$reason" '{reason: $reason}' > "$path"
}

write_redispatch_fixture() {
  local path="$1"
  jq -n \
    --arg operatorId "e2e-ops-022" \
    '{
      reasonCode: "operator_redispatch",
      reasonNote: "E2E-022 redispatch path",
      operatorId: $operatorId,
      escalationTarget: "ops_supervisor"
    }' > "$path"
}

write_complaint_fixture() {
  local path="$1" order_id="$2" category="$3" description="$4"
  jq -n \
    --arg orderId "$order_id" \
    --arg category "$category" \
    --arg description "$description" \
    '{
      caseSource: "ops",
      relatedOrderId: $orderId,
      category: $category,
      severity: "normal",
      description: $description
    }' > "$path"
}

poll_for_dispatch_job() {
  local order_id="$1"
  local attempt=0

  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/dispatch/tasks"
    assert_status "200"
    local dispatch_job_id
    dispatch_job_id=$(echo "$RESP_BODY" | jq -r --arg oid "$order_id" \
      '.data.items[]? | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
      2>/dev/null | head -1 || true)
    if [[ -n "$dispatch_job_id" ]]; then
      echo "$dispatch_job_id"
      return 0
    fi
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: dispatch job for orderId=${order_id} not visible yet" >&2
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  log_fail "Dispatch job for orderId=${order_id} was not visible after polling"
  exit 1
}

poll_for_task_by_order() {
  local order_id="$1"
  local attempt=0

  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/driver/tasks"
    assert_status "200"
    local task_id
    task_id=$(echo "$RESP_BODY" | jq -r --arg oid "$order_id" \
      '.data.items[]? | select((.orderId // .order_id) == $oid) | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)
    if [[ -n "$task_id" ]]; then
      echo "$task_id"
      return 0
    fi
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: driver task for orderId=${order_id} not visible yet" >&2
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  log_fail "Driver task for orderId=${order_id} was not visible after polling"
  exit 1
}

read_dispatch_candidates() {
  local dispatch_job_id="$1"
  CANDIDATE_LINES=()

  http_call GET "/dispatch/tasks/${dispatch_job_id}/candidates"
  assert_status "200"

  mapfile -t CANDIDATE_LINES < <(
    echo "$RESP_BODY" | jq -r \
      '.data.items[]?
       | select((.driverId // .driver_id // "") != "")
       | select((.vehicleId // .vehicle_id // "") != "")
       | "\(.driverId // .driver_id)\t\(.vehicleId // .vehicle_id)"' \
      2>/dev/null
  )

  if [[ "${#CANDIDATE_LINES[@]}" -eq 0 ]]; then
    log_fail "Dispatch job ${dispatch_job_id} returned no candidates"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi

  save_evidence "$SCENARIO" "dispatch" "${dispatch_job_id}.candidateCount" "${#CANDIDATE_LINES[@]}"
  log_ok "dispatchJobId=${dispatch_job_id} candidateCount=${#CANDIDATE_LINES[@]}"
}

first_candidate_driver() {
  local line="${CANDIDATE_LINES[0]}"
  printf '%s' "${line%%$'\t'*}"
}

first_candidate_vehicle() {
  local line="${CANDIDATE_LINES[0]}"
  printf '%s' "${line#*$'\t'}"
}

trigger_dispatch() {
  local order_id="$1"
  local fixture="${TMP_DIR}/dispatch-${order_id}.json"
  printf '%s\n' '{"mode":"auto"}' > "$fixture"

  http_call POST "/orders/${order_id}/dispatch" "$fixture"
  assert_status "200|201"

  local dispatch_job_id
  dispatch_job_id=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
  if [[ -z "$dispatch_job_id" ]]; then
    dispatch_job_id=$(poll_for_dispatch_job "$order_id")
  fi

  if [[ -z "$dispatch_job_id" ]]; then
    log_fail "dispatchJobId for orderId=${order_id} is empty"
    exit 1
  fi
  echo "$dispatch_job_id"
}

assign_dispatch_job() {
  local dispatch_job_id="$1" vehicle_id="$2" driver_id="$3" order_id="$4"
  local fixture="${TMP_DIR}/assign-${dispatch_job_id}.json"
  write_assign_fixture "$fixture" "$dispatch_job_id" "$vehicle_id" "$driver_id"

  http_call POST "/dispatch/assign" "$fixture"
  assert_status "200|201"

  local task_id
  task_id=$(json_get_first ".data.taskId" ".data.task_id")
  if [[ -z "$task_id" ]]; then
    task_id=$(poll_for_task_by_order "$order_id")
  fi

  if [[ -z "$task_id" ]]; then
    log_fail "taskId for dispatchJobId=${dispatch_job_id} is empty"
    exit 1
  fi
  echo "$task_id"
}

run_driver_lifecycle() {
  local task_id="$1" driver_id="$2" label="$3"
  local accept_fixture="${TMP_DIR}/${label}-accept.json"
  local depart_fixture="${TMP_DIR}/${label}-depart.json"
  local arrive_fixture="${TMP_DIR}/${label}-arrive.json"
  local start_fixture="${TMP_DIR}/${label}-start.json"
  local complete_fixture="${TMP_DIR}/${label}-complete.json"

  switch_actor "driver_user" "$driver_id" "$E2E_SEED_TENANT_ID"

  jq -n --arg acceptedAt "$(current_iso)" '{acceptedAt: $acceptedAt}' > "$accept_fixture"
  http_call POST "/driver/tasks/${task_id}/accept" "$accept_fixture"
  assert_status "200|201"

  jq -n --arg departedAt "$(current_iso)" '{departedAt: $departedAt}' > "$depart_fixture"
  http_call POST "/driver/tasks/${task_id}/depart" "$depart_fixture"
  assert_status "200|201"

  jq -n --arg arrivedAt "$(current_iso)" '{arrivedAt: $arrivedAt}' > "$arrive_fixture"
  http_call POST "/driver/tasks/${task_id}/arrived_pickup" "$arrive_fixture"
  assert_status "200|201"

  jq -n --arg startedAt "$(current_iso)" '{startedAt: $startedAt}' > "$start_fixture"
  http_call POST "/driver/tasks/${task_id}/start" "$start_fixture"
  assert_status "200|201"

  jq \
    --arg completedAt "$(current_iso)" \
    '.completedAt = $completedAt' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" > "$complete_fixture"
  http_call POST "/driver/tasks/${task_id}/complete" "$complete_fixture"
  assert_status "200|201"

  http_call GET "/driver/tasks/${task_id}"
  assert_status "200"
  local task_status
  task_status=$(json_get_first ".data.status" ".data.status")
  assert_equals "driver task ${task_id} final status" "completed" "$task_status"

  save_evidence "$SCENARIO" "driver" "${label}.taskId" "$task_id"
  save_evidence "$SCENARIO" "driver" "${label}.driverId" "$driver_id"
}

create_complaint_case() {
  local order_id="$1" category="$2" description="$3"
  local fixture="${TMP_DIR}/complaint-${order_id}-${category}.json"
  write_complaint_fixture "$fixture" "$order_id" "$category" "$description"

  switch_actor "ops_user" "e2e-ops-022" >/dev/null
  http_call POST "/complaints" "$fixture"
  assert_status "200|201"

  local case_no
  case_no=$(json_get_first ".data.caseNo" ".data.case_no")
  if [[ -z "$case_no" ]]; then
    log_fail "complaint caseNo for orderId=${order_id} is empty"
    exit 1
  fi
  echo "$case_no"
}

record_driver_location() {
  local driver_id="$1" recorded_at="$2"
  local fixture="${TMP_DIR}/driver-location-${driver_id}-$(echo "$recorded_at" | tr ':.' '__').json"
  jq -n \
    --arg driverId "$driver_id" \
    --arg recordedAt "$recorded_at" \
    '{
      driverId: $driverId,
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 15,
      recordedAt: $recordedAt
    }' > "$fixture"

  http_call POST "/regulatory-registry/driver-location" "$fixture"
  assert_status "200|201"
}

capture_snapshot_at() {
  local snapshot_at="$1"
  local fixture="${TMP_DIR}/snapshot-$(echo "$snapshot_at" | tr ':.' '__').json"
  jq -n --arg snapshotAt "$snapshot_at" '{snapshotAt: $snapshotAt}' > "$fixture"

  http_call POST "/reports/dispatchable-supply-snapshots/rebuild" "$fixture"
  assert_status "200|201"

  local returned_snapshot_at
  returned_snapshot_at=$(json_get_first ".data.snapshotAt" ".data.snapshot_at")
  assert_equals "captured snapshotAt" "$snapshot_at" "$returned_snapshot_at"
  save_evidence "$SCENARIO" "snapshot" "capturedAt" "$snapshot_at"
}

wait_for_report_job_completed() {
  local job_id="$1"
  local attempt=0

  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/reports/${job_id}"
    assert_status "200"

    local status
    status=$(json_get_first ".data.status" ".data.status")
    if [[ "$status" == "completed" ]]; then
      return 0
    fi
    if [[ "$status" == "failed" ]]; then
      log_fail "Report job ${job_id} failed"
      log_fail "Body: ${RESP_BODY}"
      exit 1
    fi
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: reportJob=${job_id} status=${status:-<empty>}"
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  log_fail "Report job ${job_id} did not reach completed"
  exit 1
}

assert_daily_record_fields() {
  local row_json="$1" order_id="$2" order_source="$3" final_status="$4" complaint_count="$5"

  assert_non_empty "daily record payload for orderId=${order_id}" "$row_json"
  assert_equals \
    "daily record orderSource for orderId=${order_id}" \
    "$order_source" \
    "$(json_field_from_object "$row_json" '(.orderSource // .order_source)')"
  assert_equals \
    "daily record finalStatus for orderId=${order_id}" \
    "$final_status" \
    "$(json_field_from_object "$row_json" '(.finalStatus // .final_status)')"
  assert_int_equals \
    "daily record complaintCount for orderId=${order_id}" \
    "$complaint_count" \
    "$(json_field_from_object "$row_json" '(.complaintCount // .complaint_count)')"
}

log_surface "Order sources — app / phone / tenant portal"

switch_actor "ops_user" "e2e-ops-022"
APP_FIXTURE="${TMP_DIR}/app-order.json"
write_app_order_fixture "$APP_FIXTURE"

log_step "1.1 — POST /orders (app source)"
http_call POST "/orders" "$APP_FIXTURE"
assert_status "200|201"
APP_ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
assert_non_empty "app orderId" "$APP_ORDER_ID"
chain_set "app" "orderId" "$APP_ORDER_ID"
save_evidence "$SCENARIO" "app" "orderId" "$APP_ORDER_ID"

log_step "1.2 — POST /orders/:orderId/dispatch (app source)"
APP_DISPATCH_JOB_ID=$(trigger_dispatch "$APP_ORDER_ID")
chain_set "app" "dispatchJobId" "$APP_DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "app" "dispatchJobId" "$APP_DISPATCH_JOB_ID"

log_step "1.3 — GET /dispatch/tasks/:dispatchJobId/candidates (app source)"
read_dispatch_candidates "$APP_DISPATCH_JOB_ID"
record_taxi_candidate_union
APP_DRIVER_ID="$(first_candidate_driver)"
APP_VEHICLE_ID="$(first_candidate_vehicle)"
assert_non_empty "app driverId" "$APP_DRIVER_ID"
assert_non_empty "app vehicleId" "$APP_VEHICLE_ID"

log_step "1.4 — POST /dispatch/assign (app source)"
APP_TASK_ID=$(assign_dispatch_job "$APP_DISPATCH_JOB_ID" "$APP_VEHICLE_ID" "$APP_DRIVER_ID" "$APP_ORDER_ID")
chain_set "app" "taskId" "$APP_TASK_ID"
save_evidence "$SCENARIO" "app" "taskId" "$APP_TASK_ID"

log_step "1.5 — Driver lifecycle complete (app source)"
run_driver_lifecycle "$APP_TASK_ID" "$APP_DRIVER_ID" "app"
switch_actor "ops_user" "e2e-ops-022"

log_step "1.6 — POST /complaints (completed app order)"
APP_COMPLAINT_CASE_NO=$(create_complaint_case "$APP_ORDER_ID" "late_arrival" "E2E-022 completed app-order complaint")
chain_set "app" "complaintCaseNo" "$APP_COMPLAINT_CASE_NO"
save_evidence "$SCENARIO" "app" "complaintCaseNo" "$APP_COMPLAINT_CASE_NO"

PHONE_FIXTURE="${TMP_DIR}/phone-order.json"
write_call_center_order_fixture "$PHONE_FIXTURE"

log_step "1.7 — POST /call-center/orders (phone source)"
http_call POST "/call-center/orders" "$PHONE_FIXTURE"
assert_status "200|201"
PHONE_ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
assert_non_empty "phone orderId" "$PHONE_ORDER_ID"
chain_set "phone" "orderId" "$PHONE_ORDER_ID"
save_evidence "$SCENARIO" "phone" "orderId" "$PHONE_ORDER_ID"

log_step "1.8 — POST /orders/:orderId/dispatch (phone source)"
PHONE_DISPATCH_JOB_ID=$(trigger_dispatch "$PHONE_ORDER_ID")
chain_set "phone" "dispatchJobId" "$PHONE_DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "phone" "dispatchJobId" "$PHONE_DISPATCH_JOB_ID"

log_step "1.9 — GET /dispatch/tasks/:dispatchJobId/candidates (phone source)"
read_dispatch_candidates "$PHONE_DISPATCH_JOB_ID"
record_taxi_candidate_union
PHONE_DRIVER_ID="$(first_candidate_driver)"
PHONE_VEHICLE_ID="$(first_candidate_vehicle)"
assert_non_empty "phone driverId" "$PHONE_DRIVER_ID"
assert_non_empty "phone vehicleId" "$PHONE_VEHICLE_ID"

log_step "1.10 — POST /dispatch/assign (phone source initial assignment)"
PHONE_TASK_ID=$(assign_dispatch_job "$PHONE_DISPATCH_JOB_ID" "$PHONE_VEHICLE_ID" "$PHONE_DRIVER_ID" "$PHONE_ORDER_ID")
save_evidence "$SCENARIO" "phone" "initialTaskId" "$PHONE_TASK_ID"

log_step "1.11 — POST /orders/:orderId/redispatch"
REDISPATCH_FIXTURE="${TMP_DIR}/phone-redispatch.json"
write_redispatch_fixture "$REDISPATCH_FIXTURE"
http_call POST "/orders/${PHONE_ORDER_ID}/redispatch" "$REDISPATCH_FIXTURE"
assert_status "200|201"
PHONE_REDISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
if [[ -z "$PHONE_REDISPATCH_JOB_ID" ]]; then
  PHONE_REDISPATCH_JOB_ID=$(poll_for_dispatch_job "$PHONE_ORDER_ID")
fi
assert_non_empty "redispatch jobId for phone order" "$PHONE_REDISPATCH_JOB_ID"
chain_set "phone" "redispatchJobId" "$PHONE_REDISPATCH_JOB_ID"
save_evidence "$SCENARIO" "phone" "redispatchJobId" "$PHONE_REDISPATCH_JOB_ID"

log_step "1.12 — GET /dispatch/tasks/:dispatchJobId/candidates (phone redispatch)"
read_dispatch_candidates "$PHONE_REDISPATCH_JOB_ID"
PHONE_DRIVER_ID="$(first_candidate_driver)"
PHONE_VEHICLE_ID="$(first_candidate_vehicle)"

log_step "1.13 — POST /dispatch/assign (phone redispatch assignment)"
PHONE_TASK_ID=$(assign_dispatch_job "$PHONE_REDISPATCH_JOB_ID" "$PHONE_VEHICLE_ID" "$PHONE_DRIVER_ID" "$PHONE_ORDER_ID")
chain_set "phone" "taskId" "$PHONE_TASK_ID"
save_evidence "$SCENARIO" "phone" "taskId" "$PHONE_TASK_ID"

log_step "1.14 — POST /passenger/orders/:orderId/cancel"
PHONE_CANCEL_FIXTURE="${TMP_DIR}/phone-cancel.json"
write_cancel_fixture "$PHONE_CANCEL_FIXTURE" "passenger_cancelled"
http_call POST "/passenger/orders/${PHONE_ORDER_ID}/cancel" "$PHONE_CANCEL_FIXTURE"
assert_status "200|201"

log_step "1.15 — POST /complaints (redispatched cancelled phone order)"
PHONE_COMPLAINT_CASE_NO=$(create_complaint_case "$PHONE_ORDER_ID" "no_arrival" "E2E-022 cancelled phone-order complaint")
chain_set "phone" "complaintCaseNo" "$PHONE_COMPLAINT_CASE_NO"
save_evidence "$SCENARIO" "phone" "complaintCaseNo" "$PHONE_COMPLAINT_CASE_NO"

switch_actor "tenant_admin" "e2e-tenant-admin-022" "$E2E_SEED_TENANT_ID"
PORTAL_FIXTURE="${TMP_DIR}/portal-booking.json"
write_portal_booking_fixture "$PORTAL_FIXTURE"

log_step "1.16 — POST /tenant/bookings (tenant portal source)"
http_call POST "/tenant/bookings" "$PORTAL_FIXTURE"
assert_status "200|201"
PORTAL_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
assert_non_empty "tenant bookingId" "$PORTAL_BOOKING_ID"
chain_set "portal" "bookingId" "$PORTAL_BOOKING_ID"
save_evidence "$SCENARIO" "portal" "bookingId" "$PORTAL_BOOKING_ID"

log_step "1.17 — GET /tenant/bookings/:bookingId"
http_call GET "/tenant/bookings/${PORTAL_BOOKING_ID}"
assert_status "200"
PORTAL_ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
assert_non_empty "tenant portal orderId" "$PORTAL_ORDER_ID"
chain_set "portal" "orderId" "$PORTAL_ORDER_ID"
save_evidence "$SCENARIO" "portal" "orderId" "$PORTAL_ORDER_ID"

switch_actor "ops_user" "e2e-ops-022"

log_step "1.18 — POST /orders/:orderId/dispatch (tenant portal source)"
PORTAL_DISPATCH_JOB_ID=$(trigger_dispatch "$PORTAL_ORDER_ID")
chain_set "portal" "dispatchJobId" "$PORTAL_DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "portal" "dispatchJobId" "$PORTAL_DISPATCH_JOB_ID"

log_step "1.19 — GET /dispatch/tasks/:dispatchJobId/candidates (tenant portal source)"
read_dispatch_candidates "$PORTAL_DISPATCH_JOB_ID"
PORTAL_DRIVER_ID="$(first_candidate_driver)"
PORTAL_VEHICLE_ID="$(first_candidate_vehicle)"
assert_non_empty "portal driverId" "$PORTAL_DRIVER_ID"
assert_non_empty "portal vehicleId" "$PORTAL_VEHICLE_ID"

log_step "1.20 — POST /dispatch/assign (tenant portal source)"
PORTAL_TASK_ID=$(assign_dispatch_job "$PORTAL_DISPATCH_JOB_ID" "$PORTAL_VEHICLE_ID" "$PORTAL_DRIVER_ID" "$PORTAL_ORDER_ID")
chain_set "portal" "taskId" "$PORTAL_TASK_ID"
save_evidence "$SCENARIO" "portal" "taskId" "$PORTAL_TASK_ID"

log_step "1.21 — Driver lifecycle complete (tenant portal source)"
run_driver_lifecycle "$PORTAL_TASK_ID" "$PORTAL_DRIVER_ID" "portal"

log_surface "Complaints and daily report"

switch_actor "ops_user" "e2e-ops-022"

log_step "2.1 — GET /complaints"
http_call GET "/complaints"
assert_status "200"
COMPLAINT_COUNT=$(echo "$RESP_BODY" | jq -r '.data.items | length' 2>/dev/null || true)
assert_int_equals "complaint count" 2 "$COMPLAINT_COUNT"
assert_int_equals \
  "app complaint records" \
  1 \
  "$(echo "$RESP_BODY" | jq -r --arg oid "$APP_ORDER_ID" '.data.items | map(select((.relatedOrderId // .related_order_id) == $oid)) | length' 2>/dev/null || true)"
assert_int_equals \
  "phone complaint records" \
  1 \
  "$(echo "$RESP_BODY" | jq -r --arg oid "$PHONE_ORDER_ID" '.data.items | map(select((.relatedOrderId // .related_order_id) == $oid)) | length' 2>/dev/null || true)"

log_step "2.2 — POST /reports/daily-dispatch-records/rebuild"
DAILY_REBUILD_FIXTURE="${TMP_DIR}/daily-rebuild.json"
jq -n --arg serviceDate "$SERVICE_DATE" '{serviceDate: $serviceDate}' > "$DAILY_REBUILD_FIXTURE"
http_call POST "/reports/daily-dispatch-records/rebuild" "$DAILY_REBUILD_FIXTURE"
assert_status "200|201"
assert_int_equals "daily rebuild count" 3 "$(json_get_first ".data.rebuiltCount" ".data.rebuilt_count")"

log_step "2.3 — Validate daily dispatch records from rebuild response"
assert_int_equals \
  "daily dispatch record row count" \
  3 \
  "$(echo "$RESP_BODY" | jq -r '(.data.records // []) | length' 2>/dev/null || true)"

APP_DAILY_ROW="$(extract_item_by_order_id "$APP_ORDER_ID")"
PHONE_DAILY_ROW="$(extract_item_by_order_id "$PHONE_ORDER_ID")"
PORTAL_DAILY_ROW="$(extract_item_by_order_id "$PORTAL_ORDER_ID")"

assert_daily_record_fields "$APP_DAILY_ROW" "$APP_ORDER_ID" "third_party_platform" "completed" 1
assert_non_empty \
  "app tripCompletedAt" \
  "$(json_field_from_object "$APP_DAILY_ROW" '(.tripCompletedAt // .trip_completed_at)')"

assert_daily_record_fields "$PHONE_DAILY_ROW" "$PHONE_ORDER_ID" "phone" "cancelled" 1
assert_int_equals \
  "phone redispatchCount" \
  1 \
  "$(json_field_from_object "$PHONE_DAILY_ROW" '(.redispatchCount // .redispatch_count)')"
assert_equals \
  "phone cancellationReason" \
  "passenger_cancelled" \
  "$(json_field_from_object "$PHONE_DAILY_ROW" '(.cancellationReason // .cancellation_reason)')"
assert_equals \
  "phone tripCompletedAt" \
  "" \
  "$(json_field_from_object "$PHONE_DAILY_ROW" '(.tripCompletedAt // .trip_completed_at)')"

assert_daily_record_fields "$PORTAL_DAILY_ROW" "$PORTAL_ORDER_ID" "tenant_portal" "completed" 0
assert_equals \
  "portal serviceProductCode" \
  "enterprise_dispatch" \
  "$(json_field_from_object "$PORTAL_DAILY_ROW" '(.serviceProductCode // .service_product_code)')"
assert_equals \
  "portal tenantId" \
  "$E2E_SEED_TENANT_ID" \
  "$(json_field_from_object "$PORTAL_DAILY_ROW" '(.tenantId // .tenant_id)')"

log_step "2.4 — POST /reports/jobs (daily_dispatch_record)"
DAILY_REPORT_JOB_FIXTURE="${TMP_DIR}/daily-report-job.json"
jq -n \
  --arg serviceDate "$SERVICE_DATE" \
  '{
    jobType: "daily_dispatch_record",
    format: "json",
    filters: {
      serviceDate: $serviceDate
    }
  }' > "$DAILY_REPORT_JOB_FIXTURE"
http_call POST "/reports/jobs" "$DAILY_REPORT_JOB_FIXTURE"
assert_status "200|201"
DAILY_REPORT_JOB_ID=$(json_get_first ".data.jobId" ".data.job_id")
assert_non_empty "daily report jobId" "$DAILY_REPORT_JOB_ID"
chain_set "reporting" "dailyReportJobId" "$DAILY_REPORT_JOB_ID"
save_evidence "$SCENARIO" "reporting" "dailyReportJobId" "$DAILY_REPORT_JOB_ID"
wait_for_report_job_completed "$DAILY_REPORT_JOB_ID"

assert_int_equals \
  "daily report job row count" \
  3 \
  "$(echo "$RESP_BODY" | jq -r '.data.rows | length' 2>/dev/null || true)"
assert_non_empty \
  "daily report artifactId" \
  "$(echo "$RESP_BODY" | jq -r '.data.artifact.artifactId // .data.artifact.artifact_id // empty' 2>/dev/null || true)"
assert_int_equals \
  "daily report rows for app order" \
  1 \
  "$(echo "$RESP_BODY" | jq -r --arg oid "$APP_ORDER_ID" '.data.rows | map(select((.orderId // .order_id) == $oid)) | length' 2>/dev/null || true)"
assert_int_equals \
  "daily report rows for phone order" \
  1 \
  "$(echo "$RESP_BODY" | jq -r --arg oid "$PHONE_ORDER_ID" '.data.rows | map(select((.orderId // .order_id) == $oid)) | length' 2>/dev/null || true)"
assert_int_equals \
  "daily report rows for portal order" \
  1 \
  "$(echo "$RESP_BODY" | jq -r --arg oid "$PORTAL_ORDER_ID" '.data.rows | map(select((.orderId // .order_id) == $oid)) | length' 2>/dev/null || true)"

log_surface "Supply snapshots and six-month summary"

log_step "3.1 — GET /regulatory-registry/vehicles"
http_call GET "/regulatory-registry/vehicles"
assert_status "200"
TAXI_BUSINESS_AREA=$(echo "$RESP_BODY" | jq -r --arg vid "$APP_VEHICLE_ID" \
  '.data.items[]? | select((.vehicleId // .vehicle_id) == $vid) | (.operatingArea // .operating_area)' \
  2>/dev/null | head -1 || true)
assert_non_empty "taxi businessArea" "$TAXI_BUSINESS_AREA"

TAXI_UNIQUE_DRIVER_COUNT="$(unique_count "${TAXI_CANDIDATE_DRIVERS[@]}")"
TAXI_UNIQUE_VEHICLE_COUNT="$(unique_count "${TAXI_CANDIDATE_VEHICLES[@]}")"
assert_int_ge "taxi unique driver count" 1 "$TAXI_UNIQUE_DRIVER_COUNT"
assert_int_ge "taxi unique vehicle count" 1 "$TAXI_UNIQUE_VEHICLE_COUNT"

SNAPSHOT_AT_1="${SERVICE_DATE}T12:00:00.000Z"
SNAPSHOT_AT_2="${SERVICE_DATE}T12:05:00.000Z"
SNAPSHOT_AT_3="${SERVICE_DATE}T12:10:00.000Z"

for snapshot_at in "$SNAPSHOT_AT_1" "$SNAPSHOT_AT_2" "$SNAPSHOT_AT_3"; do
  log_step "3.2 — Record fresh driver locations for snapshotAt=${snapshot_at}"
  for driver_id in "${TAXI_CANDIDATE_DRIVERS[@]}"; do
    record_driver_location "$driver_id" "$snapshot_at"
  done
  log_step "3.3 — POST /reports/dispatchable-supply-snapshots/rebuild (${snapshot_at})"
  capture_snapshot_at "$snapshot_at"
  SNAPSHOT_ROW="$(extract_snapshot_record "$snapshot_at" "$TAXI_BUSINESS_AREA" "taxi_realtime")"
  assert_non_empty "snapshot row for ${snapshot_at}" "$SNAPSHOT_ROW"
  assert_equals \
    "snapshot sourceHealth for ${snapshot_at}" \
    "complete" \
    "$(json_field_from_object "$SNAPSHOT_ROW" '(.sourceHealth // .source_health)')"
  assert_int_equals \
    "snapshot dispatchableVehicleCount for ${snapshot_at}" \
    "$TAXI_UNIQUE_VEHICLE_COUNT" \
    "$(json_field_from_object "$SNAPSHOT_ROW" '(.dispatchableVehicleCount // .dispatchable_vehicle_count)')"
  assert_int_equals \
    "snapshot availableDriverCount for ${snapshot_at}" \
    "$TAXI_UNIQUE_DRIVER_COUNT" \
    "$(json_field_from_object "$SNAPSHOT_ROW" '(.availableDriverCount // .available_driver_count)')"
done

log_step "3.5 — POST /reports/monthly-operations-summaries/rebuild"
MONTHLY_REBUILD_FIXTURE="${TMP_DIR}/monthly-rebuild.json"
jq -n \
  --arg periodMonth "$SUMMARY_MONTH" \
  --arg businessArea "$TAXI_BUSINESS_AREA" \
  '{
    periodMonth: $periodMonth,
    businessArea: $businessArea,
    serviceProductCode: "taxi_realtime"
  }' > "$MONTHLY_REBUILD_FIXTURE"
http_call POST "/reports/monthly-operations-summaries/rebuild" "$MONTHLY_REBUILD_FIXTURE"
assert_status "200|201"
assert_int_equals "monthly rebuild count" 1 "$(json_get_first ".data.rebuiltCount" ".data.rebuilt_count")"
assert_int_equals \
  "monthly summary row count" \
  1 \
  "$(echo "$RESP_BODY" | jq -r '(.data.records // []) | length' 2>/dev/null || true)"
log_step "3.6 — Validate monthly operations summary from rebuild response"
MONTHLY_ROW=$(echo "$RESP_BODY" | jq -c '(.data.records // [])[0]' 2>/dev/null || true)
assert_non_empty "monthly summary row" "$MONTHLY_ROW"
assert_int_equals "monthly demandRequestCount" 2 "$(json_field_from_object "$MONTHLY_ROW" '(.demandRequestCount // .demand_request_count)')"
assert_int_equals "monthly actualDispatchCount" 2 "$(json_field_from_object "$MONTHLY_ROW" '(.actualDispatchCount // .actual_dispatch_count)')"
assert_int_equals "monthly completedTripCount" 1 "$(json_field_from_object "$MONTHLY_ROW" '(.completedTripCount // .completed_trip_count)')"
assert_int_equals "monthly cancelledOrderCount" 1 "$(json_field_from_object "$MONTHLY_ROW" '(.cancelledOrderCount // .cancelled_order_count)')"
assert_equals "monthly averageDispatchableVehicleCount" "$TAXI_UNIQUE_VEHICLE_COUNT" "$(json_field_from_object "$MONTHLY_ROW" '(.averageDispatchableVehicleCount // .average_dispatchable_vehicle_count)')"
assert_int_equals "monthly validSnapshotCount" 3 "$(json_field_from_object "$MONTHLY_ROW" '(.validSnapshotCount // .valid_snapshot_count)')"
MONTHLY_EXPECTED_SNAPSHOTS="$(json_field_from_object "$MONTHLY_ROW" '(.expectedSnapshotCount // .expected_snapshot_count)')"
assert_int_ge "monthly expectedSnapshotCount" 1 "$MONTHLY_EXPECTED_SNAPSHOTS"
EXPECTED_COVERAGE="$(round_four "$(awk -v valid=3 -v total="$MONTHLY_EXPECTED_SNAPSHOTS" 'BEGIN { print valid / total }')")"
assert_equals \
  "monthly snapshotCoverageRate" \
  "$EXPECTED_COVERAGE" \
  "$(round_four "$(json_field_from_object "$MONTHLY_ROW" '(.snapshotCoverageRate // .snapshot_coverage_rate)')")"
assert_int_equals "monthly complaintCount" 2 "$(json_field_from_object "$MONTHLY_ROW" '(.complaintCount // .complaint_count)')"
assert_int_equals \
  "monthly complaintsByCategory.late_arrival" \
  1 \
  "$(json_field_from_object "$MONTHLY_ROW" '(.complaintsByCategory // .complaints_by_category).late_arrival')"
assert_int_equals \
  "monthly complaintsByCategory.no_arrival" \
  1 \
  "$(json_field_from_object "$MONTHLY_ROW" '(.complaintsByCategory // .complaints_by_category).no_arrival')"

log_step "3.7 — GET /reports/operations-summary/preview"
http_call GET "/reports/operations-summary/preview?from=${SUMMARY_FROM_DATE}&to=${SUMMARY_TO_DATE}&businessArea=${TAXI_BUSINESS_AREA}&serviceProductCode=taxi_realtime"
assert_status "200"
assert_int_equals \
  "summary preview row count" \
  1 \
  "$(echo "$RESP_BODY" | jq -r '.data.items | length' 2>/dev/null || true)"
SUMMARY_ROW=$(echo "$RESP_BODY" | jq -c '.data.items[0]' 2>/dev/null || true)
assert_non_empty "summary preview row" "$SUMMARY_ROW"
assert_equals "summary preview from" "$SUMMARY_FROM_DATE" "$(json_field_from_object "$SUMMARY_ROW" '.from')"
assert_equals "summary preview to" "$SUMMARY_TO_DATE" "$(json_field_from_object "$SUMMARY_ROW" '.to')"
assert_int_equals "summary preview demandRequestCount" 2 "$(json_field_from_object "$SUMMARY_ROW" '(.demandRequestCount // .demand_request_count)')"
assert_int_equals "summary preview actualDispatchCount" 2 "$(json_field_from_object "$SUMMARY_ROW" '(.actualDispatchCount // .actual_dispatch_count)')"
assert_int_equals "summary preview completedTripCount" 1 "$(json_field_from_object "$SUMMARY_ROW" '(.completedTripCount // .completed_trip_count)')"
assert_int_equals "summary preview cancelledOrderCount" 1 "$(json_field_from_object "$SUMMARY_ROW" '(.cancelledOrderCount // .cancelled_order_count)')"
assert_equals "summary preview averageDispatchableVehicleCount" "$TAXI_UNIQUE_VEHICLE_COUNT" "$(json_field_from_object "$SUMMARY_ROW" '(.averageDispatchableVehicleCount // .average_dispatchable_vehicle_count)')"
assert_int_equals "summary preview validSnapshotCount" 3 "$(json_field_from_object "$SUMMARY_ROW" '(.validSnapshotCount // .valid_snapshot_count)')"
assert_int_equals "summary preview expectedSnapshotCount" "$MONTHLY_EXPECTED_SNAPSHOTS" "$(json_field_from_object "$SUMMARY_ROW" '(.expectedSnapshotCount // .expected_snapshot_count)')"
assert_equals "summary preview snapshotCoverageRate" "$EXPECTED_COVERAGE" "$(round_four "$(json_field_from_object "$SUMMARY_ROW" '(.snapshotCoverageRate // .snapshot_coverage_rate)')")"
assert_int_equals "summary preview complaintCount" 2 "$(json_field_from_object "$SUMMARY_ROW" '(.complaintCount // .complaint_count)')"
assert_int_equals \
  "summary preview complaintsByCategory.late_arrival" \
  1 \
  "$(json_field_from_object "$SUMMARY_ROW" '(.complaintsByCategory // .complaints_by_category).late_arrival')"
assert_int_equals \
  "summary preview complaintsByCategory.no_arrival" \
  1 \
  "$(json_field_from_object "$SUMMARY_ROW" '(.complaintsByCategory // .complaints_by_category).no_arrival')"

log_step "3.8 — POST /reports/jobs (six_month_operations_summary)"
SUMMARY_REPORT_JOB_FIXTURE="${TMP_DIR}/summary-report-job.json"
jq -n \
  --arg from "$SUMMARY_FROM_DATE" \
  --arg to "$SUMMARY_TO_DATE" \
  --arg businessArea "$TAXI_BUSINESS_AREA" \
  '{
    jobType: "six_month_operations_summary",
    format: "json",
    filters: {
      from: $from,
      to: $to,
      businessArea: $businessArea,
      serviceProductCode: "taxi_realtime"
    }
  }' > "$SUMMARY_REPORT_JOB_FIXTURE"
http_call POST "/reports/jobs" "$SUMMARY_REPORT_JOB_FIXTURE"
assert_status "200|201"
SUMMARY_REPORT_JOB_ID=$(json_get_first ".data.jobId" ".data.job_id")
assert_non_empty "summary report jobId" "$SUMMARY_REPORT_JOB_ID"
chain_set "reporting" "summaryReportJobId" "$SUMMARY_REPORT_JOB_ID"
save_evidence "$SCENARIO" "reporting" "summaryReportJobId" "$SUMMARY_REPORT_JOB_ID"
wait_for_report_job_completed "$SUMMARY_REPORT_JOB_ID"

assert_int_equals \
  "summary report job row count" \
  1 \
  "$(echo "$RESP_BODY" | jq -r '.data.rows | length' 2>/dev/null || true)"
assert_non_empty \
  "summary report artifactId" \
  "$(echo "$RESP_BODY" | jq -r '.data.artifact.artifactId // .data.artifact.artifact_id // empty' 2>/dev/null || true)"
SUMMARY_JOB_ROW=$(echo "$RESP_BODY" | jq -c '.data.rows[0]' 2>/dev/null || true)
assert_non_empty "summary report row" "$SUMMARY_JOB_ROW"
assert_int_equals "summary report demandRequestCount" 2 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.demandRequestCount // .demand_request_count)')"
assert_int_equals "summary report actualDispatchCount" 2 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.actualDispatchCount // .actual_dispatch_count)')"
assert_int_equals "summary report completedTripCount" 1 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.completedTripCount // .completed_trip_count)')"
assert_int_equals "summary report cancelledOrderCount" 1 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.cancelledOrderCount // .cancelled_order_count)')"
assert_equals "summary report averageDispatchableVehicleCount" "$TAXI_UNIQUE_VEHICLE_COUNT" "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.averageDispatchableVehicleCount // .average_dispatchable_vehicle_count)')"
assert_int_equals "summary report validSnapshotCount" 3 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.validSnapshotCount // .valid_snapshot_count)')"
assert_int_equals "summary report expectedSnapshotCount" "$MONTHLY_EXPECTED_SNAPSHOTS" "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.expectedSnapshotCount // .expected_snapshot_count)')"
assert_equals "summary report snapshotCoverageRate" "$EXPECTED_COVERAGE" "$(round_four "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.snapshotCoverageRate // .snapshot_coverage_rate)')")"
assert_int_equals "summary report complaintCount" 2 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.complaintCount // .complaint_count)')"
assert_int_equals \
  "summary report complaintsByCategory.late_arrival" \
  1 \
  "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.complaintsByCategory // .complaints_by_category).late_arrival')"
assert_int_equals \
  "summary report complaintsByCategory.no_arrival" \
  1 \
  "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.complaintsByCategory // .complaints_by_category).no_arrival')"

print_chain_summary
log_ok "E2E-022 complete — operations reporting shell finished."
