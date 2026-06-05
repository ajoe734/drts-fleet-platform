#!/usr/bin/env bash
# E2E-013 — Service product eligibility shell
#
# Surface chain:
#   Platform Admin → Tenant Portal → Ops Console
#
# Pass criteria (E2E-013):
#   1. Service-product admin endpoints are exercised when the environment exposes them.
#   2. Airport-transfer booking is created and produces an orderId for dispatch.
#   3. An ineligible vehicle is rejected during dispatch assignment.
#   4. An eligible airport/business vehicle + driver pair is accepted.
#   5. Eligible supply is visible either via the new service-product endpoint or the
#      dispatch candidates fallback used by the current repo implementation.
#
# Cross-ref: docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md §2.2,
#            §2.3, Required E2E flows → E2E-013.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-013"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-013 — Service product eligibility shell${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-013-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SERVICE_PRODUCT_TYPE="${E2E_SERVICE_PRODUCT_TYPE:-credit_card_airport_transfer}"
SERVICE_PRODUCT_DISPLAY_NAME="${E2E_SERVICE_PRODUCT_DISPLAY_NAME:-E2E Airport Transfer}"
SERVICE_PRODUCT_TIMING="${E2E_SERVICE_PRODUCT_TIMING:-reservation}"
SERVICE_PRODUCT_BILLING_MODE="${E2E_SERVICE_PRODUCT_BILLING_MODE:-partner_settlement}"
SERVICE_PRODUCT_ID=""
BOOKING_ID=""
ORDER_ID=""
DISPATCH_JOB_ID=""
ELIGIBLE_VEHICLE_ID=""
ELIGIBLE_DRIVER_ID=""
INELIGIBLE_VEHICLE_ID=""
ELIGIBLE_SUPPLY_MODE="dispatch_candidates"
REQUIRE_ADMIN_ENDPOINTS="${E2E_REQUIRE_SERVICE_PRODUCT_ADMIN:-false}"
REQUIRE_ELIGIBLE_SUPPLY_ENDPOINT="${E2E_REQUIRE_ELIGIBLE_SUPPLY_ENDPOINT:-false}"

error_code() {
  echo "$RESP_BODY" | jq -r '.error.code // .code // empty' 2>/dev/null || true
}

save_if_present() {
  local surface="$1" key="$2" value="$3"
  if [[ -n "$value" ]]; then
    chain_set "$surface" "$key" "$value"
    save_evidence "$SCENARIO" "$surface" "$key" "$value"
  fi
}

record_optional_probe() {
  local surface="$1" key="$2" status="$3"
  save_evidence "$SCENARIO" "$surface" "$key" "$status"
  log_info "${surface}.${key}=${status}"
}

fail_if_required() {
  local enabled="$1" message="$2"
  if [[ "$enabled" == "true" ]]; then
    log_fail "$message"
    exit 1
  fi
}

log_surface "Platform Admin — service product and eligibility setup"
switch_actor "platform_admin" "e2e-platform-admin-service-product-013"

log_step "1.1 — GET /admin/service-products"
http_call GET "/admin/service-products"
if [[ "$RESP_STATUS" =~ ^(200)$ ]]; then
  SERVICE_PRODUCT_ID=$(echo "$RESP_BODY" | jq -r --arg t "$SERVICE_PRODUCT_TYPE" \
    '.data.items[]? | select((.serviceProductType // .service_product_type) == $t) | (.serviceProductId // .service_product_id)' \
    2>/dev/null | head -1 || true)
  if [[ -n "$SERVICE_PRODUCT_ID" ]]; then
    save_if_present "admin" "serviceProductIdExisting" "$SERVICE_PRODUCT_ID"
    log_ok "Found existing service product: ${SERVICE_PRODUCT_ID}"
  else
    PRODUCT_FIXTURE="${TMP_DIR}/service-product.json"
    jq -n \
      --arg serviceProductType "$SERVICE_PRODUCT_TYPE" \
      --arg displayName "$SERVICE_PRODUCT_DISPLAY_NAME" \
      --arg timing "$SERVICE_PRODUCT_TIMING" \
      --arg billingMode "$SERVICE_PRODUCT_BILLING_MODE" \
      '{
        serviceProductType: $serviceProductType,
        displayName: $displayName,
        description: "E2E-013 service product",
        timing: $timing,
        active: true,
        defaultBillingMode: $billingMode,
        defaultProofRequirements: ["trip_photo"]
      }' > "$PRODUCT_FIXTURE"

    log_step "1.2 — POST /admin/service-products"
    http_call POST "/admin/service-products" "$PRODUCT_FIXTURE"
    if [[ "$RESP_STATUS" =~ ^(200|201)$ ]]; then
      SERVICE_PRODUCT_ID=$(json_get_first ".data.serviceProductId" ".data.service_product_id")
      save_if_present "admin" "serviceProductId" "$SERVICE_PRODUCT_ID"
      save_evidence "$SCENARIO" "admin" "serviceProductType" "$SERVICE_PRODUCT_TYPE"
      log_ok "Service product created: ${SERVICE_PRODUCT_ID:-<id_not_returned>}"
    else
      record_optional_probe "admin" "serviceProductCreateStatus" "$RESP_STATUS:$(error_code)"
      log_warn "Service product create not available or rejected on this env; continuing with existing product semantics."
    fi
  fi
