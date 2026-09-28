#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../../../tests/e2e/lib/operations-reporting-dates.sh"

assert_non_empty() {
  local label="$1" value="${2:-}"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "ASSERT FAIL: $label is empty" >&2
    exit 1
  fi
}

assert_int_equals() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "ASSERT FAIL: $label - Expected $expected, got ${actual:-empty}" >&2
    exit 1
  fi
}

assert_equals() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "ASSERT FAIL: $label - Expected $expected, got ${actual:-empty}" >&2
    exit 1
  fi
}

assert_int_ge() {
  local label="$1" minimum="$2" actual="$3"
  if [[ -z "$actual" ]] || (( actual < minimum )); then
    echo "ASSERT FAIL: $label - Expected >= $minimum, got ${actual:-empty}" >&2
    exit 1
  fi
}

log_step() { :; }
assert_status() { :; }
json_get_first() {
  echo "$RESP_BODY" | jq -r "($1 // $2)"
}
json_field_from_object() {
  echo "$1" | jq -r "$2"
}
chain_set() { :; }
save_evidence() { :; }
wait_for_report_job_completed() { :; }
round_four() {
  printf "%.4f
" "$1"
}

http_call() {
  local method="$1" path="$2" req_file="${3:-}"
  
  if [[ "$path" == "/reports/daily-dispatch-records/rebuild" ]]; then
    local sd=$(jq -r '.serviceDate' "$req_file")
    local count=0
    local records="[]"
    
    if [[ "$sd" == "$APP_REAL_DATE" ]]; then
      count=$((count+1))
      records="$(echo "$records" | jq -c --arg oid "$APP_ORDER_ID" '. + [{orderId: $oid, orderSource: "third_party_platform", finalStatus: "completed", complaintCount: 1, tripCompletedAt: "2026-09-01T12:00:00Z"}]')"
    fi
    if [[ "$sd" == "$PHONE_REAL_DATE" ]]; then
      count=$((count+1))
      records="$(echo "$records" | jq -c --arg oid "$PHONE_ORDER_ID" '. + [{orderId: $oid, orderSource: "phone", finalStatus: "cancelled", complaintCount: 1, redispatchCount: 1, cancellationReason: "passenger_cancelled", tripCompletedAt: ""}]')"
    fi
    if [[ "$sd" == "$PORTAL_REAL_DATE" ]]; then
      count=$((count+1))
      records="$(echo "$records" | jq -c --arg oid "$PORTAL_ORDER_ID" '. + [{orderId: $oid, orderSource: "tenant_portal", finalStatus: "completed", complaintCount: 0, serviceProductCode: "enterprise_dispatch", tenantId: "'"$E2E_SEED_TENANT_ID"'"}]')"
    fi
    
    RESP_BODY="$(jq -n --arg count "$count" --argjson records "$records" '{data: {rebuiltCount: ($count | tonumber), records: $records}}')"
  elif [[ "$path" == "/reports/jobs" ]]; then
    local jobType=$(jq -r '.jobType' "$req_file")
    if [[ "$jobType" == "daily_dispatch_record" ]]; then
       local sd=$(jq -r '.filters.serviceDate' "$req_file")
       local records="[]"
       if [[ "$sd" == "$APP_REAL_DATE" ]]; then
         records="$(echo "$records" | jq -c --arg oid "$APP_ORDER_ID" '. + [{orderId: $oid}]')"
       fi
       if [[ "$sd" == "$PHONE_REAL_DATE" ]]; then
         records="$(echo "$records" | jq -c --arg oid "$PHONE_ORDER_ID" '. + [{orderId: $oid}]')"
       fi
       if [[ "$sd" == "$PORTAL_REAL_DATE" ]]; then
         records="$(echo "$records" | jq -c --arg oid "$PORTAL_ORDER_ID" '. + [{orderId: $oid}]')"
       fi
       RESP_BODY="$(jq -n --argjson records "$records" '{data: {jobId: "job-123", artifact: {artifactId: "art-123"}, rows: $records}}')"
    elif [[ "$jobType" == "six_month_operations_summary" ]]; then
       RESP_BODY="$(jq -n --argjson rec "$FIXTURE_SUMMARY_ROW" '{data: {jobId: "job-456", artifact: {artifactId: "art-456"}, rows: [$rec]}}')"
    fi
  elif [[ "$path" == "/reports/monthly-operations-summaries/rebuild" ]]; then
    local month=$(jq -r '.periodMonth' "$req_file")
    local single_month_record="$(echo "$FIXTURE_MONTHLY_RECORDS" | jq -c --arg month "$month" 'map(select(.periodMonth == $month)) | .[0] // empty')"
    if [[ -n "$single_month_record" ]]; then
      RESP_BODY="$(jq -n --argjson rec "$single_month_record" '{data: {rebuiltCount: 1, records: [$rec]}}')"
    else
      RESP_BODY="$(jq -n '{data: {rebuiltCount: 0, records: []}}')"
    fi
  elif [[ "$path" == "/reports/operations-summary/preview"* ]]; then
       RESP_BODY="$(jq -n --argjson rec "$FIXTURE_SUMMARY_ROW" '{data: {items: [$rec]}}')"
  fi
}

