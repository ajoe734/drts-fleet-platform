#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../../../tests/e2e/lib/operations-reporting-dates.sh"

test_scenario() {
  local base_time="$1"
  local offset_sec="$2"
  local portal_offset_min=30

  # Simulate order creation times
  local app_created_at=$(date -u -d "${base_time} + ${offset_sec} seconds" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -j -v+${offset_sec}S -f "%Y-%m-%dT%H:%M:%SZ" "${base_time}" +"%Y-%m-%dT%H:%M:%SZ")
  local phone_created_at="$app_created_at"
  local portal_window_start=$(date -u -d "${base_time} + ${portal_offset_min} minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -j -v+${portal_offset_min}M -f "%Y-%m-%dT%H:%M:%SZ" "${base_time}" +"%Y-%m-%dT%H:%M:%SZ")

  # --- OLD LOGIC ---
  # The old logic froze SUMMARY_MONTH using base_time
  local old_summary_month="$(get_month_from_iso "$base_time")"
  
  # A mock backend query: given a month, it returns the number of orders we generated in that month
  # We generated 2 orders (app, phone) at $app_created_at
  local old_app_count=0
  local actual_app_month="$(get_month_from_iso "$app_created_at")"
  if [[ "$old_summary_month" == "$actual_app_month" ]]; then
    old_app_count=2
  fi

  # --- NEW LOGIC ---
  eval "$(extract_authoritative_dates "$app_created_at" "$phone_created_at" "$portal_window_start")"
  
  local new_demand_count=0
  for month in $UNIQUE_SUMMARY_MONTHS; do
    if [[ "$month" == "$actual_app_month" ]]; then
      new_demand_count=$((new_demand_count + 2))
    fi
  done
  
  echo "Testing base_time=$base_time offset_sec=$offset_sec"
  echo "  Old logic found $old_app_count demand (expected 2)"
  echo "  New logic found $new_demand_count demand (expected 2)"
  
  if [[ "$old_app_count" != "2" ]]; then
    echo "  -> Old failure demonstrated"
  else
    echo "  -> Old logic passes (no boundary crossed)"
  fi
  
  if [[ "$new_demand_count" != "2" ]]; then
    echo "  -> NEW LOGIC FAILED!"
    exit 1
  fi
}

echo "=== Running Offline Regression Tests ==="

# 1. Daytime (no boundary crossed)
test_scenario "2026-09-15T12:00:00Z" 5

# 2. 23:29:59 (portal crosses day, but month same)
test_scenario "2026-09-15T23:29:59Z" 5

# 2.5 23:30:00
test_scenario "2026-09-15T23:30:00Z" 5

# 3. Midnight (app crosses month boundary)
test_scenario "2026-09-30T23:59:59Z" 5

# 4. Year rollover
test_scenario "2026-12-31T23:59:59Z" 5

echo "All boundary tests passed!"
