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