run_scenario() {
  local name="$1"
  local APP_CREATED_AT="$2"
  local PHONE_CREATED_AT="$3"
  local PORTAL_WINDOW_START="$4"
  local APP_COMPLAINT_CREATED_AT="$5"
  local PHONE_COMPLAINT_CREATED_AT="$6"
  export FIXTURE_MONTHLY_RECORDS="$7"
  export FIXTURE_SUMMARY_ROW="$8"

  echo "--- Running scenario: $name ---"

  eval "$(extract_authoritative_dates "$APP_CREATED_AT" "$PHONE_CREATED_AT" "$PORTAL_WINDOW_START")"
  local APP_COMPLAINT_MONTH="$(get_month_from_iso "$APP_COMPLAINT_CREATED_AT")"
  local PHONE_COMPLAINT_MONTH="$(get_month_from_iso "$PHONE_COMPLAINT_CREATED_AT")"
  eval "$(compute_expected_complaints "$APP_COMPLAINT_MONTH" "$APP_SUMMARY_MONTH" "$PHONE_COMPLAINT_MONTH" "$PHONE_SUMMARY_MONTH")"

  export APP_ORDER_ID="app-order-1"
  export PHONE_ORDER_ID="phone-order-1"
  export PORTAL_ORDER_ID="portal-order-1"
  export E2E_SEED_TENANT_ID="tenant-1"
  export TAXI_BUSINESS_AREA="test-business-area"
  local TAXI_UNIQUE_VEHICLE_COUNT=1
  export SUMMARY_FROM_DATE=$(echo "$FIXTURE_SUMMARY_ROW" | jq -r '.from')
  export SUMMARY_TO_DATE=$(echo "$FIXTURE_SUMMARY_ROW" | jq -r '.to')
  export APP_REAL_DATE="$(get_date_from_iso "$APP_CREATED_AT")"
  export PHONE_REAL_DATE="$(get_date_from_iso "$PHONE_CREATED_AT")"
  export PORTAL_REAL_DATE="$(get_date_from_iso "$PORTAL_WINDOW_START")"
  export TMP_DIR="$(mktemp -d)"

  aggregate_and_assert_daily_records "$UNIQUE_SERVICE_DATES" "$APP_ORDER_ID" "$PHONE_ORDER_ID" "$PORTAL_ORDER_ID" "$E2E_SEED_TENANT_ID" "$name"
  
  local AGGREGATED_MONTHLY_RECORDS
  AGGREGATED_MONTHLY_RECORDS="$(aggregate_monthly_records "$UNIQUE_SUMMARY_MONTHS" "$TAXI_BUSINESS_AREA")"
  
  assert_monthly_records "$AGGREGATED_MONTHLY_RECORDS" "$TAXI_UNIQUE_VEHICLE_COUNT" > /dev/null
  
  local SUM_DEMAND="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.demandRequestCount // .demand_request_count // 0) | add')"
  local MONTHLY_EXPECTED_SNAPSHOTS="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.expectedSnapshotCount // .expected_snapshot_count // 0) | add')"
  local EXPECTED_COVERAGE="$(round_four "$(awk -v valid=3 -v total="$MONTHLY_EXPECTED_SNAPSHOTS" 'BEGIN { print valid / total }')")"
  local MAX_AVG_DISPATCHABLE="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.averageDispatchableVehicleCount // .average_dispatchable_vehicle_count // 0) | max')"

  run_summary_preview_and_assert "$SUMMARY_FROM_DATE" "$SUMMARY_TO_DATE" "$TAXI_BUSINESS_AREA" "$MAX_AVG_DISPATCHABLE" "$MONTHLY_EXPECTED_SNAPSHOTS" "$EXPECTED_COVERAGE"

  run_summary_job_and_assert "$SUMMARY_FROM_DATE" "$SUMMARY_TO_DATE" "$TAXI_BUSINESS_AREA" "$MAX_AVG_DISPATCHABLE" "$MONTHLY_EXPECTED_SNAPSHOTS" "$EXPECTED_COVERAGE" "$name"
  
  rm -rf "$TMP_DIR"
}


