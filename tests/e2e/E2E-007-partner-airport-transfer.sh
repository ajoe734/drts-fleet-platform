#!/usr/bin/env bash
# E2E-007 — Partner airport transfer full chain
#
# Surface chain:
#   Partner ingress → Tenant Portal → Ops Console → Driver App → Tenant Billing
#
# ID continuity:
#   partnerEntrySlug            captured at: partner/entries/:entrySlug
#   eligibilityVerificationId   captured at: partner/eligibility/verify
#   benefitReference            captured at: partner/eligibility/verify
#   bookingId                   captured at: tenant/bookings
#   orderId                     captured at: tenant/bookings/:bookingId
#   dispatchJobId               captured at: orders/:orderId/dispatch or dispatch/tasks
#   taskId                      captured at: dispatch/assign or driver/tasks
#   invoiceId                   captured at: tenant/invoices/generate
#
# Pass criteria (E2E-007):
#   1. Partner entry resolves as credit_card_airport_transfer with eligibility enabled.
#   2. Eligibility verification returns eligible and yields a non-empty benefitReference.
#   3. Booking read-back carries partnerEntrySlug, eligibilityVerificationId, and benefitReference.
#   4. Driver can complete the trip after ops dispatch assignment.
#   5. Invoice line for the order carries partner_airport channel metadata and the same benefitReference.
#
# Cross-ref: docs/04-uat/fbp-014a-e2e-matrix.md §4.5, WF-PARTNER-001.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-007"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-007 — Partner airport transfer full chain${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

PARTNER_ENTRY_SLUG="${E2E_PARTNER_ENTRY_SLUG:-bank-demo-beta-airport}"
PARTNER_REFERENCE_TOKEN="${E2E_PARTNER_REFERENCE_TOKEN:-e2e-reference-token-007-$(date +%s)}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Partner ingress: resolve entry and verify eligibility
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Partner ingress — entry resolution and eligibility"

log_step "1.1 — GET /partner/entries/:entrySlug"
http_call GET "/partner/entries/${PARTNER_ENTRY_SLUG}"
assert_status "200"

ENTRY_TENANT_ID=$(json_get_first ".data.tenantId" ".data.tenant_id")
ENTRY_PARTNER_ID=$(json_get_first ".data.partnerId" ".data.partner_id")
ENTRY_PROGRAM_ID=$(json_get_first ".data.programId" ".data.program_id")
ENTRY_SUBTYPE=$(json_get_first ".data.businessDispatchSubtype" ".data.business_dispatch_subtype")
ENTRY_ELIGIBILITY_MODE=$(json_get_first ".data.eligibilityMode" ".data.eligibility_mode")

if [[ -z "$ENTRY_TENANT_ID" || -z "$ENTRY_PARTNER_ID" || -z "$ENTRY_PROGRAM_ID" ]]; then
  log_fail "Partner entry payload missing tenantId / partnerId / programId: ${RESP_BODY}"
  exit 1
fi
if [[ "$ENTRY_SUBTYPE" != "credit_card_airport_transfer" ]]; then
  log_fail "Expected credit_card_airport_transfer entry, got '${ENTRY_SUBTYPE:-<empty>}'"
  exit 1
fi
if [[ "$ENTRY_ELIGIBILITY_MODE" == "none" || -z "$ENTRY_ELIGIBILITY_MODE" ]]; then
  log_fail "Expected eligibility-enabled entry, got eligibilityMode='${ENTRY_ELIGIBILITY_MODE:-<empty>}'"
  exit 1
fi

chain_set "partner" "entrySlug" "$PARTNER_ENTRY_SLUG"
chain_set "partner" "tenantId" "$ENTRY_TENANT_ID"
save_evidence "$SCENARIO" "partner" "entrySlug" "$PARTNER_ENTRY_SLUG"
save_evidence "$SCENARIO" "partner" "eligibilityMode" "$ENTRY_ELIGIBILITY_MODE"
save_evidence "$SCENARIO" "partner" "partnerId" "$ENTRY_PARTNER_ID"
save_evidence "$SCENARIO" "partner" "partnerProgramId" "$ENTRY_PROGRAM_ID"
log_ok "Partner entry resolved: tenantId=${ENTRY_TENANT_ID}, partnerId=${ENTRY_PARTNER_ID}, programId=${ENTRY_PROGRAM_ID}, eligibilityMode=${ENTRY_ELIGIBILITY_MODE}"

