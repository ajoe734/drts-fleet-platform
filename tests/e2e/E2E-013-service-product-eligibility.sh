#!/usr/bin/env bash
# E2E-013 — Service product eligibility
#
# Surface chain:
#   Platform Admin -> Tenant Booking -> Ops Dispatch
#
# Pass criteria (E2E-013):
#   1. Service product registry contains an active credit_card_airport_transfer product.
#   2. Vehicle eligibility matrix is configured so taxi is ineligible and multi_purpose_taxi is eligible.
#   3. Airport-transfer booking is created and read back with the expected subtype.
#   4. Dispatch rejects the ineligible taxi with a service-product eligibility error.
#   5. Dispatch candidates and positive assignment use the eligible airport-capable supply.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-013"
PRODUCT_TYPE="credit_card_airport_transfer"
PRODUCT_DISPLAY_NAME="E2E Airport Transfer"
POSITIVE_VEHICLE_ID="${E2E_ELIGIBLE_AIRPORT_VEHICLE_ID:-veh-demo-001}"
POSITIVE_DRIVER_ID="${E2E_ELIGIBLE_AIRPORT_DRIVER_ID:-drv-demo-001}"
NEGATIVE_VEHICLE_ID="${E2E_INELIGIBLE_TAXI_VEHICLE_ID:-veh-demo-002}"

ORIGINAL_MATRIX_FILE=""
MATRIX_RESTORE_NEEDED=false
BOOKING_FIXTURE=""
DISPATCH_FIXTURE=""
NEGATIVE_ASSIGN_FIXTURE=""
POSITIVE_ASSIGN_FIXTURE=""
PRODUCT_FIXTURE=""
MATRIX_FIXTURE=""

cleanup() {
  rm -f \
    "${BOOKING_FIXTURE:-}" \
    "${DISPATCH_FIXTURE:-}" \
    "${NEGATIVE_ASSIGN_FIXTURE:-}" \
    "${POSITIVE_ASSIGN_FIXTURE:-}" \
    "${PRODUCT_FIXTURE:-}" \
    "${MATRIX_FIXTURE:-}"

  if [[ "${MATRIX_RESTORE_NEEDED}" != "true" || -z "${ORIGINAL_MATRIX_FILE}" ]]; then
    rm -f "${ORIGINAL_MATRIX_FILE:-}"
    return 0
  fi

  log_warn "Cleanup: restoring original vehicle eligibility matrix."
  switch_actor "platform_admin" "e2e-platform-admin-001"
  http_call PUT "/admin/vehicle-eligibility-matrix" "$ORIGINAL_MATRIX_FILE"
  if [[ "${RESP_STATUS:-}" =~ ^(200|201)$ ]]; then
    log_ok "Cleanup restored vehicle eligibility matrix."
  else
    log_warn "Cleanup could not restore vehicle eligibility matrix. HTTP ${RESP_STATUS:-unknown}"
    log_warn "Body: ${RESP_BODY:-<empty>}"
  fi

  rm -f "${ORIGINAL_MATRIX_FILE}"
}
trap cleanup EXIT

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-013 — Service product eligibility${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Platform Admin: ensure airport-transfer service product exists
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — service product registry"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "1.1 — GET /admin/service-products"
http_call GET "/admin/service-products"
assert_status "200"

SERVICE_PRODUCT_ID=$(echo "$RESP_BODY" | jq -r --arg type "$PRODUCT_TYPE" \
  '.data.items[] | select((.serviceProductType // .service_product_type) == $type) | (.serviceProductId // .service_product_id)' \
  2>/dev/null | head -1 || true)

if [[ -z "$SERVICE_PRODUCT_ID" ]]; then
  PRODUCT_FIXTURE=$(mktemp /tmp/drts-e2e-013-product-XXXXXX.json)
  jq -n \
    --arg productType "$PRODUCT_TYPE" \
    --arg displayName "$PRODUCT_DISPLAY_NAME" \
    '{
      serviceProductType: $productType,
      displayName: $displayName,
      timing: "reservation",
      active: true,
      defaultBillingMode: "fixed_fare",
      defaultProofRequirements: ["photo", "signoff"]
    }' > "$PRODUCT_FIXTURE"

  log_step "1.2 — POST /admin/service-products"
  http_call POST "/admin/service-products" "$PRODUCT_FIXTURE"
  assert_status "200|201"

  log_step "1.3 — GET /admin/service-products (resolve created product)"
  http_call GET "/admin/service-products"
  assert_status "200"
  SERVICE_PRODUCT_ID=$(echo "$RESP_BODY" | jq -r --arg type "$PRODUCT_TYPE" \
    '.data.items[] | select((.serviceProductType // .service_product_type) == $type) | (.serviceProductId // .service_product_id)' \
    2>/dev/null | head -1 || true)
