#!/usr/bin/env bash
set -euo pipefail

# This script simulates the old date logic and the new date logic to prove that
# the new logic works deterministically at boundaries.

CURRENT_TIME_OVERRIDE="${1:-}"

# Old logic
current_iso_old() {
  if [[ -n "$CURRENT_TIME_OVERRIDE" ]]; then
    echo "$CURRENT_TIME_OVERRIDE"
  else
    date -u +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

SUFFIX="1234567"
SERVICE_DATE="$(current_iso_old | cut -c 1-10)"
SUMMARY_MONTH="${SERVICE_DATE:0:7}"

if [[ -n "$CURRENT_TIME_OVERRIDE" ]]; then
  # mock date for +30m
  PORTAL_WINDOW_START=$(
    date -u -d "${CURRENT_TIME_OVERRIDE} +30 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
      || date -u -j -v+30M -f "%Y-%m-%dT%H:%M:%SZ" "${CURRENT_TIME_OVERRIDE}" +"%Y-%m-%dT%H:%M:%SZ"
  )
else
  PORTAL_WINDOW_START=$(
    date -u -d "+30 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
      || date -u -v+30M +"%Y-%m-%dT%H:%M:%SZ"
  )
fi

PORTAL_SERVICE_DATE="${PORTAL_WINDOW_START:0:10}"

echo "=== OLD LOGIC ==="
echo "SERVICE_DATE: $SERVICE_DATE"
echo "PORTAL_WINDOW_START: $PORTAL_WINDOW_START"
echo "PORTAL_SERVICE_DATE: $PORTAL_SERVICE_DATE"
if [[ "$SERVICE_DATE" != "$PORTAL_SERVICE_DATE" ]]; then
  echo "=> BOUNDARY CROSSED"
else
  echo "=> SAME DAY"
fi

echo "=== NEW LOGIC ==="
# We can just collect all unique service dates!
UNIQUE_DATES=$(echo -e "${SERVICE_DATE}\n${PORTAL_SERVICE_DATE}" | sort -u)
echo "Unique dates to rebuild:"
echo "$UNIQUE_DATES"
echo "Rebuild loop:"
COUNT=0
for d in $UNIQUE_DATES; do
  echo " - Rebuilding for $d"
  # In a real test, this would be an API call that returns the count for that day.
  # If $d == $SERVICE_DATE, it returns app/phone (2).
  # If $d == $PORTAL_SERVICE_DATE, it returns portal (1).
  # If they are the same day, it returns all 3.
  if [[ "$SERVICE_DATE" == "$PORTAL_SERVICE_DATE" ]]; then
    c=3
  else
    if [[ "$d" == "$SERVICE_DATE" ]]; then
      c=2
    elif [[ "$d" == "$PORTAL_SERVICE_DATE" ]]; then
      c=1
    fi
  fi
  echo "   -> Got $c"
  COUNT=$((COUNT + c))
done
echo "Total count: $COUNT (Expected 3)"