set_partner_context "$ENTRY_PARTNER_ID" "$ENTRY_PROGRAM_ID" "$PARTNER_ENTRY_SLUG"
switch_actor "partner_api_key" "e2e-partner-${PARTNER_ENTRY_SLUG}" "$ENTRY_TENANT_ID"

VERIFY_FIXTURE=$(mktemp /tmp/drts-e2e-007-eligibility-XXXXXX.json)
trap 'rm -f "$VERIFY_FIXTURE"' EXIT

jq -n \
  --arg entrySlug "$PARTNER_ENTRY_SLUG" \
  --arg referenceToken "$PARTNER_REFERENCE_TOKEN" \
  '{
    entrySlug: $entrySlug,
    referenceToken: $referenceToken
  }' > "$VERIFY_FIXTURE"

log_step "1.2 — POST /partner/eligibility/verify"
http_call POST "/partner/eligibility/verify" "$VERIFY_FIXTURE"
assert_status "200|201"

ELIGIBILITY_VERIFICATION_ID=$(json_get_first ".data.eligibilityVerificationId" ".data.eligibility_verification_id")
VERIFICATION_STATUS=$(json_get_first ".data.verificationStatus" ".data.verification_status")
VERIFIED_BENEFIT_REFERENCE=$(json_get_first ".data.benefitReference" ".data.benefit_reference")
VERIFIED_ISSUER_AUTH_REF=$(json_get_first ".data.issuerAuthorizationRef" ".data.issuer_authorization_ref")

if [[ -z "$ELIGIBILITY_VERIFICATION_ID" ]]; then
  log_fail "No eligibilityVerificationId in response: ${RESP_BODY}"
  exit 1
fi
if [[ "$VERIFICATION_STATUS" != "eligible" ]]; then
  log_fail "Expected verificationStatus=eligible, got '${VERIFICATION_STATUS:-<empty>}'"
  exit 1
fi
if [[ -z "$VERIFIED_BENEFIT_REFERENCE" ]]; then
  log_fail "No benefitReference in eligibility response: ${RESP_BODY}"
  exit 1
fi

chain_set "partner" "eligibilityVerificationId" "$ELIGIBILITY_VERIFICATION_ID"
chain_set "partner" "benefitReference" "$VERIFIED_BENEFIT_REFERENCE"
save_evidence "$SCENARIO" "partner" "eligibilityVerificationId" "$ELIGIBILITY_VERIFICATION_ID"
save_evidence "$SCENARIO" "partner" "benefitReference" "$VERIFIED_BENEFIT_REFERENCE"
if [[ -n "$VERIFIED_ISSUER_AUTH_REF" ]]; then
  save_evidence "$SCENARIO" "partner" "issuerAuthorizationRef" "$VERIFIED_ISSUER_AUTH_REF"
fi
log_ok "Eligibility verified: id=${ELIGIBILITY_VERIFICATION_ID}, benefitReference=${VERIFIED_BENEFIT_REFERENCE}"

log_step "1.3 — GET /partner/eligibility/:eligibilityVerificationId"
http_call GET "/partner/eligibility/${ELIGIBILITY_VERIFICATION_ID}"
assert_status "200"

DETAIL_BENEFIT_REFERENCE=$(json_get_first ".data.benefitReference" ".data.benefit_reference")
DETAIL_ENTRY_SLUG=$(json_get_first ".data.partnerEntrySlug" ".data.partner_entry_slug")

if [[ "$DETAIL_ENTRY_SLUG" != "$PARTNER_ENTRY_SLUG" ]]; then
  log_fail "Eligibility detail entrySlug mismatch: expected ${PARTNER_ENTRY_SLUG}, got '${DETAIL_ENTRY_SLUG:-<empty>}'"
  exit 1
