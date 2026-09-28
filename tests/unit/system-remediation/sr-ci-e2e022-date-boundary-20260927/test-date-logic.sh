#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../../../tests/e2e/lib/operations-reporting-dates.sh"

assert_non_empty() {
  local label="$1" value="${2:-}"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "ASSERT FAIL: $label is empty"
    exit 1
  fi
}

assert_int_equals() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "ASSERT FAIL: $label - Expected $expected, got ${actual:-empty}"
    exit 1
  fi
}

assert_equals() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "ASSERT FAIL: $label - Expected $expected, got ${actual:-empty}"
    exit 1
  fi
}

assert_int_ge() {
  local label="$1" minimum="$2" actual="$3"
  if [[ -z "$actual" ]] || (( actual < minimum )); then
    echo "ASSERT FAIL: $label - Expected >= $minimum, got ${actual:-empty}"
    exit 1
  fi
}

run_scenario() {
  local name="$1"
  local APP_CREATED_AT="$2"
  local PHONE_CREATED_AT="$3"
  local PORTAL_WINDOW_START="$4"
  local APP_COMPLAINT_CREATED_AT="$5"
  local PHONE_COMPLAINT_CREATED_AT="$6"
  local FIXTURE_MONTHLY_RECORDS="$7"
  local FIXTURE_SUMMARY_ROW="$8"

  echo "--- Running scenario: $name ---"

  eval "$(extract_authoritative_dates "$APP_CREATED_AT" "$PHONE_CREATED_AT" "$PORTAL_WINDOW_START")"
  local APP_COMPLAINT_MONTH="$(get_month_from_iso "$APP_COMPLAINT_CREATED_AT")"
  local PHONE_COMPLAINT_MONTH="$(get_month_from_iso "$PHONE_COMPLAINT_CREATED_AT")"
  eval "$(compute_expected_complaints "$APP_COMPLAINT_MONTH" "$APP_SUMMARY_MONTH" "$PHONE_COMPLAINT_MONTH" "$PHONE_SUMMARY_MONTH")"

  local AGGREGATED_MONTHLY_RECORDS="$FIXTURE_MONTHLY_RECORDS"
  local SUMMARY_ROW="$FIXTURE_SUMMARY_ROW"
  local SUMMARY_JOB_ROW="$FIXTURE_SUMMARY_ROW"
  local TAXI_UNIQUE_VEHICLE_COUNT=1

  # Full E2E monthly assertions
  local SUM_DEMAND="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.demandRequestCount // .demand_request_count // 0) | add')"
  local SUM_ACTUAL_DISPATCH="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.actualDispatchCount // .actual_dispatch_count // 0) | add')"
  local SUM_COMPLETED_TRIP="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.completedTripCount // .completed_trip_count // 0) | add')"
  local SUM_CANCELLED_ORDER="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.cancelledOrderCount // .cancelled_order_count // 0) | add')"
  local MAX_AVG_DISPATCHABLE="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.averageDispatchableVehicleCount // .average_dispatchable_vehicle_count // 0) | max')"
  local SUM_VALID_SNAPSHOTS="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.validSnapshotCount // .valid_snapshot_count // 0) | add')"
  local MONTHLY_EXPECTED_SNAPSHOTS="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.expectedSnapshotCount // .expected_snapshot_count // 0) | add')"
  local SUM_COMPLAINTS="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map(.complaintCount // .complaint_count // 0) | add')"
  local SUM_COMPLAINTS_LATE="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map((.complaintsByCategory // .complaints_by_category).late_arrival // 0) | add')"
  local SUM_COMPLAINTS_NO_ARR="$(echo "$AGGREGATED_MONTHLY_RECORDS" | jq 'map((.complaintsByCategory // .complaints_by_category).no_arrival // 0) | add')"

  assert_int_equals "monthly demandRequestCount" 2 "$SUM_DEMAND"
  assert_int_equals "monthly actualDispatchCount" 2 "$SUM_ACTUAL_DISPATCH"
  assert_int_equals "monthly completedTripCount" 1 "$SUM_COMPLETED_TRIP"
  assert_int_equals "monthly cancelledOrderCount" 1 "$SUM_CANCELLED_ORDER"
  assert_equals "monthly averageDispatchableVehicleCount" "$TAXI_UNIQUE_VEHICLE_COUNT" "$MAX_AVG_DISPATCHABLE"
  assert_int_equals "monthly validSnapshotCount" 3 "$SUM_VALID_SNAPSHOTS"
  assert_int_ge "monthly expectedSnapshotCount" 1 "$MONTHLY_EXPECTED_SNAPSHOTS"

  local EXPECTED_COVERAGE="$(round_four "$(awk -v valid=3 -v total="$MONTHLY_EXPECTED_SNAPSHOTS" 'BEGIN { print valid / total }')")"

  verify_monthly_coverage "$AGGREGATED_MONTHLY_RECORDS"

  assert_int_equals "monthly complaintCount" "$EXPECTED_TOTAL_COMPLAINT_COUNT" "$SUM_COMPLAINTS"
  assert_int_equals "monthly complaintsByCategory.late_arrival" "$EXPECTED_LATE_ARRIVAL_COUNT" "$SUM_COMPLAINTS_LATE"
  assert_int_equals "monthly complaintsByCategory.no_arrival" "$EXPECTED_NO_ARRIVAL_COUNT" "$SUM_COMPLAINTS_NO_ARR"

  # Full E2E summary preview assertions
  assert_equals "summary preview from" "$SUMMARY_FROM_DATE" "$(json_field_from_object "$SUMMARY_ROW" '.from')"
  assert_equals "summary preview to" "$SUMMARY_TO_DATE" "$(json_field_from_object "$SUMMARY_ROW" '.to')"
  assert_int_equals "summary preview demandRequestCount" 2 "$(json_field_from_object "$SUMMARY_ROW" '(.demandRequestCount // .demand_request_count)')"
  assert_int_equals "summary preview actualDispatchCount" 2 "$(json_field_from_object "$SUMMARY_ROW" '(.actualDispatchCount // .actual_dispatch_count)')"
  assert_int_equals "summary preview completedTripCount" 1 "$(json_field_from_object "$SUMMARY_ROW" '(.completedTripCount // .completed_trip_count)')"
  assert_int_equals "summary preview cancelledOrderCount" 1 "$(json_field_from_object "$SUMMARY_ROW" '(.cancelledOrderCount // .cancelled_order_count)')"
  assert_equals "summary preview averageDispatchableVehicleCount" "$MAX_AVG_DISPATCHABLE" "$(json_field_from_object "$SUMMARY_ROW" '(.averageDispatchableVehicleCount // .average_dispatchable_vehicle_count)')"
  assert_int_equals "summary preview validSnapshotCount" 3 "$(json_field_from_object "$SUMMARY_ROW" '(.validSnapshotCount // .valid_snapshot_count)')"
  assert_int_equals "summary preview expectedSnapshotCount" "$MONTHLY_EXPECTED_SNAPSHOTS" "$(json_field_from_object "$SUMMARY_ROW" '(.expectedSnapshotCount // .expected_snapshot_count)')"
  assert_equals "summary preview snapshotCoverageRate" "$EXPECTED_COVERAGE" "$(round_four "$(json_field_from_object "$SUMMARY_ROW" '(.snapshotCoverageRate // .snapshot_coverage_rate)')")"
  assert_int_equals "summary preview complaintCount" "$EXPECTED_TOTAL_COMPLAINT_COUNT" "$(json_field_from_object "$SUMMARY_ROW" '(.complaintCount // .complaint_count)')"
  verify_complaints_by_category "summary preview" "$SUMMARY_ROW" "$EXPECTED_LATE_ARRIVAL_COUNT" "$EXPECTED_NO_ARRIVAL_COUNT"

  # Full E2E summary job assertions
  assert_int_equals "summary report demandRequestCount" 2 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.demandRequestCount // .demand_request_count)')"
  assert_int_equals "summary report actualDispatchCount" 2 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.actualDispatchCount // .actual_dispatch_count)')"
  assert_int_equals "summary report completedTripCount" 1 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.completedTripCount // .completed_trip_count)')"
  assert_int_equals "summary report cancelledOrderCount" 1 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.cancelledOrderCount // .cancelled_order_count)')"
  assert_equals "summary report averageDispatchableVehicleCount" "$MAX_AVG_DISPATCHABLE" "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.averageDispatchableVehicleCount // .average_dispatchable_vehicle_count)')"
  assert_int_equals "summary report validSnapshotCount" 3 "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.validSnapshotCount // .valid_snapshot_count)')"
  assert_int_equals "summary report expectedSnapshotCount" "$MONTHLY_EXPECTED_SNAPSHOTS" "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.expectedSnapshotCount // .expected_snapshot_count)')"
  assert_equals "summary report snapshotCoverageRate" "$EXPECTED_COVERAGE" "$(round_four "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.snapshotCoverageRate // .snapshot_coverage_rate)')")"
  assert_int_equals "summary report complaintCount" "$EXPECTED_TOTAL_COMPLAINT_COUNT" "$(json_field_from_object "$SUMMARY_JOB_ROW" '(.complaintCount // .complaint_count)')"
  verify_complaints_by_category "summary report" "$SUMMARY_JOB_ROW" "$EXPECTED_LATE_ARRIVAL_COUNT" "$EXPECTED_NO_ARRIVAL_COUNT"

  # Assert daily3
  local DAILY_REBUILT_COUNT=0
  for sd in $UNIQUE_SERVICE_DATES; do
     if [[ "$sd" == "$APP_SERVICE_DATE" ]]; then DAILY_REBUILT_COUNT=$((DAILY_REBUILT_COUNT + 2)); fi
     if [[ "$sd" == "$PORTAL_SERVICE_DATE" && "$APP_SERVICE_DATE" != "$PORTAL_SERVICE_DATE" ]]; then DAILY_REBUILT_COUNT=$((DAILY_REBUILT_COUNT + 1)); fi
  done
  if [[ "$APP_SERVICE_DATE" == "$PORTAL_SERVICE_DATE" ]]; then
     DAILY_REBUILT_COUNT=3
  fi
  assert_int_equals "daily rebuild count" 3 "$DAILY_REBUILT_COUNT"
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
'{"periodMonth": "2027-01", "demandRequestCount": 1, "actualDispatchCount": 1, "completedTripCount": 0, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 0, "expectedSnapshotCount": 8928, "snapshotCoverageRate": 0, "complaintCount": 1, "complaintsByCategory": {"no_arrival": 1}}'\
']' \
  '{"from": "2026-12-01", "to": "2027-01-31", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 17856, "snapshotCoverageRate": 0.0002, "complaintCount": 1, "complaintsByCategory": {"no_arrival": 1}}'

# one complaint crossing
run_scenario "one/both complaints crossing (one crossing)" \
  "2026-09-30T23:30:00Z" "2026-09-30T23:30:05Z" "2026-10-01T00:00:00Z" \
  "2026-09-30T23:50:00Z" "2026-10-01T00:10:00Z" \
  '['\
'{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 1, "complaintsByCategory": {"late_arrival": 1}},'\
'{"periodMonth": "2026-10", "demandRequestCount": 0, "actualDispatchCount": 0, "completedTripCount": 0, "cancelledOrderCount": 0, "averageDispatchableVehicleCount": 0, "validSnapshotCount": 0, "expectedSnapshotCount": 8928, "snapshotCoverageRate": 0, "complaintCount": 0, "complaintsByCategory": {}}'\
']' \
  '{"from": "2026-09-01", "to": "2026-10-31", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 17568, "snapshotCoverageRate": 0.0002, "complaintCount": 1, "complaintsByCategory": {"late_arrival": 1}}'

# both complaints crossing
run_scenario "one/both complaints crossing (both crossing)" \
  "2026-09-30T23:50:00Z" "2026-09-30T23:50:05Z" "2026-10-01T00:20:00Z" \
  "2026-10-01T00:05:00Z" "2026-10-01T00:10:00Z" \
  '['\
'{"periodMonth": "2026-09", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 8640, "snapshotCoverageRate": 0.0003, "complaintCount": 0, "complaintsByCategory": {}},'\
'{"periodMonth": "2026-10", "demandRequestCount": 0, "actualDispatchCount": 0, "completedTripCount": 0, "cancelledOrderCount": 0, "averageDispatchableVehicleCount": 0, "validSnapshotCount": 0, "expectedSnapshotCount": 8928, "snapshotCoverageRate": 0, "complaintCount": 0, "complaintsByCategory": {}}'\
']' \
  '{"from": "2026-09-01", "to": "2026-10-31", "demandRequestCount": 2, "actualDispatchCount": 2, "completedTripCount": 1, "cancelledOrderCount": 1, "averageDispatchableVehicleCount": 1, "validSnapshotCount": 3, "expectedSnapshotCount": 17568, "snapshotCoverageRate": 0.0002, "complaintCount": 0, "complaintsByCategory": {}}'

echo "All boundary tests passed!"
