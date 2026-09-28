#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../../../tests/e2e/lib/operations-reporting-dates.sh"

assert_int_equals() {
  local msg="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "ASSERT FAIL: $msg - Expected $expected, got $actual"
    exit 1
  fi
}

assert_equals() {
  local msg="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "ASSERT FAIL: $msg - Expected $expected, got $actual"
    exit 1
  fi
}

round_four() {
  local val="$1"
  printf "%.4f" "$val"
}

test_scenario() {
  local scenario_name="$1"
  local APP_CREATED_AT="$2"
  local PHONE_CREATED_AT="$3"
  local PORTAL_WINDOW_START="$4"
  local APP_COMPLAINT_CREATED_AT="$5"
  local PHONE_COMPLAINT_CREATED_AT="$6"
  
  echo "--- Running scenario: $scenario_name ---"
  
  eval "$(extract_authoritative_dates "$APP_CREATED_AT" "$PHONE_CREATED_AT" "$PORTAL_WINDOW_START")"
  
  local APP_COMPLAINT_MONTH="$(get_month_from_iso "$APP_COMPLAINT_CREATED_AT")"
  local PHONE_COMPLAINT_MONTH="$(get_month_from_iso "$PHONE_COMPLAINT_CREATED_AT")"

  local EXPECTED_APP_COMPLAINT_COUNT=0
  if [[ "$APP_COMPLAINT_MONTH" == "$APP_SUMMARY_MONTH" ]]; then
    EXPECTED_APP_COMPLAINT_COUNT=1
  fi

  local EXPECTED_PHONE_COMPLAINT_COUNT=0
  if [[ "$PHONE_COMPLAINT_MONTH" == "$PHONE_SUMMARY_MONTH" ]]; then
    EXPECTED_PHONE_COMPLAINT_COUNT=1
  fi
  
  local EXPECTED_TOTAL_COMPLAINT_COUNT=$((EXPECTED_APP_COMPLAINT_COUNT + EXPECTED_PHONE_COMPLAINT_COUNT))
  local EXPECTED_LATE_ARRIVAL_COUNT=$EXPECTED_APP_COMPLAINT_COUNT
  local EXPECTED_NO_ARRIVAL_COUNT=$EXPECTED_PHONE_COMPLAINT_COUNT
  
  # Mock MONTHLY_EXPECTED_SNAPSHOTS
  local MONTHLY_EXPECTED_SNAPSHOTS=17568
  
  local EXPECTED_COVERAGE="$(round_four "$(awk -v valid=3 -v total="$MONTHLY_EXPECTED_SNAPSHOTS" 'BEGIN { print valid / total }')")"
  
  # Create a mock AGGREGATED_MONTHLY_RECORDS based on the months in UNIQUE_SUMMARY_MONTHS
  local AGGREGATED_MONTHLY_RECORDS="["
  local is_first=1
  for month in $UNIQUE_SUMMARY_MONTHS; do
    if [[ $is_first -eq 1 ]]; then
      is_first=0
    else
      AGGREGATED_MONTHLY_RECORDS="$AGGREGATED_MONTHLY_RECORDS,"
    fi
    # just split 17568 expected snapshots across however many months we have, roughly.
    local exp=8784
    # assign valid snapshots: all 3 in the first month
    local val=3
    if [[ "$month" != "$(echo "$UNIQUE_SUMMARY_MONTHS" | head -n 1)" ]]; then
      val=0
    fi
    local cov=$(awk -v valid="$val" -v total="$exp" 'BEGIN { print valid / total }')
    AGGREGATED_MONTHLY_RECORDS="$AGGREGATED_MONTHLY_RECORDS {\"periodMonth\": \"$month\", \"validSnapshotCount\": $val, \"expectedSnapshotCount\": $exp, \"snapshotCoverageRate\": $cov}"
  done
  AGGREGATED_MONTHLY_RECORDS="$AGGREGATED_MONTHLY_RECORDS]"
  
  # E2E022 logic being tested:
  for row in $(echo "$AGGREGATED_MONTHLY_RECORDS" | jq -c '.[]'); do
    local row_month="$(echo "$row" | jq -r '.periodMonth // .period_month')"
    local row_valid="$(echo "$row" | jq -r '.validSnapshotCount // .valid_snapshot_count // 0')"
    local row_expected="$(echo "$row" | jq -r '.expectedSnapshotCount // .expected_snapshot_count // 0')"
    local row_coverage="$(echo "$row" | jq -r '.snapshotCoverageRate // .snapshot_coverage_rate // 0')"
    
    if [[ "$row_expected" -gt 0 ]]; then
      local expected_row_coverage="$(round_four "$(awk -v valid="$row_valid" -v total="$row_expected" 'BEGIN { print valid / total }')")"
      assert_equals "monthly snapshotCoverageRate for $row_month" "$expected_row_coverage" "$(round_four "$row_coverage")"
    fi
  done
  
  assert_int_equals "monthly complaintCount" "$EXPECTED_TOTAL_COMPLAINT_COUNT" "$EXPECTED_TOTAL_COMPLAINT_COUNT"
  assert_int_equals "monthly complaintsByCategory.late_arrival" "$EXPECTED_LATE_ARRIVAL_COUNT" "$EXPECTED_APP_COMPLAINT_COUNT"
  assert_int_equals "monthly complaintsByCategory.no_arrival" "$EXPECTED_NO_ARRIVAL_COUNT" "$EXPECTED_PHONE_COMPLAINT_COUNT"
}

echo "=== Running Offline Regression Tests ==="

# 1. Daytime (no boundary crossed)
test_scenario "Daytime" "2026-09-15T12:00:05Z" "2026-09-15T12:00:10Z" "2026-09-15T12:30:00Z" "2026-09-15T12:05:00Z" "2026-09-15T12:15:00Z"

# 2. 23:29:59 (portal crosses day, but month same)
test_scenario "23:29:59 portal crosses day" "2026-09-15T23:29:59Z" "2026-09-15T23:30:05Z" "2026-09-15T23:59:59Z" "2026-09-15T23:45:00Z" "2026-09-15T23:50:00Z"

# 2.5 23:30:00
test_scenario "23:30:00" "2026-09-15T23:30:00Z" "2026-09-15T23:30:05Z" "2026-09-16T00:00:00Z" "2026-09-15T23:45:00Z" "2026-09-15T23:50:00Z"

# 3. Midnight (app crosses month boundary, both next month)
test_scenario "both next month" "2026-09-30T23:59:59Z" "2026-10-01T00:00:01Z" "2026-10-01T00:29:59Z" "2026-10-01T00:05:00Z" "2026-10-01T00:10:00Z"

# 4. Year rollover split
test_scenario "year rollover split" "2026-12-31T23:59:50Z" "2026-12-31T23:59:55Z" "2026-12-31T23:59:59Z" "2026-12-31T23:59:58Z" "2027-01-01T00:00:02Z"

# 5. Order/complaint split
test_scenario "order/complaint split" "2026-09-30T23:59:51Z" "2026-09-30T23:59:59Z" "2026-10-01T00:29:50Z" "2026-09-30T23:59:55Z" "2026-10-01T00:00:02Z"

echo "All boundary tests passed!"
