#!/usr/bin/env bash
# E2E-015 - Partner program variants
#
# Surface chain:
#   Platform Admin (partner entry create)
#   -> Partner Ingress (public entry + reference eligibility)
#   -> Tenant Booking Authority (partner-linked booking read-back)
#   -> Ops Console (dispatch + assign)
#   -> Driver App (complete)
#   -> Tenant Billing (invoice metadata propagation)
#
# Pass criteria:
#   1. Insurance replacement-vehicle and travel-agency entries preserve their
#      own partner/program/subtype metadata.
#   2. Reference-required eligibility rejects missing referenceToken.
#   3. Pending / missing / expired / cancelled reference decisions cannot be
#      used to create bookings.
#   4. Eligible verification detail preserves entry, partner, program, subtype,
#      benefitReference, and issuerAuthorizationRef.
#   5. Tenant booking read-back preserves the same partner/program/subtype
#      chain for each non-card program.
#   6. A booking posted with the wrong subtype is rejected instead of silently
#      becoming credit_card_airport_transfer.
#   7. Dispatch, driver completion, and tenant invoice lines preserve the same
#      non-card partner/program/subtype metadata.
#
# Boundary:
#   This is not proof of an independent insurance or travel-agency admin console.
#   Those remain separate product/runtime decisions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-015"
chain_init

TMP_DIR="$(mktemp -d /tmp/drts-e2e-015-XXXXXX)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-015 - Partner program variants${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

SUFFIX="$(date +%s)-$$"
CODE_SUFFIX="${SUFFIX//-/_}"

expect_error_code() {
  local expected="$1"
  local actual
  actual=$(json_get_first ".error.code" ".code" ".data.code")
  if [[ "$actual" != "$expected" ]]; then
    log_fail "Expected error code ${expected}, got '${actual:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

assert_equal() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "${label} mismatch: expected ${expected}, got '${actual:-<empty>}'"
    exit 1
  fi
}

assert_non_empty() {
  local label="$1"
  local actual="$2"
  if [[ -z "$actual" ]]; then
    log_fail "${label} is empty"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

write_entry_fixture() {
  local file="$1"
  local partner_code="$2"
  local partner_type="$3"
  local program_id="$4"
  local program_code="$5"
  local entry_slug="$6"
  local display_name="$7"
  local subtype="$8"
  local entry_host="$9"
  local entry_path="${10}"
  local theme_accent="${11}"

  jq -n \
    --arg tenantId "$E2E_SEED_TENANT_ID" \
    --arg partnerCode "$partner_code" \
    --arg partnerType "$partner_type" \
    --arg programId "$program_id" \
    --arg programCode "$program_code" \
    --arg entrySlug "$entry_slug" \
    --arg displayName "$display_name" \
    --arg subtype "$subtype" \
    --arg entryHost "$entry_host" \
    --arg entryPath "$entry_path" \
    --arg themeAccent "$theme_accent" \
    '{
      tenantId: $tenantId,
      partnerCode: $partnerCode,
      partnerType: $partnerType,
      programId: $programId,
      programCode: $programCode,
      entrySlug: $entrySlug,
      displayName: $displayName,
      businessDispatchSubtype: $subtype,
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      entryHost: $entryHost,
      entryPath: $entryPath,
      themeAccent: $themeAccent,
      brandingMetadata: {
        supportEmail: "ops@example.test",
        supportPhone: "+886900000015"
      },
      status: "active",
      activeFlag: true
    }' > "$file"
}

write_eligibility_fixture() {
  local file="$1"
  local entry_slug="$2"
  local reference_token="$3"
  local benefit_reference="$4"

  jq -n \
    --arg entrySlug "$entry_slug" \
    --arg referenceToken "$reference_token" \
    --arg benefitReference "$benefit_reference" \
    '{
      entrySlug: $entrySlug,
      referenceToken: $referenceToken,
      benefitReference: $benefitReference
    }' > "$file"
}

write_missing_reference_fixture() {
  local file="$1"
  local entry_slug="$2"

  jq -n \
    --arg entrySlug "$entry_slug" \
    '{ entrySlug: $entrySlug }' > "$file"
}

write_service_product_fixture() {
  local file="$1"
  local subtype="$2"
  local display_name="$3"

  jq -n \
    --arg subtype "$subtype" \
    --arg displayName "$display_name" \
    '{
      serviceProductType: $subtype,
      displayName: $displayName,
      timing: "reservation",
      active: true,
      defaultBillingMode: "partner_settlement",
      defaultProofRequirements: ["photo", "signoff"]
    }' > "$file"
}

write_service_area_fixture() {
  local file="$1"
  local subtype="$2"
  local area_code="$3"
  local display_name="$4"

  jq -n \
    --arg subtype "$subtype" \
    --arg areaCode "$area_code" \
    --arg displayName "$display_name" \
    '{
      areaCode: $areaCode,
      displayName: ($displayName + " E2E service area"),
      geometry: {
        type: "polygon",
        coordinates: [
          { lat: 25.0005, lng: 121.4505 },
          { lat: 25.0005, lng: 121.625 },
          { lat: 25.125, lng: 121.625 },
          { lat: 25.125, lng: 121.4505 }
        ]
      },
      serviceProductTypes: [$subtype],
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      metadata: {
        source: "E2E-015",
        purpose: "partner program spatial authority"
      }
    }' > "$file"
}

