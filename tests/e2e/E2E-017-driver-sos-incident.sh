#!/usr/bin/env bash
# E2E-017 — Driver SOS event submission (driver realm, self-scoped)
#
# Verifies the dedicated driver-app safety path:
#   1. A driver (driver realm) CAN submit an SOS via POST /driver/sos-events.
#   2. The SOS is self-scoped: event.driverId is forced to the authenticated
#      driver even if the client sends someone else.
#   3. The correlated incident is returned in the submission receipt.
#   4. Missing attachment storage is explicit and does not fabricate an URL.
#   5. Ops records first-render timestamps and computable alert latency.
#   6. The driver realm is still BLOCKED from the incident list (GET /incidents).
#
# Regression guard for S3-BE-001 dedicated driver SOS backend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-017"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-017 — Driver SOS event submission (self-scoped)${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

DRIVER_ACTOR_ID="${E2E_017_DRIVER_ID:-drv-demo-001}"
TMP_DIR=$(mktemp -d /tmp/drts-e2e-017-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

log_surface "Driver App — raise an SOS / incident"
switch_actor "driver_user" "$DRIVER_ACTOR_ID" "$E2E_SEED_TENANT_ID"

log_step "1.1 — POST /driver/sos-events (driver realm) with a spoofed driverId"
jq -n \
  --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg client_event_id "11111111-1111-4111-8111-111111111111" \
  '{
     clientEventId: $client_event_id,
     driverId: "SPOOFED-NOT-ME",
     vehicleId: "veh-e2e-017",
     plateNo: "ABC-1234",
     orderId: "ord-e2e-017",
     taskId: "task-e2e-017",
     eventType: "security_incident",
     severity: "major",
     description: "Safety escalation raised by the driver app.",
     originalTriggeredAt: $ts,
     offlineAtTrigger: true,
     location: {
       lat: 25.0478,
       lng: 121.5319,
       accuracyM: 5,
       recordedAt: $ts,
       reverseGeocodedAddress: "Staging City",
       geocodeProvider: "manual"
     }
   }' > "${TMP_DIR}/incident.json"

http_call POST "/driver/sos-events" "${TMP_DIR}/incident.json"
assert_status "200|201"

INCIDENT_ID=$(json_get_first ".data.receipt.incidentId" ".data.receipt.incident_id")
SOS_EVENT_ID=$(json_get_first ".data.event.sosEventId" ".data.event.sos_event_id")
EVENT_NO=$(json_get_first ".data.event.eventNo" ".data.event.event_no")
EVENT_DRIVER_ID=$(json_get_first ".data.event.driverId" ".data.event.driver_id")
FLEET_CONFIRMED_AT=$(json_get_first \
  ".data.receipt.fleetReportConfirmedAt" \
  ".data.receipt.fleet_report_confirmed_at")

if [[ -z "$INCIDENT_ID" || -z "$SOS_EVENT_ID" || -z "$EVENT_NO" || -z "$FLEET_CONFIRMED_AT" ]]; then
  log_fail "Driver SOS submission did not return the expected receipt fields."
  exit 1
fi
save_evidence "$SCENARIO" "driver" "incidentId" "$INCIDENT_ID"
save_evidence "$SCENARIO" "driver" "sosEventId" "$SOS_EVENT_ID"
save_evidence "$SCENARIO" "driver" "eventNo" "$EVENT_NO"
save_evidence "$SCENARIO" "driver" "fleetReportConfirmedAt" "$FLEET_CONFIRMED_AT"

if [[ "$EVENT_DRIVER_ID" != "$DRIVER_ACTOR_ID" ]]; then
  log_fail "SOS event not self-scoped to the driver. driverId=${EVENT_DRIVER_ID} expected=${DRIVER_ACTOR_ID}"
  exit 1
fi
chain_set "driver" "incidentId" "$INCIDENT_ID"
log_ok "Driver SOS submitted ${SOS_EVENT_ID} / ${EVENT_NO}, self-scoped to ${DRIVER_ACTOR_ID}"

log_step "1.2 — POST attachment upload intent without a configured provider"
jq -n \
  '{
     attachmentType: "photo",
     originalFileName: "scene.jpg",
     contentType: "image/jpeg",
     fileSize: 1024
   }' > "${TMP_DIR}/upload-intent.json"

http_call POST \
  "/driver/sos-events/${SOS_EVENT_ID}/attachments/upload-intents" \
  "${TMP_DIR}/upload-intent.json"
assert_status "200|201"

UPLOAD_STATE=$(json_get_first ".data.state")
UPLOAD_REASON=$(json_get_first ".data.reasonCode" ".data.reason_code")
UPLOAD_URL=$(json_get_first ".data.uploadUrl" ".data.upload_url")
if [[ "$UPLOAD_STATE" != "unavailable" || "$UPLOAD_REASON" != "storage_provider_unavailable" || -n "$UPLOAD_URL" ]]; then
  log_fail "Expected explicit fail-closed storage unavailable response without uploadUrl."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "driver" "attachmentStorageState" "$UPLOAD_STATE"
log_ok "Attachment storage is explicitly unavailable; no upload URL was fabricated"

log_step "1.3 — GET /incidents (driver realm) must remain forbidden"
http_call GET "/incidents"
if [[ "${RESP_STATUS}" != "403" ]]; then
  log_fail "Driver realm should NOT list incidents; expected 403, got ${RESP_STATUS}"
  exit 1
fi
save_evidence "$SCENARIO" "driver" "listForbidden" "true"
log_ok "Driver realm correctly forbidden from the incident list (403)"

log_surface "Ops Console — record actual alert render receipt"
switch_actor "ops_user" "e2e-ops-017" "$E2E_SEED_TENANT_ID"

log_step "2.1 — POST /ops/driver-sos/alerts/rendered"
jq -n \
  --arg incident_id "$INCIDENT_ID" \
  --arg rendered_at "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")" \
  '{
     incidentIds: [$incident_id],
     renderedAt: $rendered_at
   }' > "${TMP_DIR}/rendered.json"

http_call POST "/ops/driver-sos/alerts/rendered" "${TMP_DIR}/rendered.json"
assert_status "200|201"

OPS_RENDERED_AT=$(json_get_first \
  ".data.observations[0].opsAlertRenderedAt" \
  ".data.observations[0].ops_alert_rendered_at")
OPS_RECEIPT_AT=$(json_get_first \
  ".data.observations[0].opsAlertReceiptRecordedAt" \
  ".data.observations[0].ops_alert_receipt_recorded_at")
ALERT_LATENCY_MS=$(json_get_first \
  ".data.observations[0].alertToOpsLatencyMs" \
  ".data.observations[0].alert_to_ops_latency_ms")

if [[ -z "$OPS_RENDERED_AT" || -z "$OPS_RECEIPT_AT" || ! "$ALERT_LATENCY_MS" =~ ^[0-9]+$ ]]; then
  log_fail "Ops render receipt did not return the required timestamp chain."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "ops" "opsAlertRenderedAt" "$OPS_RENDERED_AT"
save_evidence "$SCENARIO" "ops" "opsAlertReceiptRecordedAt" "$OPS_RECEIPT_AT"
save_evidence "$SCENARIO" "ops" "alertToOpsLatencyMs" "$ALERT_LATENCY_MS"
log_ok "Ops render timestamp chain recorded; local latency=${ALERT_LATENCY_MS}ms"

log_step "Chain continuity assertions"
assert_chain "driver" "incidentId"
print_chain_summary

echo ""
log_ok "E2E-017 complete — driver SOS submission is self-scoped and list stays restricted."
echo -e "Evidence log: ${EVIDENCE_FILE}"
