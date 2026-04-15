#!/usr/bin/env bash
# Smoke test 02 — Booking create
# Creates a tenant booking and stores the bookingId in shared state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

log_step "02 — Booking create"

# Build a timestamped fixture so windows are always in the future
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_START=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")   # macOS fallback
WINDOW_END=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")

FIXTURE_TMP=$(mktemp /tmp/drts-smoke-booking-XXXXXX.json)
trap 'rm -f "$FIXTURE_TMP"' EXIT

jq \
  --arg ws "$WINDOW_START" \
  --arg we "$WINDOW_END" \
  '.reservationWindowStart = $ws | .reservationWindowEnd = $we' \
  "${SCRIPT_DIR}/fixtures/booking-create.json" > "$FIXTURE_TMP"

http_call POST "/tenant/bookings" "$FIXTURE_TMP"
assert_status "200|201"

BOOKING_ID=$(json_get ".data.bookingId")
if [[ -z "$BOOKING_ID" ]]; then
  log_fail "No bookingId in response: ${RESP_BODY}"
  exit 1
fi

state_set "bookingId" "$BOOKING_ID"
log_ok "POST /tenant/bookings → HTTP ${RESP_STATUS}, bookingId=${BOOKING_ID}"

# Verify we can read the booking back
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"
log_ok "GET /tenant/bookings/${BOOKING_ID} → HTTP 200"
