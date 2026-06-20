#!/usr/bin/env bash
# E2E-021 — Driver heartbeat replay (API / emulator level)
#
# Spec: phase1_delta_sd_supply_eligibility_mobile_reporting SD §11.3
#   send batch with duplicate / out-of-order / offline backlog
#   → dedupe
#   → current location remains newest
#   → tracking status correct
#
# Exercises the MOB-BE-002 contract:
#   POST /api/driver/location-heartbeats/batch        — batch ingest + per-item ack
#   GET  /api/driver/tracking-status?driverId=...      — driver self tracking status
#   GET  /api/ops/drivers/{driverId}/tracking-status   — ops tracking status
#
# Verifies:
#   1. A driver with no heartbeats reports locationFreshness "missing".
#   2. A single offline-backlog batch carrying an out-of-order event and a
#      replayed event (same deviceId+sequenceNo) is deduped: the replay is
#      flagged duplicate, real events are accepted.
#   3. Current location only advances to the newest recordedAt; the later but
#      out-of-order uploads do NOT roll the current location backwards.
#   4. Tracking status reflects the newest heartbeat's context (vehicle, task,
#      work state) with locationFreshness "fresh"; ops + driver views agree.
#   5. A newer low-accuracy fix reclassifies freshness to "low_accuracy" and a
#      subsequent out-of-order upload still leaves the newest location in place.
#   6. Contract guards: missing items -> FIELD_REQUIRED, unknown driver ->
#      DRIVER_NOT_FOUND, over-size batch -> BATCH_LIMIT_EXCEEDED.
#
# NOTE on JSON casing: the live API serializes every response with snake_case
# keys (global SnakeCaseInterceptor); request bodies stay camelCase to match the
# DTO field names the service reads. This script therefore POSTs camelCase and
# reads snake_case.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-021"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-021 — Driver heartbeat replay${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-021-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ── Fixtures (seeded driver/vehicle ids from the regulatory registry seed) ────
DRIVER_ID="${E2E_021_DRIVER_ID:-drv-demo-001}"
VEHICLE_ID="${E2E_021_VEHICLE_ID:-veh-demo-001}"
# A seeded driver that this scenario never writes to, so it stays "missing".
BASELINE_DRIVER_ID="${E2E_021_BASELINE_DRIVER_ID:-drv-demo-002}"
# Per-run isolation so re-runs against a shared (non-hermetic) stack never
# collide on eventId / (deviceId,sequenceNo) dedupe keys.
RUN_TAG="${_E2E_RUN_ID}"
DEVICE_ID="e2e021-dev-${RUN_TAG}"

# ── Deterministic, monotonically-increasing recordedAt timestamps ─────────────
# Freshness is computed from the server receive time (now), not recordedAt, so
# past recordedAt values still classify "fresh" right after upload. Basing the
# newest event on the wall clock guarantees it out-ranks any prior run's events
# for the same driver in a persistent database.
NOW_EPOCH="$(date -u +%s)"
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z; }
T_OLD="$(iso $((NOW_EPOCH - 120)))"   # oldest backlog sample
T_MID="$(iso $((NOW_EPOCH - 60)))"    # middle backlog sample
T_NEW="$(iso "${NOW_EPOCH}")"          # newest sample -> becomes current location
T_LOWACC="$(iso $((NOW_EPOCH + 600)))" # strictly newer low-accuracy fix

# Event ids for the replay batch.
EVT_OLD="e2e021-${RUN_TAG}-old"
EVT_NEW="e2e021-${RUN_TAG}-new"
EVT_NEW_REPLAY="e2e021-${RUN_TAG}-new-replay"
EVT_MID="e2e021-${RUN_TAG}-mid"
EVT_LOWACC="e2e021-${RUN_TAG}-lowacc"
EVT_LATE_OOO="e2e021-${RUN_TAG}-late-ooo"
TASK_NEW="task-${RUN_TAG}-a"
TASK_LOWACC="task-${RUN_TAG}-b"

# ── Local assertion helpers (boolean-safe; snake_case wire format) ────────────
# jq's `//` operator treats `false` as empty, so json_get from helpers.sh cannot
# read boolean false fields. Read raw values directly instead.
jqr() { printf '%s' "$RESP_BODY" | jq -rc "$1" 2>/dev/null || true; }

assert_json() { # jq-path expected label
  local actual
  actual="$(jqr "$1")"
  if [[ "$actual" != "$2" ]]; then
    log_fail "${3}: expected '${2}', got '${actual:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  log_ok "${3} = ${actual}"
}

