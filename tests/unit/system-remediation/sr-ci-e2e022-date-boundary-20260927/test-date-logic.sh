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
  local monthly_ret="$(assert_monthly_records "$AGGREGATED_MONTHLY_RECORDS" "$TAXI_UNIQUE_VEHICLE_COUNT")"
  local MAX_AVG_DISPATCHABLE="$(echo "$monthly_ret" | cut -d'|' -f1)"
  local MONTHLY_EXPECTED_SNAPSHOTS="$(echo "$monthly_ret" | cut -d'|' -f2)"
  local EXPECTED_COVERAGE="$(echo "$monthly_ret" | cut -d'|' -f3)"

  # Full E2E summary preview assertions
  assert_summary_row "summary preview" "$SUMMARY_ROW" "$SUMMARY_FROM_DATE" "$SUMMARY_TO_DATE" "$MAX_AVG_DISPATCHABLE" "$MONTHLY_EXPECTED_SNAPSHOTS" "$EXPECTED_COVERAGE"

  # Full E2E summary job assertions
  assert_summary_row "summary report" "$SUMMARY_JOB_ROW" "" "" "$MAX_AVG_DISPATCHABLE" "$MONTHLY_EXPECTED_SNAPSHOTS" "$EXPECTED_COVERAGE"

  # Assert daily3
  local DAILY_REBUILT_COUNT=0
  for sd in $UNIQUE_SERVICE_DATES; do
     local rc=0
     if [[ "$sd" == "$APP_SERVICE_DATE" ]]; then rc=$((rc + 1)); fi
     if [[ "$sd" == "$PHONE_SERVICE_DATE" ]]; then rc=$((rc + 1)); fi
     if [[ "$sd" == "$PORTAL_SERVICE_DATE" ]]; then rc=$((rc + 1)); fi
     DAILY_REBUILT_COUNT=$((DAILY_REBUILT_COUNT + rc))
  done
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
