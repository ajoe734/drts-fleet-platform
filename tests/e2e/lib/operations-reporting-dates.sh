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
  echo "UNIQUE_SERVICE_DATES=\"${unique_service_dates}\""
  echo "UNIQUE_SUMMARY_MONTHS=\"${unique_summary_months}\""
  echo "SUMMARY_FROM_DATE=${summary_from_date}"
  echo "SUMMARY_TO_DATE=${summary_to_date}"
}