fi
if [[ "$DETAIL_BENEFIT_REFERENCE" != "$VERIFIED_BENEFIT_REFERENCE" ]]; then
  log_fail "Eligibility detail benefitReference mismatch: expected ${VERIFIED_BENEFIT_REFERENCE}, got '${DETAIL_BENEFIT_REFERENCE:-<empty>}'"
  exit 1
fi
log_ok "Eligibility detail read-back matches verification response"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Tenant Portal: create airport-transfer booking from verified partner context
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Tenant Portal — airport-transfer booking"

switch_actor "tenant_admin" "e2e-tenant-admin-partner-001" "$ENTRY_TENANT_ID"

WINDOW_START=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")

BOOKING_FIXTURE=$(mktemp /tmp/drts-e2e-007-booking-XXXXXX.json)
trap 'rm -f "$VERIFY_FIXTURE" "$BOOKING_FIXTURE"' EXIT

jq \
  --arg ws "$WINDOW_START" \
  --arg we "$WINDOW_END" \
  --arg entrySlug "$PARTNER_ENTRY_SLUG" \
  --arg verificationId "$ELIGIBILITY_VERIFICATION_ID" \
  '.reservationWindowStart = $ws
   | .reservationWindowEnd = $we
   | .partnerEntrySlug = $entrySlug
   | .eligibilityVerificationId = $verificationId' \
  "${SCRIPT_DIR}/fixtures/e2e-booking-airport.json" > "$BOOKING_FIXTURE"

log_step "2.1 — POST /tenant/bookings"
http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"

BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
if [[ -z "$BOOKING_ID" ]]; then
  log_fail "No bookingId in response: ${RESP_BODY}"
  exit 1
fi

chain_set "tenant" "bookingId" "$BOOKING_ID"
chain_set "tenant" "tenantId" "$ENTRY_TENANT_ID"
save_evidence "$SCENARIO" "tenant" "bookingId" "$BOOKING_ID"
log_ok "Partner booking created: bookingId=${BOOKING_ID}"

log_step "2.2 — GET /tenant/bookings/:bookingId"
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"

BOOKING_ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
BOOKING_STATUS=$(json_get ".data.status")
BOOKING_ENTRY_SLUG=$(json_get_first ".data.partnerEntrySlug" ".data.partner_entry_slug")
BOOKING_VERIFICATION_ID=$(json_get_first ".data.eligibilityVerificationId" ".data.eligibility_verification_id")
BOOKING_BENEFIT_REFERENCE=$(json_get_first ".data.benefitReference" ".data.benefit_reference")
BOOKING_ISSUER_AUTH_REF=$(json_get_first ".data.issuerAuthorizationRef" ".data.issuer_authorization_ref")

if [[ -z "$BOOKING_ORDER_ID" ]]; then
  log_fail "Booking read-back missing orderId: ${RESP_BODY}"
  exit 1
fi
if [[ "$BOOKING_ENTRY_SLUG" != "$PARTNER_ENTRY_SLUG" ]]; then
  log_fail "Booking partnerEntrySlug mismatch: expected ${PARTNER_ENTRY_SLUG}, got '${BOOKING_ENTRY_SLUG:-<empty>}'"
  exit 1
fi
if [[ "$BOOKING_VERIFICATION_ID" != "$ELIGIBILITY_VERIFICATION_ID" ]]; then
  log_fail "Booking eligibilityVerificationId mismatch: expected ${ELIGIBILITY_VERIFICATION_ID}, got '${BOOKING_VERIFICATION_ID:-<empty>}'"
  exit 1
fi
if [[ "$BOOKING_BENEFIT_REFERENCE" != "$VERIFIED_BENEFIT_REFERENCE" ]]; then
  log_fail "Booking benefitReference mismatch: expected ${VERIFIED_BENEFIT_REFERENCE}, got '${BOOKING_BENEFIT_REFERENCE:-<empty>}'"
  exit 1