write_publish_service_area_fixture() {
  local file="$1"
  local kind="$2"

  jq -n \
    --arg reason "E2E-015 ${kind} partner program spatial authority" \
    '{
      reason: $reason,
      effectiveFrom: "2026-01-01T00:00:00.000Z"
    }' > "$file"
}

write_booking_fixture() {
  local file="$1"
  local subtype="$2"
  local entry_slug="$3"
  local eligibility_id="$4"
  local benefit_reference="$5"
  local pickup="$6"
  local dropoff="$7"
  local passenger_name="$8"
  local notes="$9"

  local window_start window_end
  window_start=$(date -u -d "+3 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+3H +"%Y-%m-%dT%H:%M:%SZ")
  window_end=$(date -u -d "+5 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+5H +"%Y-%m-%dT%H:%M:%SZ")

  jq -n \
    --arg subtype "$subtype" \
    --arg entrySlug "$entry_slug" \
    --arg eligibilityId "$eligibility_id" \
    --arg benefitReference "$benefit_reference" \
    --arg pickup "$pickup" \
    --arg dropoff "$dropoff" \
    --arg windowStart "$window_start" \
    --arg windowEnd "$window_end" \
    --arg passengerName "$passenger_name" \
    --arg notes "$notes" \
    '{
      businessDispatchSubtype: $subtype,
      partnerEntrySlug: $entrySlug,
      eligibilityVerificationId: $eligibilityId,
      benefitReference: $benefitReference,
      pickup: {
        address: $pickup,
        lat: 25.041,
        lng: 121.55,
        placeId: ("e2e-015-" + $subtype + "-" + $entrySlug + "-pickup"),
        geocodeProvider: "drts_mock_map",
        geocodeConfidence: "exact",
        coordinateSource: "provider_candidate",
        coordinateAccuracyM: 12,
        providerCandidateId: ("mock-e2e-015-" + $subtype + "-" + $entrySlug + "-pickup")
      },
      dropoff: {
        address: $dropoff,
        lat: 25.06,
        lng: 121.58,
        placeId: ("e2e-015-" + $subtype + "-" + $entrySlug + "-dropoff"),
        geocodeProvider: "drts_mock_map",
        geocodeConfidence: "exact",
        coordinateSource: "provider_candidate",
        coordinateAccuracyM: 14,
        providerCandidateId: ("mock-e2e-015-" + $subtype + "-" + $entrySlug + "-dropoff")
      },
      reservationWindowStart: $windowStart,
      reservationWindowEnd: $windowEnd,
      passenger: {
        name: $passengerName,
        phone: "+886900000015"
      },
      bookedBy: {
        name: "E2E Partner Program Operator",
        email: "partner-programs@example.test"
      },
      notes: $notes
    }' > "$file"
}

assert_invoice_line_field() {
  local kind="$1"
  local order_id="$2"
  local field_expr="$3"
  local label="$4"
  local expected="$5"

  local actual
  actual=$(echo "$RESP_BODY" | jq -r --arg oid "$order_id" "$field_expr" 2>/dev/null | head -1 || true)
  assert_equal "${kind} invoice line ${label}" "$expected" "$actual"
  save_evidence "$SCENARIO" "$kind" "invoice.${label}" "$actual"
}

run_downstream_chain() {
  local kind="$1"
  local subtype="$2"
  local booking_id="$3"
  local order_id="$4"
  local entry_slug="$5"
  local partner_id="$6"
  local program_id="$7"
  local eligibility_id="$8"
  local benefit_reference="$9"
  local issuer_ref="${10}"

  local dispatch_fixture="${TMP_DIR}/${kind}-dispatch.json"
  local assign_fixture="${TMP_DIR}/${kind}-assign.json"
  local accept_fixture="${TMP_DIR}/${kind}-accept.json"
  local depart_fixture="${TMP_DIR}/${kind}-depart.json"
  local arrive_fixture="${TMP_DIR}/${kind}-arrive.json"
  local start_fixture="${TMP_DIR}/${kind}-start.json"
  local complete_fixture="${TMP_DIR}/${kind}-complete.json"
  local invoice_fixture="${TMP_DIR}/${kind}-invoice.json"

  log_surface "${kind} partner program - dispatch, driver, invoice"

  switch_actor "ops_user" "e2e-ops-015"
  printf '%s\n' '{"mode":"auto"}' > "$dispatch_fixture"

  log_step "${kind}.9 - POST /orders/:orderId/dispatch"
  http_call POST "/orders/${order_id}/dispatch" "$dispatch_fixture"
  assert_status "200|201"

  local dispatch_job_id
  dispatch_job_id=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")

  local attempt=0
  while [[ -z "$dispatch_job_id" && "$attempt" -lt "$E2E_POLL_MAX" ]]; do
    http_call GET "/dispatch/tasks"
    assert_status "200"
    dispatch_job_id=$(echo "$RESP_BODY" | jq -r --arg oid "$order_id" \
      '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
      2>/dev/null | head -1 || true)
    if [[ -n "$dispatch_job_id" ]]; then
      break
    fi
    log_info "  poll $((attempt + 1))/${E2E_POLL_MAX}: dispatch job for ${kind} orderId=${order_id} not visible yet"
    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  assert_non_empty "${kind} dispatchJobId" "$dispatch_job_id"
  chain_set "$kind" "dispatchJobId" "$dispatch_job_id"
  save_evidence "$SCENARIO" "$kind" "dispatchJobId" "$dispatch_job_id"

  log_step "${kind}.10 - GET /dispatch/tasks/:dispatchJobId/candidates"
  http_call GET "/dispatch/tasks/${dispatch_job_id}/candidates"
  assert_status "200"

  local assign_vehicle_id assign_driver_id
  assign_vehicle_id=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
  assign_driver_id=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)
  assert_non_empty "${kind} eligible dispatch candidate vehicleId" "$assign_vehicle_id"
  assert_non_empty "${kind} eligible dispatch candidate driverId" "$assign_driver_id"

  jq \
    --arg jobId "$dispatch_job_id" \
    --arg vehicle "$assign_vehicle_id" \
    --arg driver "$assign_driver_id" \
    '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
    "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$assign_fixture"

  log_step "${kind}.11 - POST /dispatch/assign"
  http_call POST "/dispatch/assign" "$assign_fixture"
  assert_status "200|201"

  local task_id
  task_id=$(json_get_first ".data.taskId" ".data.task_id")
  if [[ -z "$task_id" ]]; then
    http_call GET "/driver/tasks"
    task_id=$(echo "$RESP_BODY" | jq -r --arg oid "$order_id" \
      '.data.items[] | select((.orderId // .order_id) == $oid) | (.taskId // .task_id)' \
      2>/dev/null | head -1 || true)
  fi

  assert_non_empty "${kind} taskId" "$task_id"
  chain_set "$kind" "taskId" "$task_id"
  save_evidence "$SCENARIO" "$kind" "taskId" "$task_id"
  save_evidence "$SCENARIO" "$kind" "driverId" "$assign_driver_id"
  save_evidence "$SCENARIO" "$kind" "vehicleId" "$assign_vehicle_id"

  switch_actor "driver_user" "e2e-driver-${assign_driver_id}" "$E2E_SEED_TENANT_ID"
  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.acceptedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" > "$accept_fixture"
  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.departedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-depart.json" > "$depart_fixture"
  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.arrivedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-arrived-pickup.json" > "$arrive_fixture"
  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.startedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-start.json" > "$start_fixture"
  local completed_at
  completed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  jq --arg ts "$completed_at" '.completedAt = $ts | .signoff.signedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" > "$complete_fixture"

  log_step "${kind}.12 - driver lifecycle to completed"
  http_call POST "/driver/tasks/${task_id}/accept" "$accept_fixture"
  assert_status "200|201"
  http_call POST "/driver/tasks/${task_id}/depart" "$depart_fixture"
  assert_status "200|201"
  http_call POST "/driver/tasks/${task_id}/arrived_pickup" "$arrive_fixture"
  assert_status "200|201"
  http_call POST "/driver/tasks/${task_id}/start" "$start_fixture"
  assert_status "200|201"
  http_call POST "/driver/tasks/${task_id}/complete" "$complete_fixture"
  assert_status "200|201"
  save_evidence "$SCENARIO" "$kind" "completedAt" "$completed_at"
  log_ok "${kind} driver task completed"

  switch_actor "tenant_admin" "e2e-tenant-admin-partner-programs" "$E2E_SEED_TENANT_ID"
  log_step "${kind}.13 - GET /tenant/bookings/:bookingId after completion"
  http_call GET "/tenant/bookings/${booking_id}"
  assert_status "200"

  local final_status final_subtype final_entry final_eligibility
  final_status=$(json_get ".data.status")
  final_subtype=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
  final_entry=$(json_get_first ".data.partnerEntrySlug" ".data.partner_entry_slug")
  final_eligibility=$(json_get_first ".data.eligibilityVerificationId" ".data.eligibility_verification_id")
  assert_equal "${kind} final booking status" "completed" "$final_status"
  assert_equal "${kind} final booking subtype" "$subtype" "$final_subtype"
  assert_equal "${kind} final booking entrySlug" "$entry_slug" "$final_entry"
  assert_equal "${kind} final booking eligibilityVerificationId" "$eligibility_id" "$final_eligibility"
  save_evidence "$SCENARIO" "$kind" "bookingStatusFinal" "$final_status"

  sleep 2
  local period_start period_end
  period_start=$(date -u +"%Y-%m-%dT00:00:00Z")
  period_end=$(date -u -d "-1 second" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v-1S +"%Y-%m-%dT%H:%M:%SZ")

  jq -n \
    --arg tenantId "$E2E_SEED_TENANT_ID" \
    --arg periodStart "$period_start" \
    --arg periodEnd "$period_end" \
    '{ tenantId: $tenantId, periodStart: $periodStart, periodEnd: $periodEnd }' > "$invoice_fixture"

  log_step "${kind}.14 - POST /tenant/invoices/generate"
  http_call POST "/tenant/invoices/generate" "$invoice_fixture"
  assert_status "200|201"

  local invoice_id
  invoice_id=$(json_get_first ".data.invoiceId" ".data.invoice_id")
  assert_non_empty "${kind} invoiceId" "$invoice_id"
  chain_set "$kind" "invoiceId" "$invoice_id"
  save_evidence "$SCENARIO" "$kind" "invoiceId" "$invoice_id"

  log_step "${kind}.15 - GET /tenant/invoices/:invoiceId"
  http_call GET "/tenant/invoices/${invoice_id}"
  assert_status "200"

  local line_count
  line_count=$(echo "$RESP_BODY" | jq -r --arg oid "$order_id" \
    '[.data.lines[] | select((.orderId // .order_id) == $oid)] | length' \
    2>/dev/null || echo "0")
  assert_equal "${kind} invoice current-order line count" "1" "$line_count"
  save_evidence "$SCENARIO" "$kind" "invoiceLineCountForOrderId" "$line_count"

  local line_selector
  line_selector='.data.lines[] | select((.orderId // .order_id) == $oid) | '
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.channelKey // .channel_key)" "channelKey" "partner_airport"
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.businessDispatchSubtype // .business_dispatch_subtype // .serviceProduct // .service_product)" "businessDispatchSubtype" "$subtype"
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.partnerEntrySlug // .partner_entry_slug)" "partnerEntrySlug" "$entry_slug"
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.partnerId // .partner_id)" "partnerId" "$partner_id"
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.partnerProgramId // .partner_program_id // .programId // .program_id)" "partnerProgramId" "$program_id"
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.eligibilityVerificationId // .eligibility_verification_id)" "eligibilityVerificationId" "$eligibility_id"
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.benefitReference // .benefit_reference)" "benefitReference" "$benefit_reference"
  assert_invoice_line_field "$kind" "$order_id" "${line_selector}(.issuerAuthorizationRef // .issuer_authorization_ref)" "issuerAuthorizationRef" "$issuer_ref"
  log_ok "${kind} invoice line preserves non-card partner program metadata"
}

