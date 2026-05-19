#!/usr/bin/env bash
# E2E-008 — Partner booking cutover
#
# Surface chain:
#   Platform Admin (entry deactivate / activate) -> Partner Ingress (bootstrap + eligibility)
#   -> Tenant Booking Authority -> Billing / Settlement evidence
#
# Pass criteria (E2E-008):
#   1. Inactive partner entry rejects bootstrap with PARTNER_ENTRY_INACTIVE.
#   2. Reactivated entry accepts eligibility verification for the same entry.
#   3. Partner-linked airport booking preserves partnerEntrySlug + eligibilityVerificationId.
#   4. Finance evidence exposes partner-airport receipt ownership and invoice retrieval still works.
#   5. Entry is restored to active at the end of the scenario (rollback-safe state).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-008"
ENTRY_SLUG="${E2E_PARTNER_ENTRY_SLUG_OVERRIDE:-bank-demo-alpha-airport}"
PARTNER_ID="${E2E_PARTNER_ID_OVERRIDE:-partner-bank-demo-001}"
PARTNER_PROGRAM_ID="${E2E_PARTNER_PROGRAM_ID_OVERRIDE:-program-airport-alpha}"
PARTNER_KEY="${PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT:-}"
ENTRY_MUTATED=false
ENTRY_RESTORED=false