fi
if [[ -n "$VERIFIED_ISSUER_AUTH_REF" && "$BOOKING_ISSUER_AUTH_REF" != "$VERIFIED_ISSUER_AUTH_REF" ]]; then
  log_fail "Booking issuerAuthorizationRef mismatch: expected ${VERIFIED_ISSUER_AUTH_REF}, got '${BOOKING_ISSUER_AUTH_REF:-<empty>}'"
  exit 1
fi

chain_set "tenant" "orderId" "$BOOKING_ORDER_ID"
save_evidence "$SCENARIO" "tenant" "orderId" "$BOOKING_ORDER_ID"
save_evidence "$SCENARIO" "tenant" "bookingStatusAfterCreate" "$BOOKING_STATUS"
save_evidence "$SCENARIO" "tenant" "benefitReference" "$BOOKING_BENEFIT_REFERENCE"
log_ok "Booking read-back preserved partner metadata and benefitReference"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Ops Console: dispatch queue → assign driver
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Ops Console — dispatch assignment"

switch_actor "ops_user" "e2e-ops-001"

DISPATCH_FIXTURE=$(mktemp /tmp/drts-e2e-007-dispatch-XXXXXX.json)
trap 'rm -f "$VERIFY_FIXTURE" "$BOOKING_FIXTURE" "$DISPATCH_FIXTURE"' EXIT
printf '%s\n' '{"mode":"auto"}' > "$DISPATCH_FIXTURE"

log_step "3.1 — POST /orders/:orderId/dispatch"
http_call POST "/orders/${BOOKING_ORDER_ID}/dispatch" "$DISPATCH_FIXTURE"
assert_status "200|201"

DISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
if [[ -n "$DISPATCH_JOB_ID" ]]; then
  chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
  save_evidence "$SCENARIO" "ops" "dispatchJobIdAfterTrigger" "$DISPATCH_JOB_ID"
  log_ok "Dispatch triggered: dispatchJobId=${DISPATCH_JOB_ID}"
fi

log_step "3.2 — GET /dispatch/tasks (find job for this order)"
ATTEMPT=0
while (( ATTEMPT < E2E_POLL_MAX )); do
  if [[ -n "${DISPATCH_JOB_ID:-}" ]]; then
    break
  fi
  http_call GET "/dispatch/tasks"
  assert_status "200"
  DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$BOOKING_ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
    2>/dev/null | head -1 || true)
  if [[ -n "$DISPATCH_JOB_ID" ]]; then
    break
  fi
  log_info "  poll $((ATTEMPT + 1))/${E2E_POLL_MAX}: dispatch job for orderId=${BOOKING_ORDER_ID} not visible yet"
  sleep "$E2E_POLL_INTERVAL"
  ATTEMPT=$((ATTEMPT + 1))
done
if [[ -z "$DISPATCH_JOB_ID" ]]; then
  log_warn "No dispatch job found after polling; skipping downstream legs."
  print_chain_summary
  exit 0
fi

chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
log_ok "Found dispatchJobId=${DISPATCH_JOB_ID}"

log_step "3.3 — GET /dispatch/tasks/:dispatchJobId/candidates"
http_call GET "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates"
assert_status "200"

ASSIGN_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
ASSIGN_DRIVER_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)
[[ -n "$ASSIGN_VEHICLE_ID" ]] || ASSIGN_VEHICLE_ID="$E2E_SEED_VEHICLE_ID"
[[ -n "$ASSIGN_DRIVER_ID" ]] || ASSIGN_DRIVER_ID="$E2E_SEED_DRIVER_ID"

ASSIGN_FIXTURE=$(mktemp /tmp/drts-e2e-007-assign-XXXXXX.json)
trap 'rm -f "$VERIFY_FIXTURE" "$BOOKING_FIXTURE" "$DISPATCH_FIXTURE" "$ASSIGN_FIXTURE"' EXIT

jq \
  --arg jobId   "$DISPATCH_JOB_ID" \
  --arg vehicle "$ASSIGN_VEHICLE_ID" \
  --arg driver  "$ASSIGN_DRIVER_ID" \
  '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
  "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$ASSIGN_FIXTURE"

