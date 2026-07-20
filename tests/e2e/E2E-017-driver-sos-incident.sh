#!/usr/bin/env bash
# E2E-017 — Driver SOS event submission (driver realm, self-scoped)
#
# Verifies the dedicated driver-app safety path:
#   1. A driver (driver realm) CAN submit an SOS via POST /driver/sos-events.
#   2. The SOS is self-scoped: event.driverId is forced to the authenticated
#      driver even if the client sends someone else.
#   3. The correlated incident is returned in the submission receipt.
#   4. The driver realm is still BLOCKED from the incident list (GET /incidents).
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

if [[ -z "$INCIDENT_ID" || -z "$SOS_EVENT_ID" || -z "$EVENT_NO" ]]; then
  log_fail "Driver SOS submission did not return the expected receipt fields."
  exit 1
fi
save_evidence "$SCENARIO" "driver" "incidentId" "$INCIDENT_ID"
save_evidence "$SCENARIO" "driver" "sosEventId" "$SOS_EVENT_ID"
save_evidence "$SCENARIO" "driver" "eventNo" "$EVENT_NO"

if [[ "$EVENT_DRIVER_ID" != "$DRIVER_ACTOR_ID" ]]; then
  log_fail "SOS event not self-scoped to the driver. driverId=${EVENT_DRIVER_ID} expected=${DRIVER_ACTOR_ID}"
  exit 1
fi
chain_set "driver" "incidentId" "$INCIDENT_ID"
log_ok "Driver SOS submitted ${SOS_EVENT_ID} / ${EVENT_NO}, self-scoped to ${DRIVER_ACTOR_ID}"

log_step "1.2 — GET /incidents (driver realm) must remain forbidden"
http_call GET "/incidents"
if [[ "${RESP_STATUS}" != "403" ]]; then
  log_fail "Driver realm should NOT list incidents; expected 403, got ${RESP_STATUS}"
  exit 1
fi
save_evidence "$SCENARIO" "driver" "listForbidden" "true"
log_ok "Driver realm correctly forbidden from the incident list (403)"

log_step "Chain continuity assertions"
assert_chain "driver" "incidentId"
print_chain_summary

echo ""
log_ok "E2E-017 complete — driver SOS submission is self-scoped and list stays restricted."
echo -e "Evidence log: ${EVIDENCE_FILE}"
