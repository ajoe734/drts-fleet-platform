#!/usr/bin/env bash
# Helper to compute UTC dates based on system time and offsets.

get_current_time() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

get_date_from_iso() {
  local iso_time="$1"
  echo "${iso_time:0:10}"
}

get_month_from_iso() {
  local iso_time="$1"
  echo "${iso_time:0:7}"
}

get_time_with_offset() {
  local offset_minutes="$1"
  date -u -d "+${offset_minutes} minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+${offset_minutes}M +"%Y-%m-%dT%H:%M:%SZ"
}

extract_authoritative_dates() {
  local app_created_at="$1"
  local phone_created_at="$2"
  local portal_window_start="$3"

  local app_service_date="$(get_date_from_iso "$app_created_at")"
  local app_summary_month="$(get_month_from_iso "$app_created_at")"

  local phone_service_date="$(get_date_from_iso "$phone_created_at")"
  local phone_summary_month="$(get_month_from_iso "$phone_created_at")"

  local portal_service_date="$(get_date_from_iso "$portal_window_start")"
  local portal_summary_month="$(get_month_from_iso "$portal_window_start")"

  local unique_service_dates="$(echo -e "${app_service_date}\n${phone_service_date}\n${portal_service_date}" | sort -u)"
  local unique_summary_months="$(echo -e "${app_summary_month}\n${phone_summary_month}\n${portal_summary_month}" | sort -u)"

  local min_summary_month="$(echo "$unique_summary_months" | head -n 1)"
  local max_summary_month="$(echo "$unique_summary_months" | tail -n 1)"
  local summary_from_date="${min_summary_month}-01"
  local summary_to_date=$(
    date -u -d "${max_summary_month}-01 +1 month -1 day" +"%Y-%m-%d" 2>/dev/null \
      || date -u -j -f "%Y-%m-%d" "${max_summary_month}-01" -v+1m -v-1d +"%Y-%m-%d"
  )

  echo "APP_SERVICE_DATE=${app_service_date}"
  echo "APP_SUMMARY_MONTH=${app_summary_month}"
  echo "PHONE_SERVICE_DATE=${phone_service_date}"
  echo "PHONE_SUMMARY_MONTH=${phone_summary_month}"
  echo "PORTAL_SERVICE_DATE=${portal_service_date}"
  echo "PORTAL_SUMMARY_MONTH=${portal_summary_month}"
  echo "UNIQUE_SERVICE_DATES=\"${unique_service_dates}\""
  echo "UNIQUE_SUMMARY_MONTHS=\"${unique_summary_months}\""
  echo "SUMMARY_FROM_DATE=${summary_from_date}"
  echo "SUMMARY_TO_DATE=${summary_to_date}"
}

json_field_from_object() {
  local json_object="$1" jq_expr="$2"
  echo "$json_object" | jq -r "${jq_expr} // empty" 2>/dev/null || true
}

round_four() {
  local val="$1"
  awk -v value="$1" 'BEGIN { printf "%.4f", value + 0 }'
}

verify_complaints_by_category() {
  local prefix="$1"
  local summary_row="$2"
  local expected_late="$3"
  local expected_no_arr="$4"
  
  assert_int_equals \
    "${prefix} complaintsByCategory.late_arrival" \
    "$expected_late" \
    "$(json_field_from_object "$summary_row" '(.complaintsByCategory // .complaints_by_category).late_arrival // 0')"

  assert_int_equals \
    "${prefix} complaintsByCategory.no_arrival" \
    "$expected_no_arr" \
    "$(json_field_from_object "$summary_row" '(.complaintsByCategory // .complaints_by_category).no_arrival // 0')"
}

verify_monthly_coverage() {
  local aggregated_monthly_records="$1"
  for row in $(echo "$aggregated_monthly_records" | jq -c '.[]'); do
    local row_month="$(echo "$row" | jq -r '.periodMonth // .period_month')"
    local row_valid="$(echo "$row" | jq -r '.validSnapshotCount // .valid_snapshot_count // 0')"
    local row_expected="$(echo "$row" | jq -r '.expectedSnapshotCount // .expected_snapshot_count // 0')"
    local row_coverage="$(echo "$row" | jq -r '.snapshotCoverageRate // .snapshot_coverage_rate // 0')"
    
    if [[ "$row_expected" -gt 0 ]]; then
      local expected_row_coverage="$(round_four "$(awk -v valid="$row_valid" -v total="$row_expected" 'BEGIN { print valid / total }')")"
      assert_equals "monthly snapshotCoverageRate for $row_month" "$expected_row_coverage" "$(round_four "$row_coverage")"
    fi
  done
}

compute_expected_complaints() {
  local app_complaint_month="$1"
  local app_summary_month="$2"
  local phone_complaint_month="$3"
  local phone_summary_month="$4"

  local expected_app=0
  if [[ "$app_complaint_month" == "$app_summary_month" ]]; then
    expected_app=1
  fi

  local expected_phone=0
  if [[ "$phone_complaint_month" == "$phone_summary_month" ]]; then
    expected_phone=1
  fi

  echo "EXPECTED_APP_COMPLAINT_COUNT=$expected_app"
  echo "EXPECTED_PHONE_COMPLAINT_COUNT=$expected_phone"
  echo "EXPECTED_TOTAL_COMPLAINT_COUNT=$((expected_app + expected_phone))"
  echo "EXPECTED_LATE_ARRIVAL_COUNT=$expected_app"
  echo "EXPECTED_NO_ARRIVAL_COUNT=$expected_phone"
}