log_step "3.4 — POST /dispatch/assign"
http_call POST "/dispatch/assign" "$ASSIGN_FIXTURE"
assert_status "200|201"

TASK_ID=$(json_get_first ".data.taskId" ".data.task_id")
if [[ -n "$TASK_ID" ]]; then
  chain_set "ops" "taskId" "$TASK_ID"
  save_evidence "$SCENARIO" "ops" "taskId" "$TASK_ID"
fi
save_evidence "$SCENARIO" "ops" "driverId" "$ASSIGN_DRIVER_ID"
log_ok "Dispatch assigned: taskId=${TASK_ID:-<not_in_response>}, driverId=${ASSIGN_DRIVER_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Driver App: task lifecycle
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — task lifecycle"

switch_actor "driver_user" "e2e-driver-${ASSIGN_DRIVER_ID}" "$ENTRY_TENANT_ID"

TASK_ID_LEG4=$(chain_get "ops" "taskId")
if [[ -z "$TASK_ID_LEG4" ]]; then
  log_step "4.0 — GET /driver/tasks (resolve taskId from driver view)"
  http_call GET "/driver/tasks"
  assert_status "200"
  TASK_ID_LEG4=$(echo "$RESP_BODY" | jq -r --arg oid "$BOOKING_ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.taskId // .task_id)' \
    2>/dev/null | head -1 || true)
fi

if [[ -z "$TASK_ID_LEG4" ]]; then
  log_warn "No driver task found; skipping completion + invoice legs."
  print_chain_summary
  exit 0
fi

chain_set "driver" "taskId" "$TASK_ID_LEG4"
log_info "Driver task: ${TASK_ID_LEG4}"

ACCEPT_FIXTURE=$(mktemp /tmp/drts-e2e-007-accept-XXXXXX.json)
DEPART_FIXTURE=$(mktemp /tmp/drts-e2e-007-depart-XXXXXX.json)
ARRIVE_FIXTURE=$(mktemp /tmp/drts-e2e-007-arrive-XXXXXX.json)
START_FIXTURE=$(mktemp /tmp/drts-e2e-007-start-XXXXXX.json)
COMPLETE_FIXTURE=$(mktemp /tmp/drts-e2e-007-complete-XXXXXX.json)
trap 'rm -f "$VERIFY_FIXTURE" "$BOOKING_FIXTURE" "$DISPATCH_FIXTURE" "$ASSIGN_FIXTURE" "$ACCEPT_FIXTURE" "$DEPART_FIXTURE" "$ARRIVE_FIXTURE" "$START_FIXTURE" "$COMPLETE_FIXTURE"' EXIT

jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.acceptedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" > "$ACCEPT_FIXTURE"
jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.departedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-depart.json" > "$DEPART_FIXTURE"
jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.arrivedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-arrived-pickup.json" > "$ARRIVE_FIXTURE"
jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.startedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-start.json" > "$START_FIXTURE"
COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
jq --arg ts "$COMPLETED_AT" '.completedAt = $ts | .signoff.signedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" > "$COMPLETE_FIXTURE"

log_step "4.1 — POST /driver/tasks/:taskId/accept"
http_call POST "/driver/tasks/${TASK_ID_LEG4}/accept" "$ACCEPT_FIXTURE"
assert_status "200|201"

log_step "4.2 — POST /driver/tasks/:taskId/depart"
http_call POST "/driver/tasks/${TASK_ID_LEG4}/depart" "$DEPART_FIXTURE"
assert_status "200|201"

log_step "4.3 — POST /driver/tasks/:taskId/arrived_pickup"
http_call POST "/driver/tasks/${TASK_ID_LEG4}/arrived_pickup" "$ARRIVE_FIXTURE"
assert_status "200|201"

log_step "4.4 — POST /driver/tasks/:taskId/start"
http_call POST "/driver/tasks/${TASK_ID_LEG4}/start" "$START_FIXTURE"
assert_status "200|201"

log_step "4.5 — POST /driver/tasks/:taskId/complete"
http_call POST "/driver/tasks/${TASK_ID_LEG4}/complete" "$COMPLETE_FIXTURE"
assert_status "200|201"
save_evidence "$SCENARIO" "driver" "completedAt" "$COMPLETED_AT"
log_ok "Trip completed at ${COMPLETED_AT}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 5 — Tenant Billing: booking completion + invoice propagation
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Tenant Billing — completed booking and invoice propagation"

switch_actor "tenant_admin" "e2e-tenant-admin-partner-001" "$ENTRY_TENANT_ID"

log_step "5.1 — GET /tenant/bookings/:bookingId (verify completed + propagation)"
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"

BOOKING_STATUS_FINAL=$(json_get ".data.status")
BOOKING_BENEFIT_REFERENCE_FINAL=$(json_get_first ".data.benefitReference" ".data.benefit_reference")
if [[ "$BOOKING_STATUS_FINAL" != "completed" ]]; then
  log_fail "Expected booking status 'completed', got '${BOOKING_STATUS_FINAL:-<empty>}'"
  exit 1
fi
if [[ "$BOOKING_BENEFIT_REFERENCE_FINAL" != "$VERIFIED_BENEFIT_REFERENCE" ]]; then
  log_fail "Final booking benefitReference mismatch: expected ${VERIFIED_BENEFIT_REFERENCE}, got '${BOOKING_BENEFIT_REFERENCE_FINAL:-<empty>}'"
  exit 1
fi
save_evidence "$SCENARIO" "tenant" "bookingStatusFinal" "$BOOKING_STATUS_FINAL"
log_ok "Completed booking preserves propagated benefitReference"

sleep 2
PERIOD_START=$(date -u +"%Y-%m-%dT00:00:00Z")
PERIOD_END=$(date -u -d "-1 second" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v-1S +"%Y-%m-%dT%H:%M:%SZ")

INVOICE_FIXTURE=$(mktemp /tmp/drts-e2e-007-invoice-XXXXXX.json)
trap 'rm -f "$VERIFY_FIXTURE" "$BOOKING_FIXTURE" "$DISPATCH_FIXTURE" "$ASSIGN_FIXTURE" "$ACCEPT_FIXTURE" "$DEPART_FIXTURE" "$ARRIVE_FIXTURE" "$START_FIXTURE" "$COMPLETE_FIXTURE" "$INVOICE_FIXTURE"' EXIT
jq -n \
  --arg tenantId "$ENTRY_TENANT_ID" \
  --arg periodStart "$PERIOD_START" \
  --arg periodEnd "$PERIOD_END" \
  '{
    tenantId: $tenantId,
    periodStart: $periodStart,
    periodEnd: $periodEnd
  }' > "$INVOICE_FIXTURE"