fi

if [[ -z "$SERVICE_PRODUCT_ID" ]]; then
  log_fail "Could not resolve service product ID for ${PRODUCT_TYPE}"
  exit 1
fi

chain_set "platform_admin" "serviceProductId" "$SERVICE_PRODUCT_ID"
save_evidence "$SCENARIO" "platform_admin" "serviceProductId" "$SERVICE_PRODUCT_ID"
log_ok "Airport-transfer service product ready: ${SERVICE_PRODUCT_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Platform Admin: configure vehicle eligibility matrix
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — vehicle eligibility matrix"

log_step "2.1 — GET /admin/vehicle-eligibility-matrix"
http_call GET "/admin/vehicle-eligibility-matrix"
assert_status "200"

ORIGINAL_MATRIX_FILE=$(mktemp /tmp/drts-e2e-013-original-matrix-XXXXXX.json)
echo "$RESP_BODY" | jq '{items: (.data.items // [])}' > "$ORIGINAL_MATRIX_FILE"

MATRIX_FIXTURE=$(mktemp /tmp/drts-e2e-013-matrix-XXXXXX.json)
jq \
  --arg now "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '
  {
    items: (
      ((.data.items // [])
        | map(select(.licenseType != "taxi" and .licenseType != "multi_purpose_taxi")))
      + [
        {
          capabilityId: "e2e-013-taxi",
          licenseType: "taxi",
          supportedProducts: ["taxi_realtime", "third_party_forwarded_order"],
          seatCount: 4,
          luggageCapacity: 2,
          airportPermit: false,
          businessDispatchEligible: false,
          taxiMeterRequired: true,
          fixedFareAllowed: false,
          platformForwardingAllowed: true,
          active: true,
          effectiveFrom: $now,
          effectiveUntil: null,
          createdAt: $now,
          updatedAt: $now
        },
        {
          capabilityId: "e2e-013-mpt-airport",
          licenseType: "multi_purpose_taxi",
          supportedProducts: [
            "taxi_realtime",
            "enterprise_dispatch",
            "credit_card_airport_transfer",
            "third_party_forwarded_order"
          ],
          seatCount: 6,
          luggageCapacity: 4,
          airportPermit: true,
          businessDispatchEligible: true,
          taxiMeterRequired: true,
          fixedFareAllowed: true,
          platformForwardingAllowed: true,
          active: true,
          effectiveFrom: $now,
          effectiveUntil: null,
          createdAt: $now,
          updatedAt: $now
        }
      ]
    )
  }' <<<"$RESP_BODY" > "$MATRIX_FIXTURE"

log_step "2.2 — PUT /admin/vehicle-eligibility-matrix"
http_call PUT "/admin/vehicle-eligibility-matrix" "$MATRIX_FIXTURE"
assert_status "200|201"
MATRIX_RESTORE_NEEDED=true

log_step "2.3 — GET /admin/vehicle-eligibility-matrix (verify overrides)"
http_call GET "/admin/vehicle-eligibility-matrix"
assert_status "200"

TAXI_SUPPORTS_AIRPORT=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | select(.licenseType == "taxi") | (.supportedProducts | index("credit_card_airport_transfer"))' \
  2>/dev/null | head -1 || true)
MPT_SUPPORTS_AIRPORT=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | select(.licenseType == "multi_purpose_taxi") | (.supportedProducts | index("credit_card_airport_transfer"))' \
  2>/dev/null | head -1 || true)
MPT_AIRPORT_PERMIT=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | select(.licenseType == "multi_purpose_taxi") | (.airportPermit // false)' \
  2>/dev/null | head -1 || true)

if [[ "$TAXI_SUPPORTS_AIRPORT" != "null" && -n "$TAXI_SUPPORTS_AIRPORT" ]]; then
  log_fail "Taxi matrix entry still supports credit_card_airport_transfer"
  exit 1
fi
if [[ "$MPT_SUPPORTS_AIRPORT" == "null" || -z "$MPT_SUPPORTS_AIRPORT" ]]; then
  log_fail "multi_purpose_taxi matrix entry does not support credit_card_airport_transfer"
  exit 1
fi
if [[ "$MPT_AIRPORT_PERMIT" != "true" ]]; then
  log_fail "multi_purpose_taxi matrix entry is missing airportPermit=true"
  exit 1
fi

save_evidence "$SCENARIO" "platform_admin" "matrixConfigured" "taxi_rejected_multi_purpose_taxi_accepted"
log_ok "Eligibility matrix configured for airport-transfer scenario"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Tenant: create airport-transfer booking
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Tenant Portal — airport-transfer booking"

switch_actor "tenant_admin" "e2e-tenant-admin-001" "${E2E_SEED_TENANT_ID}"

WINDOW_START=$(date -u -d "+4 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+4H +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+5 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+5H +"%Y-%m-%dT%H:%M:%SZ")

BOOKING_FIXTURE=$(mktemp /tmp/drts-e2e-013-booking-XXXXXX.json)
jq \
  --arg ws "$WINDOW_START" \
  --arg we "$WINDOW_END" \
  '.reservationWindowStart = $ws
   | .reservationWindowEnd = $we
   | .bookedBy.email = "e2e-service-product-eligibility@example.com"' \
  "${SCRIPT_DIR}/fixtures/e2e-booking-airport.json" > "$BOOKING_FIXTURE"

log_step "3.1 — POST /tenant/bookings"
http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"

BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
if [[ -z "$BOOKING_ID" ]]; then
  log_fail "No bookingId in response: ${RESP_BODY}"
  exit 1
fi

chain_set "tenant" "bookingId" "$BOOKING_ID"
save_evidence "$SCENARIO" "tenant" "bookingId" "$BOOKING_ID"

log_step "3.2 — GET /tenant/bookings/:bookingId"
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"

ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
BOOKING_SUBTYPE=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
if [[ -z "$ORDER_ID" ]]; then
  log_fail "Booking read-back missing orderId: ${RESP_BODY}"
  exit 1
fi
if [[ "$BOOKING_SUBTYPE" != "$PRODUCT_TYPE" ]]; then
  log_fail "Expected booking subtype ${PRODUCT_TYPE}, got '${BOOKING_SUBTYPE:-<empty>}'"
  exit 1
fi

chain_set "tenant" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "tenant" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "tenant" "businessDispatchSubtype" "$BOOKING_SUBTYPE"
log_ok "Airport-transfer booking created: bookingId=${BOOKING_ID}, orderId=${ORDER_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Ops: dispatch candidates, negative assignment, positive assignment
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — dispatch eligibility enforcement"

switch_actor "ops_user" "e2e-ops-001"

DISPATCH_FIXTURE=$(mktemp /tmp/drts-e2e-013-dispatch-XXXXXX.json)
printf '%s\n' '{"mode":"auto"}' > "$DISPATCH_FIXTURE"

log_step "4.1 — POST /orders/:orderId/dispatch"
http_call POST "/orders/${ORDER_ID}/dispatch" "$DISPATCH_FIXTURE"
assert_status "200|201"

DISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
ATTEMPT=0
while (( ATTEMPT < E2E_POLL_MAX )) && [[ -z "$DISPATCH_JOB_ID" ]]; do
  http_call GET "/dispatch/tasks"
  assert_status "200"
  DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
    2>/dev/null | head -1 || true)
  [[ -n "$DISPATCH_JOB_ID" ]] && break
  log_info "  poll $((ATTEMPT + 1))/${E2E_POLL_MAX}: dispatch job not visible yet"
  sleep "$E2E_POLL_INTERVAL"
  ATTEMPT=$((ATTEMPT + 1))
done

if [[ -z "$DISPATCH_JOB_ID" ]]; then
  log_fail "No dispatch job found for order ${ORDER_ID}"
  exit 1
fi

chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "ops" "dispatchJobId" "$DISPATCH_JOB_ID"

log_step "4.2 — GET /dispatch/tasks/:dispatchJobId/candidates"
http_call GET "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates"
assert_status "200"

CANDIDATE_IDS=$(echo "$RESP_BODY" | jq -r '.data.items[]?.vehicleId // .data.items[]?.vehicle_id' 2>/dev/null || true)
if ! echo "$CANDIDATE_IDS" | grep -qx "$POSITIVE_VEHICLE_ID"; then
  log_fail "Expected eligible candidate vehicle ${POSITIVE_VEHICLE_ID}, got: ${CANDIDATE_IDS:-<none>}"
  exit 1
fi
if echo "$CANDIDATE_IDS" | grep -qx "$NEGATIVE_VEHICLE_ID"; then
  log_fail "Ineligible taxi ${NEGATIVE_VEHICLE_ID} unexpectedly appeared in dispatch candidates"
  exit 1
fi

save_evidence "$SCENARIO" "ops" "eligibleVehicleId" "$POSITIVE_VEHICLE_ID"
log_ok "Dispatch candidates only include eligible airport-capable supply"

NEGATIVE_ASSIGN_FIXTURE=$(mktemp /tmp/drts-e2e-013-assign-neg-XXXXXX.json)
jq -n \
  --arg jobId "$DISPATCH_JOB_ID" \
  --arg vehicleId "$NEGATIVE_VEHICLE_ID" \
  --arg driverId "$POSITIVE_DRIVER_ID" \
  '{
    dispatchJobId: $jobId,
    vehicleId: $vehicleId,
    driverId: $driverId
  }' > "$NEGATIVE_ASSIGN_FIXTURE"