assert_nonempty_json() { # jq-path label
  local actual
  actual="$(jqr "$1")"
  if [[ -z "$actual" || "$actual" == "null" ]]; then
    log_fail "${2}: expected a value, got '${actual:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  log_ok "${2} = ${actual}"
}

# ack_field EVENT_ID FIELD — read a per-item ack field for a given eventId.
ack_field() {
  printf '%s' "$RESP_BODY" \
    | jq -rc --arg e "$1" ".data.items[]? | select(.event_id==\$e) | .$2" 2>/dev/null || true
}

assert_ack() { # eventId field expected
  local actual
  actual="$(ack_field "$1" "$2")"
  if [[ "$actual" != "$3" ]]; then
    log_fail "ack[${1}].${2}: expected '${3}', got '${actual:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  log_ok "ack[${1}].${2} = ${actual}"
}

expect_error_code() { # expected-code
  local actual
  actual="$(jqr '.error.code')"
  if [[ -z "$actual" || "$actual" == "null" ]]; then
    actual="$(jqr '.code')"
  fi
  if [[ "$actual" != "$1" ]]; then
    log_fail "Expected error code ${1}, got '${actual:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  log_ok "error.code = ${actual}"
}

# hb_item — emit one heartbeat envelope (camelCase, compact JSON) to stdout.
# args: eventId deviceId driverId vehicleId taskId sequenceNo recordedAt \
#       lat lng accuracyM workState appState transportMode networkType
# Pass "" for vehicleId/taskId to send null; pass -1 for accuracyM to send null.
hb_item() {
  jq -nc \
    --arg eventId "$1" --arg deviceId "$2" --arg driverId "$3" \
    --arg vehicleId "$4" --arg taskId "$5" --argjson sequenceNo "$6" \
    --arg recordedAt "$7" --argjson lat "$8" --argjson lng "$9" \
    --argjson accuracyM "${10}" --arg workState "${11}" --arg appState "${12}" \
    --arg transportMode "${13}" --arg networkType "${14}" \
    '{
      eventId: $eventId,
      deviceId: $deviceId,
      driverId: $driverId,
      vehicleId: (if $vehicleId == "" then null else $vehicleId end),
      taskId: (if $taskId == "" then null else $taskId end),
      sequenceNo: $sequenceNo,
      recordedAt: $recordedAt,
      lat: $lat,
      lng: $lng,
      accuracyM: (if $accuracyM == -1 then null else $accuracyM end),
      workState: $workState,
      appState: $appState,
      transportMode: $transportMode,
      networkType: $networkType
    }'
}

# ──────────────────────────────────────────────────────────────────────────────
log_surface "Driver tracking — baseline (no heartbeats yet)"

log_step "0.1 — GET /driver/tracking-status for a driver with no heartbeats"
http_call GET "/driver/tracking-status?driverId=${BASELINE_DRIVER_ID}"
assert_status "200"
assert_json '.data.location_freshness' "missing" "baseline locationFreshness"
assert_json '.data.current_location' "null" "baseline currentLocation"
save_evidence "$SCENARIO" "tracking" "baselineFreshness" "missing"

# ──────────────────────────────────────────────────────────────────────────────
log_surface "Heartbeat batch — offline backlog with duplicate + out-of-order"

# Single batch, intentionally NOT ordered by recordedAt, simulating a phone
# flushing an offline queue:
#   1. evt-old        seq 1  @ T_OLD  (oldest backlog sample)
#   2. evt-new        seq 3  @ T_NEW  (newest -> should become current location)
#   3. evt-new-replay seq 3  @ T_NEW  (same device+seq as evt-new -> duplicate)
#   4. evt-mid        seq 2  @ T_MID  (uploaded last, but out-of-order)
BATCH_FIXTURE="${TMP_DIR}/batch.json"
{
  hb_item "$EVT_OLD"        "$DEVICE_ID" "$DRIVER_ID" ""           ""          1 "$T_OLD" 24.1470 120.6730 30 "offline"   "background" "background" "offline"
  hb_item "$EVT_NEW"        "$DEVICE_ID" "$DRIVER_ID" "$VEHICLE_ID" "$TASK_NEW" 3 "$T_NEW" 24.1477 120.6736 8  "assigned"  "foreground" "foreground" "cellular"
  hb_item "$EVT_NEW_REPLAY" "$DEVICE_ID" "$DRIVER_ID" "$VEHICLE_ID" "$TASK_NEW" 3 "$T_NEW" 24.1477 120.6736 8  "assigned"  "foreground" "foreground" "cellular"
  hb_item "$EVT_MID"        "$DEVICE_ID" "$DRIVER_ID" ""           ""          2 "$T_MID" 24.1473 120.6733 12 "available" "background" "background" "wifi"
} | jq -sc '{items: .}' > "$BATCH_FIXTURE"