else
  record_optional_probe "admin" "serviceProductListStatus" "$RESP_STATUS:$(error_code)"
  fail_if_required \
    "$REQUIRE_ADMIN_ENDPOINTS" \
    "Service-product admin endpoint unavailable but E2E_REQUIRE_SERVICE_PRODUCT_ADMIN=true."
  log_warn "Service product admin endpoint unavailable; continuing with dispatch-enforcement fallback."
fi

MATRIX_FIXTURE="${TMP_DIR}/vehicle-eligibility.json"
jq -n \
  --arg vehicleId "${E2E_ELIGIBLE_SERVICE_VEHICLE_ID:-veh-demo-001}" \
  --arg serviceProduct "$SERVICE_PRODUCT_TYPE" \
  '{
    items: [
      {
        vehicleId: $vehicleId,
        licenseType: "airport_transfer_vehicle",
        supportedProducts: [$serviceProduct],
        seatCount: 4,
        luggageCapacity: 4,
        airportPermit: true,
        businessDispatchEligible: true,
        taxiMeterRequired: false,
        fixedFareAllowed: true,
        platformForwardingAllowed: false,
        active: true,
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveUntil: null
      }
    ]
  }' > "$MATRIX_FIXTURE"

log_step "1.3 — PUT /admin/vehicle-eligibility-matrix"
http_call PUT "/admin/vehicle-eligibility-matrix" "$MATRIX_FIXTURE"
if [[ ! "$RESP_STATUS" =~ ^(200|201)$ ]]; then
  record_optional_probe "admin" "vehicleEligibilityMatrixStatus" "$RESP_STATUS:$(error_code)"
  fail_if_required \
    "$REQUIRE_ADMIN_ENDPOINTS" \
    "Vehicle eligibility matrix endpoint unavailable but E2E_REQUIRE_SERVICE_PRODUCT_ADMIN=true."
  log_warn "Vehicle eligibility matrix endpoint unavailable or shape-mismatched on this env; falling back to registry-backed dispatch checks."
else
  save_evidence "$SCENARIO" "admin" "vehicleEligibilityMatrixUpdated" "true"
  log_ok "Vehicle eligibility matrix accepted update payload"
fi

log_surface "Tenant Portal — airport-transfer booking"
switch_actor "tenant_admin" "e2e-tenant-admin-service-product-013" "$E2E_SEED_TENANT_ID"

WINDOW_START=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")

BOOKING_FIXTURE="${TMP_DIR}/booking-airport.json"
jq \
  --arg ws "$WINDOW_START" \
  --arg we "$WINDOW_END" \
  --arg direction "dropoff" \
  '.reservationWindowStart = $ws
   | .reservationWindowEnd = $we
   | .direction = $direction
   | del(.airportDirection)' \
  "${SCRIPT_DIR}/fixtures/e2e-booking-airport.json" > "$BOOKING_FIXTURE"

log_step "2.1 — POST /tenant/bookings"
http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"

BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
if [[ -z "$BOOKING_ID" ]]; then
  log_fail "Booking create response missing bookingId: ${RESP_BODY}"
  exit 1
fi
if [[ -z "$ORDER_ID" ]]; then
  log_fail "Booking create response missing orderId: ${RESP_BODY}"
  exit 1
fi