# daytime
run_scenario "Daytime" \
  "2026-09-15T12:00:05Z" "2026-09-15T12:00:10Z" "2026-09-15T12:30:00Z" \
  "2026-09-15T12:05:00Z" "2026-09-15T12:15:00Z" \
  '[{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}]' \
  '{"from": "2026-09-01", "to": "2026-09-30", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}'

# 23:29:59 portal crosses day (Wait, 23:29:59 portal is 23:59:59. It's same month/day.)
run_scenario "23:29:59" \
  "2026-09-15T23:29:59Z" "2026-09-15T23:30:05Z" "2026-09-15T23:59:59Z" \
  "2026-09-15T23:45:00Z" "2026-09-15T23:50:00Z" \
  '[{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}]' \
  '{"from": "2026-09-01", "to": "2026-09-30", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}'

# 23:30:00 portal crosses day
run_scenario "23:30:00" \
  "2026-09-15T23:30:00Z" "2026-09-15T23:30:05Z" "2026-09-16T00:00:00Z" \
  "2026-09-15T23:45:00Z" "2026-09-15T23:50:00Z" \
  '[{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}]' \
  '{"from": "2026-09-01", "to": "2026-09-30", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}'

# same-month midnight (App at 23:59:59, Phone at 00:00:01 next day, Portal 00:29:59)
run_scenario "same-month midnight" \
  "2026-09-15T23:59:59Z" "2026-09-16T00:00:01Z" "2026-09-16T00:29:59Z" \
  "2026-09-16T00:05:00Z" "2026-09-16T00:10:00Z" \
  '[{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}]' \
  '{"from": "2026-09-01", "to": "2026-09-30", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}'

# both orders next month (App/Phone on Oct 1, Portal on Oct 1)
run_scenario "both orders next month" \
  "2026-10-01T00:00:01Z" "2026-10-01T00:00:02Z" "2026-10-01T00:29:59Z" \
  "2026-10-01T00:05:00Z" "2026-10-01T00:10:00Z" \
  '[{"periodMonth": "2026-10", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8928, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}]' \
  '{"from": "2026-10-01", "to": "2026-10-31", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8928, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}'

# split-order month/year
run_scenario "split-order month/year" \
  "2026-12-31T23:59:59Z" "2027-01-01T00:00:01Z" "2027-01-01T00:29:59Z" \
  "2027-01-01T00:05:00Z" "2027-01-01T00:10:00Z" \
  '['\