ensure_service_product_active() {
  local kind="$1"
  local subtype="$2"
  local display_name="$3"
  local service_product_fixture="${TMP_DIR}/${kind}-service-product.json"
  local service_product_update_fixture="${TMP_DIR}/${kind}-service-product-update.json"

  log_step "${kind}.0 - ensure active service product ${subtype}"
  http_call GET "/admin/service-products"
  assert_status "200"

  local service_product_id service_product_active
  service_product_id=$(echo "$RESP_BODY" | jq -r --arg type "$subtype" \
    '.data.items[] | select((.serviceProductType // .service_product_type) == $type) | (.serviceProductId // .service_product_id)' \
    2>/dev/null | head -1 || true)
  service_product_active=$(echo "$RESP_BODY" | jq -r --arg type "$subtype" \
    '.data.items[] | select((.serviceProductType // .service_product_type) == $type) | (.active // false)' \
    2>/dev/null | head -1 || true)

  if [[ "$service_product_active" == "true" ]]; then
    assert_non_empty "${kind} serviceProductId" "$service_product_id"
    save_evidence "$SCENARIO" "$kind" "serviceProductId" "$service_product_id"
    log_ok "${kind} service product already active: ${service_product_id}"
    return 0
  fi

  if [[ -n "$service_product_id" && "$service_product_id" != seed-* ]]; then
    printf '%s\n' '{"active":true,"timing":"reservation"}' > "$service_product_update_fixture"
    http_call PUT "/admin/service-products/${service_product_id}" "$service_product_update_fixture"
    assert_status "200|201"
  else
    write_service_product_fixture "$service_product_fixture" "$subtype" "$display_name"
    http_call POST "/admin/service-products" "$service_product_fixture"
    assert_status "200|201"
  fi

  http_call GET "/admin/service-products"
  assert_status "200"
  service_product_id=$(echo "$RESP_BODY" | jq -r --arg type "$subtype" \
    '.data.items[] | select((.serviceProductType // .service_product_type) == $type) | (.serviceProductId // .service_product_id)' \
    2>/dev/null | head -1 || true)
  service_product_active=$(echo "$RESP_BODY" | jq -r --arg type "$subtype" \
    '.data.items[] | select((.serviceProductType // .service_product_type) == $type) | (.active // false)' \
    2>/dev/null | head -1 || true)

  assert_non_empty "${kind} serviceProductId" "$service_product_id"
  assert_equal "${kind} service product active" "true" "$service_product_active"
  save_evidence "$SCENARIO" "$kind" "serviceProductId" "$service_product_id"
  save_evidence "$SCENARIO" "$kind" "serviceProductActive" "$service_product_active"
  log_ok "${kind} service product active for booking guard: ${service_product_id}"
}