save_if_present "tenant" "bookingId" "$BOOKING_ID"
save_if_present "tenant" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "tenant" "serviceProductTypeExpected" "$SERVICE_PRODUCT_TYPE"
log_ok "Airport-transfer booking created: bookingId=${BOOKING_ID}, orderId=${ORDER_ID}"

log_step "2.2 — GET /tenant/bookings/:bookingId"
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"

BOOKING_SUBTYPE=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
if [[ "$BOOKING_SUBTYPE" != "$SERVICE_PRODUCT_TYPE" ]]; then
  log_fail "Booking subtype mismatch: expected ${SERVICE_PRODUCT_TYPE}, got '${BOOKING_SUBTYPE:-<empty>}'"
  exit 1
fi
save_evidence "$SCENARIO" "tenant" "bookingSubtype" "$BOOKING_SUBTYPE"
log_ok "Booking read-back preserved airport-transfer subtype"

log_surface "Ops Console — dispatch eligibility enforcement"
switch_actor "ops_user" "e2e-ops-service-product-013"

DISPATCH_FIXTURE="${TMP_DIR}/dispatch.json"
printf '%s\n' '{"mode":"auto"}' > "$DISPATCH_FIXTURE"

log_step "3.1 — POST /orders/:orderId/dispatch"
http_call POST "/orders/${ORDER_ID}/dispatch" "$DISPATCH_FIXTURE"
assert_status "200|201"
DISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
save_if_present "ops" "dispatchJobIdAfterTrigger" "$DISPATCH_JOB_ID"

log_step "3.2 — GET /dispatch/tasks (resolve dispatch job)"
ATTEMPT=0
while (( ATTEMPT < E2E_POLL_MAX )); do
  if [[ -n "$DISPATCH_JOB_ID" ]]; then
    break
  fi
  http_call GET "/dispatch/tasks"
  assert_status "200"
  DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[]? | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
    2>/dev/null | head -1 || true)
  [[ -n "$DISPATCH_JOB_ID" ]] && break
  log_info "  poll $((ATTEMPT + 1))/${E2E_POLL_MAX}: dispatch job for orderId=${ORDER_ID} not visible yet"
  sleep "$E2E_POLL_INTERVAL"
  ATTEMPT=$((ATTEMPT + 1))
done
if [[ -z "$DISPATCH_JOB_ID" ]]; then
  log_fail "No dispatch job found for orderId=${ORDER_ID}"
  exit 1
fi
save_if_present "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
log_ok "Dispatch job resolved: ${DISPATCH_JOB_ID}"

log_step "3.3 — GET /ops/dispatch/eligible-supply?serviceProduct=..."
http_call GET "/ops/dispatch/eligible-supply?serviceProduct=${SERVICE_PRODUCT_TYPE}"
if [[ "$RESP_STATUS" =~ ^(200)$ ]]; then
  ELIGIBLE_SUPPLY_COUNT=$(echo "$RESP_BODY" | jq -r '.data.items | length' 2>/dev/null || echo "0")
  save_evidence "$SCENARIO" "ops" "eligibleSupplyMode" "service_product_endpoint"
  save_evidence "$SCENARIO" "ops" "eligibleSupplyCount" "${ELIGIBLE_SUPPLY_COUNT}"
  ELIGIBLE_SUPPLY_MODE="service_product_endpoint"
  log_ok "eligible-supply endpoint returned ${ELIGIBLE_SUPPLY_COUNT} candidates"
else
  record_optional_probe "ops" "eligibleSupplyEndpointStatus" "$RESP_STATUS:$(error_code)"
  fail_if_required \
    "$REQUIRE_ELIGIBLE_SUPPLY_ENDPOINT" \
    "eligible-supply endpoint unavailable but E2E_REQUIRE_ELIGIBLE_SUPPLY_ENDPOINT=true."
  log_warn "eligible-supply endpoint unavailable; using dispatch candidates fallback."
fi

log_step "3.4 — GET /dispatch/tasks/:dispatchJobId/candidates"
http_call GET "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates"
assert_status "200"

ELIGIBLE_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
ELIGIBLE_DRIVER_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)
CANDIDATE_COUNT=$(json_get ".data.items | length")

if [[ -z "$ELIGIBLE_VEHICLE_ID" || -z "$ELIGIBLE_DRIVER_ID" ]]; then
  log_fail "No eligible dispatch candidate returned: ${RESP_BODY}"
  exit 1
fi