cleanup() {
  if [[ "${ENTRY_MUTATED}" != "true" || "${ENTRY_RESTORED}" == "true" ]]; then
    return 0
  fi

  log_warn "Cleanup: restoring partner entry ${ENTRY_SLUG} to active."
  switch_actor "platform_admin" "e2e-platform-admin-001"
  http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/activate"
  if [[ "${RESP_STATUS:-}" =~ ^(200|201)$ ]]; then
    ENTRY_RESTORED=true
    log_ok "Cleanup restored partner entry to active."
  else
    log_warn "Cleanup could not restore partner entry. HTTP ${RESP_STATUS:-unknown}"
    log_warn "Body: ${RESP_BODY:-<empty>}"
  fi
}
trap cleanup EXIT

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-008 — Partner booking cutover${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

if [[ -z "$PARTNER_KEY" ]]; then
  log_warn "PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT is not configured."
  log_warn "Gracefully skipping — partner bootstrap auth cannot be proven without the seeded ingress key."
  exit 0
fi

WINDOW_START=$(date -u -d "+26 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+26H +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+28 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+28H +"%Y-%m-%dT%H:%M:%SZ")
PERIOD_START=$(date -u +"%Y-%m-01T00:00:00Z")
PERIOD_END=$(date -u -d "+32 days" +"%Y-%m-01T00:00:00Z" 2>/dev/null \
  || date -u -v+32d +"%Y-%m-01T00:00:00Z")
BENEFIT_REFERENCE="benefit-e2e-cutover-$(date -u +%Y%m%d%H%M%S)"
FLIGHT_NO="CI$(date -u +%H%M)"

BOOTSTRAP_FIXTURE=$(mktemp /tmp/drts-e2e-008-bootstrap-XXXXXX.json)
ELIGIBILITY_FIXTURE=$(mktemp /tmp/drts-e2e-008-eligibility-XXXXXX.json)
BOOKING_FIXTURE=$(mktemp /tmp/drts-e2e-008-booking-XXXXXX.json)
INVOICE_FIXTURE=$(mktemp /tmp/drts-e2e-008-invoice-XXXXXX.json)
trap 'rm -f "$BOOTSTRAP_FIXTURE" "$ELIGIBILITY_FIXTURE" "$BOOKING_FIXTURE" "$INVOICE_FIXTURE"; cleanup' EXIT

printf '%s\n' "{\"entrySlug\":\"${ENTRY_SLUG}\",\"apiKey\":\"${PARTNER_KEY}\"}" > "$BOOTSTRAP_FIXTURE"
printf '%s\n' \
  "{\"entrySlug\":\"${ENTRY_SLUG}\",\"cardLast4\":\"4242\",\"cardholderName\":\"E2E Cardholder\",\"benefitReference\":\"${BENEFIT_REFERENCE}\",\"flightNo\":\"${FLIGHT_NO}\"}" \
  > "$ELIGIBILITY_FIXTURE"
printf '%s\n' \
  "{\"tenantId\":\"${E2E_SEED_TENANT_ID}\",\"periodStart\":\"${PERIOD_START}\",\"periodEnd\":\"${PERIOD_END}\"}" \
  > "$INVOICE_FIXTURE"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Platform Admin: deactivate entry and confirm bootstrap is blocked
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — inactive entry negative path"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "1.1 — POST /platform-admin/partner-entries/:entrySlug/activate (baseline)"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/activate"
assert_status "200|201"
save_evidence "$SCENARIO" "platform_admin" "entryBaselineStatus" "active"

log_step "1.2 — POST /platform-admin/partner-entries/:entrySlug/deactivate"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/deactivate"
assert_status "200|201"
ENTRY_MUTATED=true
save_evidence "$SCENARIO" "platform_admin" "entryStatusAfterDeactivate" "inactive"
log_ok "Partner entry deactivated: ${ENTRY_SLUG}"

log_step "1.3 — POST /auth/partner/bootstrap-session (expect inactive rejection)"
http_call POST "/auth/partner/bootstrap-session" "$BOOTSTRAP_FIXTURE"
if [[ "${RESP_STATUS}" != "403" ]]; then
  log_fail "Expected inactive bootstrap rejection HTTP 403, got ${RESP_STATUS}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
INACTIVE_CODE=$(echo "$RESP_BODY" | jq -r '.error.code // empty' 2>/dev/null || true)
if [[ "$INACTIVE_CODE" != "PARTNER_ENTRY_INACTIVE" ]]; then
  log_fail "Expected PARTNER_ENTRY_INACTIVE, got '${INACTIVE_CODE:-<empty>}'"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "partner" "inactiveBootstrapCode" "$INACTIVE_CODE"
log_ok "Inactive entry blocks bootstrap with ${INACTIVE_CODE}"

log_step "1.4 — POST /platform-admin/partner-entries/:entrySlug/activate (rollback restore)"
switch_actor "platform_admin" "e2e-platform-admin-001"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/activate"
assert_status "200|201"
ENTRY_RESTORED=true
save_evidence "$SCENARIO" "platform_admin" "entryStatusAfterRollback" "active"
log_ok "Partner entry restored to active."

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Partner Ingress: bootstrap and eligibility
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Partner Ingress — bootstrap and eligibility"

log_step "2.1 — POST /auth/partner/bootstrap-session"
http_call POST "/auth/partner/bootstrap-session" "$BOOTSTRAP_FIXTURE"
assert_status "200|201"
PARTNER_ENTRY_STATUS=$(json_get ".data.partnerEntry.status")
if [[ -z "$(json_get ".data.accessToken")" ]]; then
  log_fail "Partner bootstrap session did not return an accessToken."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
chain_set "partner" "entrySlug" "$ENTRY_SLUG"
save_evidence "$SCENARIO" "partner" "bootstrapEntryStatus" "${PARTNER_ENTRY_STATUS:-unknown}"
log_ok "Partner bootstrap restored for ${ENTRY_SLUG}"

switch_actor "partner_api_key" "partner-key-alpha-demo" "${E2E_SEED_TENANT_ID}"
E2E_REALM="partner"
E2E_PARTNER_ID="$PARTNER_ID"
E2E_PARTNER_PROGRAM_ID="$PARTNER_PROGRAM_ID"
E2E_PARTNER_ENTRY_SLUG="$ENTRY_SLUG"

log_step "2.2 — POST /partner/eligibility/verify"
http_call POST "/partner/eligibility/verify" "$ELIGIBILITY_FIXTURE"
assert_status "200|201"
ELIGIBILITY_VERIFICATION_ID=$(json_get ".data.eligibilityVerificationId")
ELIGIBILITY_STATUS=$(json_get ".data.verificationStatus")
if [[ -z "$ELIGIBILITY_VERIFICATION_ID" ]]; then
  log_fail "No eligibilityVerificationId in response."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
if [[ "$ELIGIBILITY_STATUS" != "eligible" ]]; then
  log_fail "Expected eligibility status 'eligible', got '${ELIGIBILITY_STATUS:-<empty>}'"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
chain_set "partner" "eligibilityVerificationId" "$ELIGIBILITY_VERIFICATION_ID"
save_evidence "$SCENARIO" "partner" "eligibilityVerificationId" "$ELIGIBILITY_VERIFICATION_ID"
save_evidence "$SCENARIO" "partner" "eligibilityStatus" "$ELIGIBILITY_STATUS"
log_ok "Eligibility verified: ${ELIGIBILITY_VERIFICATION_ID}"

log_step "2.3 — GET /partner/eligibility/:eligibilityVerificationId"
http_call GET "/partner/eligibility/${ELIGIBILITY_VERIFICATION_ID}"
assert_status "200"
ELIGIBILITY_ENTRY=$(json_get ".data.partnerEntrySlug")
if [[ "$ELIGIBILITY_ENTRY" != "$ENTRY_SLUG" ]]; then
  log_fail "Eligibility record entry mismatch: expected ${ENTRY_SLUG}, got '${ELIGIBILITY_ENTRY:-<empty>}'"
  exit 1
fi
log_ok "Eligibility record read-back preserved partnerEntrySlug=${ELIGIBILITY_ENTRY}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Tenant Booking: create partner-linked booking and confirm persistence
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Tenant Booking Authority — partner-linked airport booking"

switch_actor "tenant_admin" "e2e-tenant-admin-001" "${E2E_SEED_TENANT_ID}"

jq \
  --arg ws "$WINDOW_START" \
  --arg we "$WINDOW_END" \
  --arg entry "$ENTRY_SLUG" \
  --arg elig "$ELIGIBILITY_VERIFICATION_ID" \
  --arg benefit "$BENEFIT_REFERENCE" \
  --arg flight "$FLIGHT_NO" \
  '.reservationWindowStart = $ws
   | .reservationWindowEnd = $we
   | .partnerEntrySlug = $entry
   | .eligibilityVerificationId = $elig
   | .benefitReference = $benefit
   | .direction = "dropoff"
   | .flightNo = $flight
   | .bookedBy.email = "e2e-partner-cutover@example.com"' \
  "${SCRIPT_DIR}/fixtures/e2e-booking-airport.json" > "$BOOKING_FIXTURE"

log_step "3.1 — POST /tenant/bookings"
http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"
BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
if [[ -z "$BOOKING_ID" ]]; then
  log_fail "No bookingId in booking response."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
chain_set "tenant" "bookingId" "$BOOKING_ID"
save_evidence "$SCENARIO" "tenant" "bookingId" "$BOOKING_ID"
log_ok "Partner-linked booking created: bookingId=${BOOKING_ID}"

log_step "3.2 — GET /tenant/bookings/:bookingId"
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"
BOOKING_STATUS=$(json_get ".data.status")
BOOKING_ENTRY=$(json_get ".data.partnerEntrySlug")
BOOKING_ELIGIBILITY=$(json_get ".data.eligibilityVerificationId")
BOOKING_ORDER_ID=$(json_get ".data.orderId")
if [[ "$BOOKING_ENTRY" != "$ENTRY_SLUG" ]]; then
  log_fail "Booking partnerEntrySlug mismatch: expected ${ENTRY_SLUG}, got '${BOOKING_ENTRY:-<empty>}'"
  exit 1
fi
if [[ "$BOOKING_ELIGIBILITY" != "$ELIGIBILITY_VERIFICATION_ID" ]]; then
  log_fail "Booking eligibilityVerificationId mismatch: expected ${ELIGIBILITY_VERIFICATION_ID}, got '${BOOKING_ELIGIBILITY:-<empty>}'"
  exit 1
fi
chain_set "tenant" "orderId" "$BOOKING_ORDER_ID"
save_evidence "$SCENARIO" "tenant" "bookingStatus" "${BOOKING_STATUS:-unknown}"
save_evidence "$SCENARIO" "tenant" "orderId" "${BOOKING_ORDER_ID:-unknown}"
log_ok "Booking confirmed with status=${BOOKING_STATUS:-unknown}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Finance evidence: receipt ownership + invoice retrieval
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Finance Evidence — receipt ownership and invoice retrieval"

switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "4.1 — GET /settlement/matrix"
http_call GET "/settlement/matrix"
assert_status "200"
RECEIPT_OWNER=$(echo "$RESP_BODY" | jq -r \
  '.data.items[] | select(.channelKey == "partner_airport") | .receiptOwner' \
  2>/dev/null | head -1 || true)
if [[ -z "$RECEIPT_OWNER" ]]; then
  log_fail "Could not resolve partner_airport receiptOwner from settlement matrix."
  exit 1
fi
save_evidence "$SCENARIO" "finance" "receiptOwner" "$RECEIPT_OWNER"
log_ok "Settlement matrix receiptOwner=${RECEIPT_OWNER}"

switch_actor "tenant_admin" "e2e-tenant-admin-001" "${E2E_SEED_TENANT_ID}"

log_step "4.2 — POST /tenant/invoices/generate"
http_call POST "/tenant/invoices/generate" "$INVOICE_FIXTURE"
assert_status "200|201"
INVOICE_ID=$(json_get ".data.invoiceId")
if [[ -z "$INVOICE_ID" ]]; then
  log_fail "Invoice generation did not return invoiceId."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
chain_set "finance" "invoiceId" "$INVOICE_ID"
save_evidence "$SCENARIO" "finance" "invoiceId" "$INVOICE_ID"
log_ok "Invoice generated: ${INVOICE_ID}"

log_step "4.3 — GET /tenant/invoices/:invoiceId"
http_call GET "/tenant/invoices/${INVOICE_ID}"
assert_status "200"
INVOICE_STATUS=$(json_get ".data.status")
save_evidence "$SCENARIO" "finance" "invoiceStatus" "${INVOICE_STATUS:-unknown}"
log_ok "Invoice read-back status=${INVOICE_STATUS:-unknown}"

# ══════════════════════════════════════════════════════════════════════════════
# CHAIN VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
log_step "Chain continuity assertions"
assert_chain "partner" "entrySlug"
assert_chain "partner" "eligibilityVerificationId"
assert_chain "tenant" "bookingId"
assert_chain "finance" "invoiceId"

print_chain_summary

echo ""
log_ok "E2E-008 complete — partner booking cutover passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