log_step "4.3 — POST /dispatch/assign (expect ineligible taxi rejection)"
http_call POST "/dispatch/assign" "$NEGATIVE_ASSIGN_FIXTURE"
if [[ "${RESP_STATUS}" != "400" ]]; then
  log_fail "Expected HTTP 400 for ineligible taxi assignment, got ${RESP_STATUS}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

NEGATIVE_CODE=$(echo "$RESP_BODY" | jq -r '.error.code // empty' 2>/dev/null || true)
if [[ "$NEGATIVE_CODE" != "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT" ]]; then
  log_fail "Expected VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT, got '${NEGATIVE_CODE:-<empty>}'"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

save_evidence "$SCENARIO" "ops" "ineligibleTaxiCode" "$NEGATIVE_CODE"
log_ok "Ineligible taxi rejected with ${NEGATIVE_CODE}"

POSITIVE_ASSIGN_FIXTURE=$(mktemp /tmp/drts-e2e-013-assign-pos-XXXXXX.json)
jq -n \
  --arg jobId "$DISPATCH_JOB_ID" \
  --arg vehicleId "$POSITIVE_VEHICLE_ID" \
  --arg driverId "$POSITIVE_DRIVER_ID" \
  '{
    dispatchJobId: $jobId,
    vehicleId: $vehicleId,
    driverId: $driverId
  }' > "$POSITIVE_ASSIGN_FIXTURE"

log_step "4.4 — POST /dispatch/assign (eligible vehicle)"
http_call POST "/dispatch/assign" "$POSITIVE_ASSIGN_FIXTURE"
assert_status "200|201"

TASK_ID=$(json_get_first ".data.taskId" ".data.task_id")
if [[ -z "$TASK_ID" ]]; then
  log_fail "Positive dispatch assignment missing taskId: ${RESP_BODY}"
  exit 1
fi

chain_set "ops" "taskId" "$TASK_ID"
chain_set "ops" "vehicleId" "$POSITIVE_VEHICLE_ID"
chain_set "ops" "driverId" "$POSITIVE_DRIVER_ID"
save_evidence "$SCENARIO" "ops" "taskId" "$TASK_ID"
log_ok "Eligible airport-capable vehicle assigned: taskId=${TASK_ID}"

print_chain_summary
log_ok "E2E-013 completed."
