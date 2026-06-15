#!/usr/bin/env bash
# E2E-017 — Driver SOS / incident creation (driver realm, self-scoped)
#
# Verifies the driver-app safety path:
#   1. A driver (driver realm) CAN create an incident/SOS via POST /incidents.
#   2. The incident is self-scoped: reportedBy / relatedDriverId are forced to the
#      authenticated driver even if the client sends someone else.
#   3. The driver realm is still BLOCKED from the incident list (GET /incidents)
#      — only creation is opened to drivers.
#
# Regression guard for DRV-APP-QA finding R10 (driver SOS returned 403).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-017"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-017 — Driver SOS / incident creation (self-scoped)${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

DRIVER_ACTOR_ID="${E2E_017_DRIVER_ID:-drv-demo-001}"
TMP_DIR=$(mktemp -d /tmp/drts-e2e-017-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

log_surface "Driver App — raise an SOS / incident"
switch_actor "driver_user" "$DRIVER_ACTOR_ID" "$E2E_SEED_TENANT_ID"

log_step "1.1 — POST /incidents (driver realm) with a spoofed reporter"
jq -n \
  --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
     title: "E2E-017 driver SOS",
     description: "Safety escalation raised by the driver app.",
     category: "safety",
     severity: "high",
     reportedBy: "SPOOFED-NOT-ME",
     relatedDriverId: "SPOOFED-NOT-ME",
     occurredAt: $ts,
     location: "Staging City"
   }' > "${TMP_DIR}/incident.json"

http_call POST "/incidents" "${TMP_DIR}/incident.json"
assert_status "200|201"

INCIDENT_ID=$(json_get_first ".data.incidentId" ".data.incident_id")
REPORTED_BY=$(json_get_first ".data.reportedBy" ".data.reported_by")
RELATED_DRIVER=$(json_get_first ".data.relatedDriverId" ".data.related_driver_id")

if [[ -z "$INCIDENT_ID" ]]; then
  log_fail "Driver incident creation did not return an incidentId."
  exit 1
fi
save_evidence "$SCENARIO" "driver" "incidentId" "$INCIDENT_ID"
save_evidence "$SCENARIO" "driver" "reportedBy" "${REPORTED_BY:-unknown}"

if [[ "$REPORTED_BY" != "$DRIVER_ACTOR_ID" || "$RELATED_DRIVER" != "$DRIVER_ACTOR_ID" ]]; then
  log_fail "Incident not self-scoped to the driver. reportedBy=${REPORTED_BY} relatedDriverId=${RELATED_DRIVER} expected=${DRIVER_ACTOR_ID}"
  exit 1
fi
chain_set "driver" "incidentId" "$INCIDENT_ID"
log_ok "Driver SOS created ${INCIDENT_ID}, self-scoped to ${DRIVER_ACTOR_ID}"

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
log_ok "E2E-017 complete — driver SOS creation is self-scoped and list stays restricted."
echo -e "Evidence log: ${EVIDENCE_FILE}"