ensure_partner_service_area_active() {
  local kind="$1"
  local subtype="$2"
  local area_code="$3"
  local display_name="$4"
  local service_area_fixture="${TMP_DIR}/${kind}-service-area.json"
  local service_area_publish_fixture="${TMP_DIR}/${kind}-service-area-publish.json"

  log_step "${kind}.0b - ensure active service area ${area_code} for ${subtype}"
  http_call GET "/service-area/definitions"
  assert_status "200"

  local service_area_id
  service_area_id=$(echo "$RESP_BODY" | jq -r \
    --arg areaCode "$area_code" \
    --arg subtype "$subtype" \
    '.data.serviceAreas[]?
     | select((.areaCode // .area_code) == $areaCode)
     | select((.status // "") == "active")
     | select((.serviceProductTypes // .service_product_types // []) | index($subtype))
     | (.serviceAreaId // .service_area_id)' \
    2>/dev/null | head -1 || true)

  if [[ -n "$service_area_id" ]]; then
    save_evidence "$SCENARIO" "$kind" "serviceAreaId" "$service_area_id"
    save_evidence "$SCENARIO" "$kind" "serviceAreaCode" "$area_code"
    log_ok "${kind} service area already active: ${service_area_id}"
    return 0
  fi

  write_service_area_fixture \
    "$service_area_fixture" \
    "$subtype" \
    "$area_code" \
    "$display_name"

  http_call POST "/service-area/admin/service-areas" "$service_area_fixture"
  assert_status "200|201"

  service_area_id=$(json_get_first ".data.serviceArea.serviceAreaId" ".data.service_area.service_area_id")
  assert_non_empty "${kind} serviceAreaId" "$service_area_id"

  write_publish_service_area_fixture "$service_area_publish_fixture" "$kind"
  http_call POST "/service-area/admin/service-areas/${service_area_id}/publish" "$service_area_publish_fixture"
  assert_status "200|201"

  save_evidence "$SCENARIO" "$kind" "serviceAreaId" "$service_area_id"
  save_evidence "$SCENARIO" "$kind" "serviceAreaCode" "$area_code"
  save_evidence "$SCENARIO" "$kind" "serviceAreaProduct" "$subtype"
  log_ok "${kind} service area published for ${subtype}: ${service_area_id}"
}

assert_reference_token_blocks_booking() {
  local kind="$1"
  local subtype="$2"
  local entry_slug="$3"
  local entry_partner_id="$4"
  local program_id="$5"
  local reference_token="$6"
  local expected_status="$7"
  local expected_reason="$8"
  local benefit_reference="$9"
  local pickup="${10}"
  local dropoff="${11}"
  local passenger_name="${12}"

  local denied_key="${expected_reason,,}"
  denied_key="${denied_key//_/-}"
  local denied_eligibility_fixture="${TMP_DIR}/${kind}-${denied_key}-eligibility.json"
  local denied_booking_fixture="${TMP_DIR}/${kind}-${denied_key}-booking.json"

  write_eligibility_fixture \
    "$denied_eligibility_fixture" \
    "$entry_slug" \
    "$reference_token" \
    "$benefit_reference"

  log_step "${kind}.negative.${denied_key} - POST /partner/eligibility/verify"
  http_call POST "/partner/eligibility/verify" "$denied_eligibility_fixture"
  assert_status "200|201"

  local denied_id denied_status denied_reason denied_benefit
  denied_id=$(json_get_first ".data.eligibilityVerificationId" ".data.eligibility_verification_id")
  denied_status=$(json_get_first ".data.verificationStatus" ".data.verification_status")
  denied_reason=$(json_get_first ".data.verificationReasonCode" ".data.verification_reason_code")
  denied_benefit=$(json_get_first ".data.benefitReference" ".data.benefit_reference")

  assert_non_empty "${kind} ${denied_key} eligibilityVerificationId" "$denied_id"
  assert_equal "${kind} ${denied_key} verificationStatus" "$expected_status" "$denied_status"
  assert_equal "${kind} ${denied_key} verificationReasonCode" "$expected_reason" "$denied_reason"
  assert_equal "${kind} ${denied_key} benefitReference" "$benefit_reference" "$denied_benefit"
  save_evidence "$SCENARIO" "$kind" "${denied_key}Status" "$denied_status"
  save_evidence "$SCENARIO" "$kind" "${denied_key}Reason" "$denied_reason"

  switch_actor "tenant_admin" "e2e-tenant-admin-partner-programs" "$E2E_SEED_TENANT_ID"
  write_booking_fixture \
    "$denied_booking_fixture" \
    "$subtype" \
    "$entry_slug" \
    "$denied_id" \
    "$benefit_reference" \
    "$pickup" \
    "$dropoff" \
    "$passenger_name" \
    "negative reference-token decision ${expected_reason} for ${kind}"

  log_step "${kind}.negative.${denied_key} - POST /tenant/bookings must reject"
  http_call POST "/tenant/bookings" "$denied_booking_fixture"
  assert_status "409"
  expect_error_code "ELIGIBILITY_NOT_APPROVED"
  save_evidence "$SCENARIO" "$kind" "${denied_key}BookingCode" "ELIGIBILITY_NOT_APPROVED"
  log_ok "${kind} ${expected_reason} verification cannot create a booking"

  switch_actor "partner_api_key" "e2e-partner-${entry_slug}" "$E2E_SEED_TENANT_ID"
  set_partner_context "$entry_partner_id" "$program_id" "$entry_slug"
}

run_variant_case() {
  local kind="$1"
  local subtype="$2"
  local partner_code="$3"
  local partner_type="$4"
  local program_id="$5"
  local program_code="$6"
  local entry_slug="$7"
  local display_name="$8"
  local entry_host="$9"
  local entry_path="${10}"
  local theme_accent="${11}"
  local reference_token="${12}"
  local benefit_reference="${13}"
  local pickup="${14}"
  local dropoff="${15}"
  local passenger_name="${16}"
  local notes="${17}"

  local entry_fixture="${TMP_DIR}/${kind}-entry.json"
  local eligibility_fixture="${TMP_DIR}/${kind}-eligibility.json"
  local missing_ref_fixture="${TMP_DIR}/${kind}-missing-ref.json"
  local booking_fixture="${TMP_DIR}/${kind}-booking.json"
  local wrong_subtype_fixture="${TMP_DIR}/${kind}-wrong-subtype-booking.json"
  local service_area_code="E2E_${kind^^}_${CODE_SUFFIX}"

  log_surface "${kind} partner program - entry, eligibility, booking"

  switch_actor "platform_admin" "e2e-platform-admin-015"
  ensure_service_product_active "$kind" "$subtype" "$display_name"
  ensure_partner_service_area_active \
    "$kind" \
    "$subtype" \
    "$service_area_code" \
    "$display_name"
  write_entry_fixture \
    "$entry_fixture" \
    "$partner_code" \
    "$partner_type" \
    "$program_id" \
    "$program_code" \
    "$entry_slug" \
    "$display_name" \
    "$subtype" \
    "$entry_host" \
    "$entry_path" \
    "$theme_accent"

  log_step "${kind}.1 - POST /platform-admin/partner-entries"
  http_call POST "/platform-admin/partner-entries" "$entry_fixture"
  assert_status "200|201"

  local entry_partner_id created_entry_slug created_tenant_id created_program_id created_subtype created_mode created_host
  created_entry_slug=$(json_get_first ".data.entrySlug" ".data.entry_slug")
  created_tenant_id=$(json_get_first ".data.tenantId" ".data.tenant_id")
  entry_partner_id=$(json_get_first ".data.partnerId" ".data.partner_id")
  created_program_id=$(json_get_first ".data.programId" ".data.program_id")
  created_subtype=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
  created_mode=$(json_get_first ".data.eligibilityMode" ".data.eligibility_mode")
  created_host=$(json_get_first ".data.entryHost" ".data.entry_host")

  assert_equal "${kind} entrySlug" "$entry_slug" "$created_entry_slug"
  assert_equal "${kind} tenantId" "$E2E_SEED_TENANT_ID" "$created_tenant_id"
  assert_non_empty "${kind} partnerId" "$entry_partner_id"
  assert_equal "${kind} programId" "$program_id" "$created_program_id"
  assert_equal "${kind} subtype" "$subtype" "$created_subtype"
  assert_equal "${kind} eligibilityMode" "reference_required" "$created_mode"
  assert_equal "${kind} entryHost" "$entry_host" "$created_host"

  chain_set "$kind" "entrySlug" "$entry_slug"
  chain_set "$kind" "partnerId" "$entry_partner_id"
  chain_set "$kind" "partnerProgramId" "$created_program_id"
  save_evidence "$SCENARIO" "$kind" "entrySlug" "$entry_slug"
  save_evidence "$SCENARIO" "$kind" "partnerId" "$entry_partner_id"
  save_evidence "$SCENARIO" "$kind" "partnerProgramId" "$created_program_id"
  save_evidence "$SCENARIO" "$kind" "businessDispatchSubtype" "$created_subtype"
  log_ok "${kind} platform-admin entry preserves subtype ${created_subtype}"

  log_step "${kind}.2 - GET /partner/entries/:entrySlug"
  http_call GET "/partner/entries/${entry_slug}"
  assert_status "200"

  local public_partner_id public_program_id public_subtype public_mode public_host
  public_partner_id=$(json_get_first ".data.partnerId" ".data.partner_id")
  public_program_id=$(json_get_first ".data.programId" ".data.program_id")
  public_subtype=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
  public_mode=$(json_get_first ".data.eligibilityMode" ".data.eligibility_mode")
  public_host=$(json_get_first ".data.entryHost" ".data.entry_host")

  assert_equal "${kind} public partnerId" "$entry_partner_id" "$public_partner_id"
  assert_equal "${kind} public programId" "$program_id" "$public_program_id"
  assert_equal "${kind} public subtype" "$subtype" "$public_subtype"
  assert_equal "${kind} public eligibilityMode" "reference_required" "$public_mode"
  assert_equal "${kind} public entryHost" "$entry_host" "$public_host"
  log_ok "${kind} public entry read-back matches platform-admin entry"

  switch_actor "partner_api_key" "e2e-partner-${entry_slug}" "$E2E_SEED_TENANT_ID"
  set_partner_context "$entry_partner_id" "$program_id" "$entry_slug"

  write_missing_reference_fixture "$missing_ref_fixture" "$entry_slug"
  log_step "${kind}.3 - POST /partner/eligibility/verify without referenceToken"
  http_call POST "/partner/eligibility/verify" "$missing_ref_fixture"
  assert_status "400"
  expect_error_code "REFERENCE_TOKEN_REQUIRED"
  save_evidence "$SCENARIO" "$kind" "missingReferenceCode" "REFERENCE_TOKEN_REQUIRED"
  log_ok "${kind} reference-required eligibility blocks missing referenceToken"

  assert_reference_token_blocks_booking \
    "$kind" \
    "$subtype" \
    "$entry_slug" \
    "$entry_partner_id" \
    "$program_id" \
    "${kind}-pending-${SUFFIX}" \
    "manual_review" \
    "REFERENCE_PENDING_REVIEW" \
    "${benefit_reference}-pending" \
    "$pickup" \
    "$dropoff" \
    "$passenger_name"

  assert_reference_token_blocks_booking \
    "$kind" \
    "$subtype" \
    "$entry_slug" \
    "$entry_partner_id" \
    "$program_id" \
    "${kind}-missing-${SUFFIX}" \
    "ineligible" \
    "REFERENCE_NOT_FOUND" \
    "${benefit_reference}-missing" \
    "$pickup" \
    "$dropoff" \
    "$passenger_name"

  assert_reference_token_blocks_booking \
    "$kind" \
    "$subtype" \
    "$entry_slug" \
    "$entry_partner_id" \
    "$program_id" \
    "${kind}-expired-${SUFFIX}" \
    "ineligible" \
    "REFERENCE_EXPIRED" \
    "${benefit_reference}-expired" \
    "$pickup" \
    "$dropoff" \
    "$passenger_name"

  assert_reference_token_blocks_booking \
    "$kind" \
    "$subtype" \
    "$entry_slug" \
    "$entry_partner_id" \
    "$program_id" \
    "${kind}-cancelled-${SUFFIX}" \
    "ineligible" \
    "REFERENCE_CANCELLED" \
    "${benefit_reference}-cancelled" \
    "$pickup" \
    "$dropoff" \
    "$passenger_name"

  write_eligibility_fixture \
    "$eligibility_fixture" \
    "$entry_slug" \
    "$reference_token" \
    "$benefit_reference"

  log_step "${kind}.4 - POST /partner/eligibility/verify"
  http_call POST "/partner/eligibility/verify" "$eligibility_fixture"
  assert_status "200|201"

  local eligibility_id eligibility_status verified_benefit verified_subtype verified_partner_id verified_program_id issuer_ref
  eligibility_id=$(json_get_first ".data.eligibilityVerificationId" ".data.eligibility_verification_id")
  eligibility_status=$(json_get_first ".data.verificationStatus" ".data.verification_status")
  verified_benefit=$(json_get_first ".data.benefitReference" ".data.benefit_reference")
  verified_subtype=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
  verified_partner_id=$(json_get_first ".data.partnerId" ".data.partner_id")
  verified_program_id=$(json_get_first ".data.partnerProgramId" ".data.partner_program_id" ".data.programId" ".data.program_id")
  issuer_ref=$(json_get_first ".data.issuerAuthorizationRef" ".data.issuer_authorization_ref")

  assert_non_empty "${kind} eligibilityVerificationId" "$eligibility_id"
  assert_equal "${kind} verificationStatus" "eligible" "$eligibility_status"
  assert_equal "${kind} benefitReference" "$benefit_reference" "$verified_benefit"
  assert_equal "${kind} verification subtype" "$subtype" "$verified_subtype"
  assert_equal "${kind} verification partnerId" "$entry_partner_id" "$verified_partner_id"
  assert_equal "${kind} verification programId" "$program_id" "$verified_program_id"
  assert_non_empty "${kind} issuerAuthorizationRef" "$issuer_ref"

  chain_set "$kind" "eligibilityVerificationId" "$eligibility_id"
  chain_set "$kind" "benefitReference" "$verified_benefit"
  save_evidence "$SCENARIO" "$kind" "eligibilityVerificationId" "$eligibility_id"
  save_evidence "$SCENARIO" "$kind" "benefitReference" "$verified_benefit"
  save_evidence "$SCENARIO" "$kind" "issuerAuthorizationRef" "$issuer_ref"
  log_ok "${kind} eligibility verification preserves partner/program/subtype"

  log_step "${kind}.5 - GET /partner/eligibility/:eligibilityVerificationId"
  http_call GET "/partner/eligibility/${eligibility_id}"
  assert_status "200"

  local detail_entry detail_partner_id detail_program_id detail_subtype detail_status detail_benefit detail_issuer
  detail_entry=$(json_get_first ".data.partnerEntrySlug" ".data.partner_entry_slug")
  detail_partner_id=$(json_get_first ".data.partnerId" ".data.partner_id")
  detail_program_id=$(json_get_first ".data.partnerProgramId" ".data.partner_program_id" ".data.programId" ".data.program_id")
  detail_subtype=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
  detail_status=$(json_get_first ".data.verificationStatus" ".data.verification_status")
  detail_benefit=$(json_get_first ".data.benefitReference" ".data.benefit_reference")
  detail_issuer=$(json_get_first ".data.issuerAuthorizationRef" ".data.issuer_authorization_ref")

  assert_equal "${kind} eligibility detail entrySlug" "$entry_slug" "$detail_entry"
  assert_equal "${kind} eligibility detail partnerId" "$entry_partner_id" "$detail_partner_id"
  assert_equal "${kind} eligibility detail programId" "$program_id" "$detail_program_id"
  assert_equal "${kind} eligibility detail subtype" "$subtype" "$detail_subtype"
  assert_equal "${kind} eligibility detail status" "eligible" "$detail_status"
  assert_equal "${kind} eligibility detail benefitReference" "$benefit_reference" "$detail_benefit"
  assert_equal "${kind} eligibility detail issuerAuthorizationRef" "$issuer_ref" "$detail_issuer"
  log_ok "${kind} eligibility detail read-back is stable"

  switch_actor "tenant_admin" "e2e-tenant-admin-partner-programs" "$E2E_SEED_TENANT_ID"

  write_booking_fixture \
    "$wrong_subtype_fixture" \
    "credit_card_airport_transfer" \
    "$entry_slug" \
    "$eligibility_id" \
    "$benefit_reference" \
    "$pickup" \
    "$dropoff" \
    "$passenger_name" \
    "negative wrong-subtype probe for ${kind}"

  log_step "${kind}.6 - POST /tenant/bookings with wrong subtype"
  http_call POST "/tenant/bookings" "$wrong_subtype_fixture"
  assert_status "400"
  expect_error_code "PARTNER_ENTRY_SUBTYPE_MISMATCH"
  save_evidence "$SCENARIO" "$kind" "wrongSubtypeCode" "PARTNER_ENTRY_SUBTYPE_MISMATCH"
  log_ok "${kind} wrong-subtype booking is rejected"

  write_booking_fixture \
    "$booking_fixture" \
    "$subtype" \
    "$entry_slug" \
    "$eligibility_id" \
    "$benefit_reference" \
    "$pickup" \
    "$dropoff" \
    "$passenger_name" \
    "$notes"

  log_step "${kind}.7 - POST /tenant/bookings"
  http_call POST "/tenant/bookings" "$booking_fixture"
  assert_status "200|201"

  local booking_id
  booking_id=$(json_get_first ".data.bookingId" ".data.booking_id")
  assert_non_empty "${kind} bookingId" "$booking_id"
  chain_set "$kind" "bookingId" "$booking_id"
  save_evidence "$SCENARIO" "$kind" "bookingId" "$booking_id"
  log_ok "${kind} partner-linked booking created: ${booking_id}"

  log_step "${kind}.8 - GET /tenant/bookings/:bookingId"
  http_call GET "/tenant/bookings/${booking_id}"
  assert_status "200"

  local order_id booking_entry booking_partner_id booking_program_id booking_subtype booking_eligibility_id booking_benefit booking_issuer
  order_id=$(json_get_first ".data.orderId" ".data.order_id")
  booking_entry=$(json_get_first ".data.partnerEntrySlug" ".data.partner_entry_slug")
  booking_partner_id=$(json_get_first ".data.partnerId" ".data.partner_id")
  booking_program_id=$(json_get_first ".data.partnerProgramId" ".data.partner_program_id" ".data.programId" ".data.program_id")
  booking_subtype=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
  booking_eligibility_id=$(json_get_first ".data.eligibilityVerificationId" ".data.eligibility_verification_id")
  booking_benefit=$(json_get_first ".data.benefitReference" ".data.benefit_reference")
  booking_issuer=$(json_get_first ".data.issuerAuthorizationRef" ".data.issuer_authorization_ref")

  assert_non_empty "${kind} orderId" "$order_id"
  assert_equal "${kind} booking entrySlug" "$entry_slug" "$booking_entry"
  assert_equal "${kind} booking partnerId" "$entry_partner_id" "$booking_partner_id"
  assert_equal "${kind} booking programId" "$program_id" "$booking_program_id"
  assert_equal "${kind} booking subtype" "$subtype" "$booking_subtype"
  assert_equal "${kind} booking eligibilityVerificationId" "$eligibility_id" "$booking_eligibility_id"
  assert_equal "${kind} booking benefitReference" "$benefit_reference" "$booking_benefit"
  assert_equal "${kind} booking issuerAuthorizationRef" "$issuer_ref" "$booking_issuer"

  chain_set "$kind" "orderId" "$order_id"
  save_evidence "$SCENARIO" "$kind" "orderId" "$order_id"
  log_ok "${kind} booking read-back preserves partner/program/subtype continuity"

  run_downstream_chain \
    "$kind" \
    "$subtype" \
    "$booking_id" \
    "$order_id" \
    "$entry_slug" \
    "$entry_partner_id" \
    "$program_id" \
    "$eligibility_id" \
    "$benefit_reference" \
    "$issuer_ref"

  assert_chain "$kind" "entrySlug"
  assert_chain "$kind" "eligibilityVerificationId"
  assert_chain "$kind" "bookingId"
  assert_chain "$kind" "orderId"
  assert_chain "$kind" "dispatchJobId"
  assert_chain "$kind" "taskId"
  assert_chain "$kind" "invoiceId"
}

run_variant_case \
  "insurance" \
  "insurance_replacement_vehicle" \
  "e2e_insurance_${CODE_SUFFIX}" \
  "insurance_partner" \
  "program-e2e-insurance-${SUFFIX}" \
  "INS_REPL_${CODE_SUFFIX}" \
  "e2e-insurance-replacement-${SUFFIX}" \
  "Fubon Insurance Replacement Vehicle" \
  "claim.fubon-ins.com.tw" \
  "/claims/replacement-vehicle" \
  "#0072ce" \
  "insurance-policy-${SUFFIX}" \
  "benefit-insurance-${SUFFIX}" \
  "Fubon approved repair center, Taipei" \
  "Replacement vehicle pickup bay" \
  "E2E Insurance Passenger" \
  "policy reference and claim reference covered by replacement window"

run_variant_case \
  "travel" \
  "travel_agency_transfer" \
  "e2e_travel_${CODE_SUFFIX}" \
  "travel_agency" \
  "program-e2e-travel-${SUFFIX}" \
  "TRAVEL_GRP_${CODE_SUFFIX}" \
  "e2e-travel-agency-${SUFFIX}" \
  "Lion Travel Group Transfer" \
  "booking.lion-travel.com.tw" \
  "/groups/transfer" \
  "#f6a800" \
  "travel-booking-${SUFFIX}" \
  "benefit-travel-${SUFFIX}" \
  "Lion Travel Taipei branch" \
  "Taoyuan Airport group bus zone" \
  "E2E Travel Roster Lead" \
  "group booking reference and roster count covered by travel program"

print_chain_summary

log_ok "E2E-015 completed. Non-card partner program variants preserve booking, dispatch, driver, and invoice continuity."
echo -e "Evidence log: ${EVIDENCE_FILE}"