log_step "1.1 — POST /driver/location-heartbeats/batch (4 events)"
http_call POST "/driver/location-heartbeats/batch" "$BATCH_FIXTURE"
assert_status "201"
assert_json '.data.items | length' "4" "batch ack count"

log_step "1.2 — dedupe + out-of-order acks"
# Newest event is accepted and advances current location.
assert_ack "$EVT_NEW" "accepted" "true"
assert_ack "$EVT_NEW" "duplicate" "false"
assert_ack "$EVT_NEW" "current_location_updated" "true"
# Replay of (deviceId, sequenceNo) is accepted-but-deduped, no location change.
assert_ack "$EVT_NEW_REPLAY" "accepted" "true"
assert_ack "$EVT_NEW_REPLAY" "duplicate" "true"
assert_ack "$EVT_NEW_REPLAY" "current_location_updated" "false"
# Out-of-order backlog samples are accepted but never roll current backwards.
assert_ack "$EVT_OLD" "accepted" "true"
assert_ack "$EVT_OLD" "duplicate" "false"
assert_ack "$EVT_MID" "accepted" "true"
assert_ack "$EVT_MID" "duplicate" "false"
assert_ack "$EVT_MID" "current_location_updated" "false"
save_evidence "$SCENARIO" "heartbeat" "replayDeduped" "true"

# ──────────────────────────────────────────────────────────────────────────────
log_surface "Driver tracking — current location remains newest"

log_step "2.1 — GET /driver/tracking-status reflects the newest heartbeat"
http_call GET "/driver/tracking-status?driverId=${DRIVER_ID}"
assert_status "200"
assert_json '.data.driver_id' "$DRIVER_ID" "tracking driverId"
# Current location must be the newest recordedAt sample (evt-new @ T_NEW), NOT
# the out-of-order evt-mid that was uploaded after it.
assert_json '.data.current_location.recorded_at' "$T_NEW" "currentLocation.recordedAt (newest wins)"
assert_json '.data.current_location.accuracy_m' "8" "currentLocation.accuracyM"
assert_nonempty_json '.data.current_location.lat' "currentLocation.lat"
assert_nonempty_json '.data.current_location.lng' "currentLocation.lng"
assert_nonempty_json '.data.current_location.updated_at' "currentLocation.updatedAt"
# Context fields come from the event that set the current location.
assert_json '.data.current_vehicle_id' "$VEHICLE_ID" "currentVehicleId"
assert_json '.data.current_task_id' "$TASK_NEW" "currentTaskId"
assert_json '.data.tracking_state' "assigned" "trackingState"
assert_json '.data.app_state' "foreground" "appState"
assert_json '.data.transport_mode' "foreground" "transportMode"
assert_json '.data.network_type' "cellular" "networkType"
# Just-received location classifies as fresh.
assert_json '.data.location_freshness' "fresh" "locationFreshness"
# Last upload bookkeeping reflects the final event processed in the batch.
assert_json '.data.last_event_id' "$EVT_MID" "lastEventId (last processed)"
assert_json '.data.last_sequence_no' "2" "lastSequenceNo"
assert_json '.data.last_device_id' "$DEVICE_ID" "lastDeviceId"
assert_nonempty_json '.data.last_successful_upload_at' "lastSuccessfulUploadAt"
save_evidence "$SCENARIO" "tracking" "currentRecordedAt" "$T_NEW"
save_evidence "$SCENARIO" "tracking" "freshness" "fresh"
chain_set "tracking" "driverId" "$DRIVER_ID"

log_step "2.2 — GET /ops/drivers/{id}/tracking-status agrees with driver view"
http_call GET "/ops/drivers/${DRIVER_ID}/tracking-status"
assert_status "200"
assert_json '.data.driver_id' "$DRIVER_ID" "ops tracking driverId"
assert_json '.data.current_location.recorded_at' "$T_NEW" "ops currentLocation.recordedAt"
assert_json '.data.location_freshness' "fresh" "ops locationFreshness"
assert_json '.data.tracking_state' "assigned" "ops trackingState"
save_evidence "$SCENARIO" "tracking" "opsParity" "true"