'{"periodMonth": "2026-12", "demandRequestCount": 1, "actualDispatchCount": 1, "completedTripCount": 1, "cancelledOrderCount": 0, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8928, "snapshotCoverageRate": 0.0003, "complaintCount": 0, "complaintsByCategory": {}},'\
'{"periodMonth": "2027-01", "demandRequestCount": 1, "actualDispatchCount": 1, "completedTripCount": 0, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 0, "validSnapshotCount": 0, "expectedSnapshotCount": 8928, "snapshotCoverageRate": 0, "complaintCount": 1, "complaintsByCategory": {"no_arrival": 1}}'\
']' \
  '{"from": "2026-12-01", "to": "2027-01-31", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 17856, "snapshotCoverageRate": 0.0002, "complaintCount": 1, "complaintsByCategory": {"no_arrival": 1}}'

# one complaint crossing
run_scenario "one/both complaints crossing (one crossing)" \
  "2026-09-30T23:30:00Z" "2026-09-30T23:30:05Z" "2026-10-01T00:00:00Z" \
  "2026-09-30T23:50:00Z" "2026-10-01T00:10:00Z" \
  '['\
'{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 1, "complaintsByCategory": {"late_arrival": 1}}'\
']' \
  '{"from": "2026-09-01", "to": "2026-10-31", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 1, "complaintsByCategory": {"late_arrival": 1}}'

# both complaints crossing
run_scenario "one/both complaints crossing (both crossing)" \
  "2026-09-30T23:50:00Z" "2026-09-30T23:50:05Z" "2026-10-01T00:20:00Z" \
  "2026-10-01T00:05:00Z" "2026-10-01T00:10:00Z" \
  '['\
'{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 0, "complaintsByCategory": {}}'\
']' \
  '{"from": "2026-09-01", "to": "2026-10-31", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 0, "complaintsByCategory": {}}'

# Negative controls
echo "--- Running negative controls ---"

# Wrong daily3 totals: e.g. demandRequestCount is 3 instead of 2 in summary
if ( run_scenario 'negative demand' \
  '2026-09-15T12:00:05Z' '2026-09-15T12:00:10Z' '2026-09-15T12:30:00Z' \
  '2026-09-15T12:05:00Z' '2026-09-15T12:15:00Z' \
  '[{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}]' \
  '{"from": "2026-09-01", "to": "2026-09-30", "demandRequestCount": 3, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}' ) >/dev/null 2>&1; then
  echo "FAIL: Negative control (wrong demand) passed unexpectedly!"
  exit 1
fi

# Wrong snapshots/bounds: expectedSnapshotCount missing or wrong
if ( run_scenario 'negative snapshots' \
  '2026-09-15T12:00:05Z' '2026-09-15T12:00:10Z' '2026-09-15T12:30:00Z' \
  '2026-09-15T12:05:00Z' '2026-09-15T12:15:00Z' \
  '[{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 9999, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}]' \
  '{"from": "2026-09-01", "to": "2026-09-30", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1, "no_arrival": 1}}' ) >/dev/null 2>&1; then
  echo "FAIL: Negative control (wrong snapshots) passed unexpectedly!"
  exit 1
fi

# Sparse category: missing no_arrival where expected
if ( run_scenario 'negative sparse category' \
  '2026-09-15T12:00:05Z' '2026-09-15T12:00:10Z' '2026-09-15T12:30:00Z' \
  '2026-09-15T12:05:00Z' '2026-09-15T12:15:00Z' \
  '[{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1}}]' \
  '{"from": "2026-09-01", "to": "2026-09-30", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 2, "complaintsByCategory": {"late_arrival": 1}}' ) >/dev/null 2>&1; then
  echo "FAIL: Negative control (sparse category missing no_arrival) passed unexpectedly!"
  exit 1
fi

echo "All boundary tests passed!"
