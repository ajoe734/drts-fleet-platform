#!/usr/bin/env bash
# S3-VERIFY-001 — alert-to-Ops latency sampler.
#
# Measures the S-3 alert chain `fleetReportConfirmedAt -> opsAlertRenderedAt`
# and reports the observed distribution (p50 / p90 / p95 / max) over N samples.
#
# HONESTY BOUNDARY — read before citing any number this script prints:
#   This is a LOCAL HERMETIC sampler. It drives a locally built API against a
#   local Postgres and supplies `renderedAt` from the shell clock, standing in
#   for the Ops console paint callback. It therefore measures the API-side
#   timestamp chain and loopback transport only. It is NOT a production p95,
#   it carries no real Ops browser render time, no real network, no production
#   load, and it must never be reported as satisfying the production
#   `alert-to-Ops p95 <= 5s` acceptance criterion. That criterion stays
#   `blocked_ext` until production observability is available.
#
# Usage:
#   SAMPLES=30 ./support/sidecars/S3-VERIFY-001/measure-alert-latency.sh
#
# Requires an already-running API (see the sidecar evidence doc for the exact
# hermetic bring-up used).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# shellcheck source=../../../tests/e2e/lib/helpers.sh
source "${ROOT_DIR}/tests/e2e/lib/helpers.sh"

SAMPLES="${SAMPLES:-30}"
DRIVER_ACTOR_ID="${E2E_017_DRIVER_ID:-drv-demo-001}"
OPS_ACTOR_ID="${OPS_ACTOR_ID:-s3-verify-001-ops}"
TMP_DIR=$(mktemp -d /tmp/drts-s3-latency-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

SAMPLE_FILE="${TMP_DIR}/samples.txt"
: > "$SAMPLE_FILE"

echo "S3-VERIFY-001 alert-to-Ops latency sampler"
echo "API:      ${E2E_API_URL}"
echo "Samples:  ${SAMPLES}"
echo "Source:   LOCAL HERMETIC (not production observability)"
echo ""

for i in $(seq 1 "$SAMPLES"); do
  CLIENT_EVENT_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  E2E_ACTOR_TYPE="driver_user"; E2E_ACTOR_ID="$DRIVER_ACTOR_ID"; E2E_REALM=""
  E2E_TENANT_ID="$E2E_SEED_TENANT_ID"

  jq -n \
    --arg ts "$TS" \
    --arg client_event_id "$CLIENT_EVENT_ID" \
    --arg n "$i" \
    '{
       clientEventId: $client_event_id,
       vehicleId: ("veh-s3-latency-" + $n),
       plateNo: "ABC-1234",
       eventType: "security_incident",
       severity: "major",
       description: "S3-VERIFY-001 latency sample.",
       originalTriggeredAt: $ts,
       offlineAtTrigger: false,
       location: {
         lat: 25.0478,
         lng: 121.5319,
         accuracyM: 5,
         recordedAt: $ts,
         reverseGeocodedAddress: "Staging City",
         geocodeProvider: "manual"
       }
     }' > "${TMP_DIR}/sos.json"

  http_call POST "/driver/sos-events" "${TMP_DIR}/sos.json" >/dev/null 2>&1 || true
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    echo "sample ${i}: SOS submit failed status=${RESP_STATUS} body=${RESP_BODY}" >&2
    exit 1
  fi
  INCIDENT_ID=$(json_get_first ".data.receipt.incidentId" ".data.receipt.incident_id")

  E2E_ACTOR_TYPE="ops_user"; E2E_ACTOR_ID="$OPS_ACTOR_ID"; E2E_REALM=""
  RENDERED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  jq -n \
    --arg incident_id "$INCIDENT_ID" \
    --arg rendered_at "$RENDERED_AT" \
    '{ incidentIds: [$incident_id], renderedAt: $rendered_at }' \
    > "${TMP_DIR}/rendered.json"

  http_call POST "/ops/driver-sos/alerts/rendered" "${TMP_DIR}/rendered.json" >/dev/null 2>&1 || true
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    echo "sample ${i}: Ops render receipt failed status=${RESP_STATUS} body=${RESP_BODY}" >&2
    exit 1
  fi
  LATENCY_MS=$(json_get_first \
    ".data.observations[0].alertToOpsLatencyMs" \
    ".data.observations[0].alert_to_ops_latency_ms")

  if [[ ! "$LATENCY_MS" =~ ^[0-9]+$ ]]; then
    echo "sample ${i}: no computable latency (body=${RESP_BODY})" >&2
    exit 1
  fi
  echo "$LATENCY_MS" >> "$SAMPLE_FILE"
  printf 'sample %2d/%s  incident=%s  latency=%sms\n' "$i" "$SAMPLES" "$INCIDENT_ID" "$LATENCY_MS"
done

echo ""
python3 - "$SAMPLE_FILE" <<'PY'
import sys

with open(sys.argv[1]) as fh:
    values = sorted(int(line) for line in fh if line.strip())

def pct(sorted_values, p):
    rank = max(1, -(-len(sorted_values) * p // 100))
    return sorted_values[rank - 1]

print("n      =", len(values))
print("min    =", values[0], "ms")
print("p50    =", pct(values, 50), "ms")
print("p90    =", pct(values, 90), "ms")
print("p95    =", pct(values, 95), "ms")
print("max    =", values[-1], "ms")
print("")
print("SOURCE = local hermetic loopback; NOT a production p95 measurement.")
PY