# ──────────────────────────────────────────────────────────────────────────────
log_surface "Freshness reclassification — newer low-accuracy fix"

# A newer fix (T_LOWACC) with poor accuracy followed, in the same flush, by an
# even-later-arriving but out-of-order sample. The low-accuracy fix must take
# over the current location and reclassify freshness; the trailing out-of-order
# sample must not roll it back.
LOWACC_FIXTURE="${TMP_DIR}/lowacc.json"
{
  hb_item "$EVT_LOWACC"  "$DEVICE_ID" "$DRIVER_ID" "$VEHICLE_ID" "$TASK_LOWACC" 9  "$T_LOWACC" 24.2000 120.7000 250 "on_trip"  "foreground" "foreground" "cellular"
  hb_item "$EVT_LATE_OOO" "$DEVICE_ID" "$DRIVER_ID" ""           ""             10 "$T_OLD"    24.1460 120.6720 20  "available" "background" "background" "wifi"
} | jq -sc '{items: .}' > "$LOWACC_FIXTURE"

log_step "3.1 — POST low-accuracy fix + trailing out-of-order sample"
http_call POST "/driver/location-heartbeats/batch" "$LOWACC_FIXTURE"
assert_status "201"
assert_ack "$EVT_LOWACC" "duplicate" "false"
assert_ack "$EVT_LOWACC" "current_location_updated" "true"
assert_ack "$EVT_LATE_OOO" "duplicate" "false"
assert_ack "$EVT_LATE_OOO" "current_location_updated" "false"

log_step "3.2 — tracking status reclassified to low_accuracy, newest preserved"
http_call GET "/driver/tracking-status?driverId=${DRIVER_ID}"
assert_status "200"
assert_json '.data.current_location.recorded_at' "$T_LOWACC" "currentLocation.recordedAt (low-acc newest)"
assert_json '.data.current_location.accuracy_m' "250" "currentLocation.accuracyM (low-acc)"
assert_json '.data.location_freshness' "low_accuracy" "locationFreshness reclassified"
assert_json '.data.tracking_state' "on_trip" "trackingState updated"
assert_json '.data.current_task_id' "$TASK_LOWACC" "currentTaskId updated"
save_evidence "$SCENARIO" "tracking" "lowAccuracyFreshness" "low_accuracy"

# ──────────────────────────────────────────────────────────────────────────────
log_surface "Contract guards — negative paths"

log_step "4.1 — POST batch with no items -> FIELD_REQUIRED"
echo '{}' > "${TMP_DIR}/empty.json"
http_call POST "/driver/location-heartbeats/batch" "${TMP_DIR}/empty.json"
assert_status "400"
expect_error_code "FIELD_REQUIRED"

log_step "4.2 — GET tracking-status for unknown driver -> DRIVER_NOT_FOUND"
http_call GET "/driver/tracking-status?driverId=e2e021-missing-${RUN_TAG}"
assert_status "404"
expect_error_code "DRIVER_NOT_FOUND"

log_step "4.3 — POST oversize batch (101 items) -> BATCH_LIMIT_EXCEEDED"
OVERSIZE_FIXTURE="${TMP_DIR}/oversize.json"
jq -nc \
  --arg deviceId "$DEVICE_ID" --arg driverId "$DRIVER_ID" --arg recordedAt "$T_NEW" \
  '{items: [range(0;101) | {
      eventId: ("e2e021-bulk-\(.)"),
      deviceId: $deviceId,
      driverId: $driverId,
      vehicleId: null,
      taskId: null,
      sequenceNo: (5000 + .),
      recordedAt: $recordedAt,
      lat: 24.15,
      lng: 120.67,
      accuracyM: 10,
      workState: "available",
      appState: "foreground",
      transportMode: "foreground",
      networkType: "cellular"
    }]}' > "$OVERSIZE_FIXTURE"
http_call POST "/driver/location-heartbeats/batch" "$OVERSIZE_FIXTURE"
assert_status "400"
expect_error_code "BATCH_LIMIT_EXCEEDED"

# ──────────────────────────────────────────────────────────────────────────────
log_step "Chain continuity assertions"
assert_chain "tracking" "driverId"
print_chain_summary

echo ""
log_ok "E2E-021 complete — replayed heartbeats dedupe, the newest location survives out-of-order backlog, and tracking status (driver + ops) is correct."
echo -e "Evidence log: ${EVIDENCE_FILE}"