save_if_present "ops" "eligibleVehicleId" "$ELIGIBLE_VEHICLE_ID"
save_if_present "ops" "eligibleDriverId" "$ELIGIBLE_DRIVER_ID"
save_evidence "$SCENARIO" "ops" "dispatchCandidateCount" "${CANDIDATE_COUNT:-0}"
log_ok "Eligible candidate resolved: vehicleId=${ELIGIBLE_VEHICLE_ID}, driverId=${ELIGIBLE_DRIVER_ID}"

log_step "3.5 — GET /regulatory-registry/vehicles (find ineligible vehicle)"
http_call GET "/regulatory-registry/vehicles"
assert_status "200"
INELIGIBLE_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r --arg eligible "$ELIGIBLE_VEHICLE_ID" '
  .data.items[]
  | select(
      (.vehicleId // .vehicle_id) != $eligible and (
        ((.dispatchableFlag // .dispatchable_flag // false) | not) or
        (((.supplyLifecycle.dispatch.eligible // .supply_lifecycle.dispatch.eligible // false) | not)) or
        (((.supportedServiceBuckets // .supported_service_buckets // []) | index("business_dispatch")) | not)
      )
    )
  | (.vehicleId // .vehicle_id)' 2>/dev/null | head -1 || true)

if [[ -z "$INELIGIBLE_VEHICLE_ID" ]]; then
  log_fail "Could not resolve an ineligible vehicle from regulatory registry."
  exit 1
fi
save_if_present "ops" "ineligibleVehicleId" "$INELIGIBLE_VEHICLE_ID"
log_ok "Ineligible vehicle selected: ${INELIGIBLE_VEHICLE_ID}"

ASSIGN_BAD_FIXTURE="${TMP_DIR}/assign-bad.json"
jq \
  --arg jobId "$DISPATCH_JOB_ID" \
  --arg vehicle "$INELIGIBLE_VEHICLE_ID" \
  --arg driver "$ELIGIBLE_DRIVER_ID" \
  '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
  "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$ASSIGN_BAD_FIXTURE"

log_step "3.6 — POST /dispatch/assign (ineligible vehicle should be rejected)"
http_call POST "/dispatch/assign" "$ASSIGN_BAD_FIXTURE"
if [[ ! "$RESP_STATUS" =~ ^(400|409)$ ]]; then
  log_fail "Expected /dispatch/assign rejection for ineligible vehicle, got HTTP ${RESP_STATUS}: ${RESP_BODY}"
  exit 1
fi

BAD_ASSIGN_ERROR_CODE=$(error_code)
if [[ -z "$BAD_ASSIGN_ERROR_CODE" ]]; then
  log_warn "Ineligible assign rejection did not expose an error code."
else
  save_evidence "$SCENARIO" "ops" "ineligibleAssignErrorCode" "$BAD_ASSIGN_ERROR_CODE"
fi
log_ok "Ineligible vehicle rejected: HTTP ${RESP_STATUS}, code=${BAD_ASSIGN_ERROR_CODE:-<empty>}"

ASSIGN_GOOD_FIXTURE="${TMP_DIR}/assign-good.json"
jq \
  --arg jobId "$DISPATCH_JOB_ID" \
  --arg vehicle "$ELIGIBLE_VEHICLE_ID" \
  --arg driver "$ELIGIBLE_DRIVER_ID" \
  '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
  "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$ASSIGN_GOOD_FIXTURE"

log_step "3.7 — POST /dispatch/assign (eligible vehicle should be accepted)"
http_call POST "/dispatch/assign" "$ASSIGN_GOOD_FIXTURE"
assert_status "200|201"
TASK_ID=$(json_get_first ".data.taskId" ".data.task_id")
save_if_present "ops" "taskId" "$TASK_ID"
save_evidence "$SCENARIO" "ops" "eligibleSupplyModeFinal" "$ELIGIBLE_SUPPLY_MODE"
log_ok "Eligible vehicle assigned successfully: taskId=${TASK_ID:-<not_returned>}"

assert_chain "tenant" "bookingId"
assert_chain "tenant" "orderId"
assert_chain "ops" "dispatchJobId"
assert_chain "ops" "eligibleVehicleId"
assert_chain "ops" "eligibleDriverId"
assert_chain "ops" "ineligibleVehicleId"

print_chain_summary
log_ok "E2E-013 complete — service-product eligibility shell passed."