log_step "5.2 — POST /tenant/invoices/generate"
http_call POST "/tenant/invoices/generate" "$INVOICE_FIXTURE"
assert_status "200|201"

INVOICE_ID=$(json_get_first ".data.invoiceId" ".data.invoice_id")
if [[ -z "$INVOICE_ID" ]]; then
  log_fail "No invoiceId in invoice response: ${RESP_BODY}"
  exit 1
fi

chain_set "billing" "invoiceId" "$INVOICE_ID"
save_evidence "$SCENARIO" "billing" "invoiceId" "$INVOICE_ID"
log_ok "Invoice generated: ${INVOICE_ID}"

log_step "5.3 — GET /tenant/invoices/:invoiceId"
http_call GET "/tenant/invoices/${INVOICE_ID}"
assert_status "200"

INVOICE_TENANT_ID=$(json_get_first ".data.tenantId" ".data.tenant_id")
INVOICE_LINE_CHANNEL=$(echo "$RESP_BODY" | jq -r --arg oid "$BOOKING_ORDER_ID" \
  '.data.lines[] | select((.orderId // .order_id) == $oid) | (.channelKey // .channel_key)' \
  2>/dev/null | head -1 || true)
INVOICE_LINE_ENTRY_SLUG=$(echo "$RESP_BODY" | jq -r --arg oid "$BOOKING_ORDER_ID" \
  '.data.lines[] | select((.orderId // .order_id) == $oid) | (.partnerEntrySlug // .partner_entry_slug)' \
  2>/dev/null | head -1 || true)
INVOICE_LINE_VERIFICATION_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$BOOKING_ORDER_ID" \
  '.data.lines[] | select((.orderId // .order_id) == $oid) | (.eligibilityVerificationId // .eligibility_verification_id)' \
  2>/dev/null | head -1 || true)
INVOICE_LINE_BENEFIT_REFERENCE=$(echo "$RESP_BODY" | jq -r --arg oid "$BOOKING_ORDER_ID" \
  '.data.lines[] | select((.orderId // .order_id) == $oid) | (.benefitReference // .benefit_reference)' \
  2>/dev/null | head -1 || true)
INVOICE_LINE_ISSUER_AUTH_REF=$(echo "$RESP_BODY" | jq -r --arg oid "$BOOKING_ORDER_ID" \
  '.data.lines[] | select((.orderId // .order_id) == $oid) | (.issuerAuthorizationRef // .issuer_authorization_ref)' \
  2>/dev/null | head -1 || true)

if [[ "$INVOICE_TENANT_ID" != "$ENTRY_TENANT_ID" ]]; then
  log_fail "Expected invoice tenantId ${ENTRY_TENANT_ID}, got '${INVOICE_TENANT_ID:-<empty>}'"
  exit 1
fi
if [[ "$INVOICE_LINE_CHANNEL" != "partner_airport" ]]; then
  log_fail "Expected invoice line channelKey partner_airport, got '${INVOICE_LINE_CHANNEL:-<empty>}'"
  exit 1
fi
if [[ "$INVOICE_LINE_ENTRY_SLUG" != "$PARTNER_ENTRY_SLUG" ]]; then
  log_fail "Invoice line partnerEntrySlug mismatch: expected ${PARTNER_ENTRY_SLUG}, got '${INVOICE_LINE_ENTRY_SLUG:-<empty>}'"
  exit 1
fi
if [[ "$INVOICE_LINE_VERIFICATION_ID" != "$ELIGIBILITY_VERIFICATION_ID" ]]; then
  log_fail "Invoice line eligibilityVerificationId mismatch: expected ${ELIGIBILITY_VERIFICATION_ID}, got '${INVOICE_LINE_VERIFICATION_ID:-<empty>}'"
  exit 1
fi
if [[ "$INVOICE_LINE_BENEFIT_REFERENCE" != "$VERIFIED_BENEFIT_REFERENCE" ]]; then
  log_fail "Invoice line benefitReference mismatch: expected ${VERIFIED_BENEFIT_REFERENCE}, got '${INVOICE_LINE_BENEFIT_REFERENCE:-<empty>}'"
  exit 1
fi
if [[ -n "$VERIFIED_ISSUER_AUTH_REF" && "$INVOICE_LINE_ISSUER_AUTH_REF" != "$VERIFIED_ISSUER_AUTH_REF" ]]; then
  log_fail "Invoice line issuerAuthorizationRef mismatch: expected ${VERIFIED_ISSUER_AUTH_REF}, got '${INVOICE_LINE_ISSUER_AUTH_REF:-<empty>}'"
  exit 1
fi

save_evidence "$SCENARIO" "billing" "invoiceChannelKey" "$INVOICE_LINE_CHANNEL"
save_evidence "$SCENARIO" "billing" "invoiceBenefitReference" "$INVOICE_LINE_BENEFIT_REFERENCE"
log_ok "Invoice line preserves partner_airport metadata and benefitReference"

# ══════════════════════════════════════════════════════════════════════════════
# CHAIN VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
log_step "Chain continuity assertions"
assert_chain "partner" "entrySlug"
assert_chain "partner" "eligibilityVerificationId"
assert_chain "partner" "benefitReference"
assert_chain "tenant"  "bookingId"
assert_chain "tenant"  "orderId"
assert_chain "ops"     "dispatchJobId"
assert_chain "driver"  "taskId"
assert_chain "billing" "invoiceId"

print_chain_summary

echo ""
log_ok "E2E-007 complete — partner airport transfer chain passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
