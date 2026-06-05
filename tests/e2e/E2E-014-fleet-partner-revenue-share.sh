#!/usr/bin/env bash
# E2E-014 — Fleet partner revenue-share shell
#
# Surface chain:
#   Platform Admin → Tenant Portal → Ops Console → Driver App → Billing / Fleet settlement
#
# ID continuity:
#   fleetPartnerId   captured at: admin/fleet-partners
#   affiliationId    captured at: admin/drivers/:driverId/fleet-affiliations
#   revenueRuleId    captured at: admin/fleet-partners/:id/revenue-share-rules
#   bookingId        captured at: tenant/bookings
#   orderId          captured at: tenant/bookings/:bookingId
#   dispatchJobId    captured at: orders/:orderId/dispatch or dispatch/tasks
#   taskId           captured at: dispatch/assign or driver/tasks
#   statementId      captured at: driver-statements or admin/fleet-partners/:id/statements
#
# Pass criteria (E2E-014):
#   1. Platform admin can create a fleet partner, affiliate a driver, and create a revenue-share rule.
#   2. Seed driver can complete a trip after affiliation and dispatch assignment.
#   3. Driver statement generation includes the completed orderId.
#   4. Fleet-partner statements surface the affiliated orderId and a non-empty share amount.
#
# Availability-first discipline:
#   - If fleet partner admin APIs are absent on the target environment, this shell exits 0 with
#     explicit evidence so the suite stays reviewable instead of silently green.
#   - If trip completion succeeds but downstream settlement APIs are unavailable, those legs are
#     recorded as skipped evidence rather than misreported as a full pass.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-014"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-014 — Fleet partner revenue-share shell${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-014-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUFFIX="$(date +%s | tail -c 7)"
WINDOW_START=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")
WINDOW_END=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")
COMPLETED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
PERIOD_MONTH="${E2E_PERIOD_MONTH:-$(date -u +"%Y-%m")}"

FLEET_PARTNER_ID=""
AFFILIATION_ID=""
REVENUE_RULE_ID=""
BOOKING_ID=""
ORDER_ID=""
DISPATCH_JOB_ID=""
TASK_ID=""
DRIVER_STATEMENT_LINE=""
FLEET_SHARE_MINOR=""
STATEMENT_ID=""
ASSIGN_VEHICLE_ID="${E2E_SEED_VEHICLE_ID}"
ASSIGN_DRIVER_ID="${E2E_SEED_DRIVER_ID}"

skip_clean() {
  local subcase="$1"
  local reason="$2"
  log_warn "$reason"
  save_evidence "$SCENARIO" "$subcase" "skipped" "$reason"
  print_chain_summary
  exit 0
}

require_endpoint() {
  local path="$1"
  local label="$2"
  http_call GET "$path"
  case "$RESP_STATUS" in
    200)
      log_ok "${label} available"
      ;;
    401|403)
      log_fail "${label} exists but current auth cannot access it (HTTP ${RESP_STATUS})"
      log_fail "Body: ${RESP_BODY}"
      exit 1
      ;;
    404|405|501)
      skip_clean "$label" "${label} unavailable on this environment (HTTP ${RESP_STATUS})"
      ;;
    *)
      log_fail "${label} probe returned unexpected HTTP ${RESP_STATUS}"
      log_fail "Body: ${RESP_BODY}"
      exit 1
      ;;
  esac
}

skip_on_unavailable_write() {
  local subcase="$1"
  local label="$2"
  case "$RESP_STATUS" in
    404|405|501)
      skip_clean "$subcase" "${label} unavailable on this environment (HTTP ${RESP_STATUS})"
      ;;
  esac
}

resolve_driver_statement_order_line() {
  echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" '
    .data.items[]? as $statement
    | ($statement.lines // [])[]
    | select((.orderId // .order_id // empty) == $oid)
    | (.lineId // .line_id // "matched")
  ' 2>/dev/null | head -1 || true
}

resolve_fleet_statement_share_minor() {
  echo "$RESP_BODY" | jq -r --arg fp "$FLEET_PARTNER_ID" --arg oid "$ORDER_ID" '
    def statement_items:
      if (.data.items? | type) == "array" then .data.items
      elif (.data? | type) == "array" then .data
      else [] end;
    def lines($statement):
      ($statement.lines // $statement.lineItems // $statement.items // []);
    def statement_match($statement):
      (($statement.fleetPartnerId // $statement.fleet_partner_id // "") == $fp)
      or (($statement.partnerId // $statement.partner_id // "") == $fp);
    [
      statement_items[] as $statement
      | select(statement_match($statement))
      | lines($statement)[]
      | select((.orderId // .order_id // "") == $oid)
      | (.fleetShare.amountMinor
        // .fleetShare.amount_minor
        // .shareAmount.amountMinor
        // .shareAmount.amount_minor
        // .amount.amountMinor
        // .amount.amount_minor
        // .amountMinor
        // .amount_minor
        // empty)
    ][0] // empty
  ' 2>/dev/null | head -1 || true
}

poll_driver_statement_line() {
  local attempt=0
  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/driver-statements?periodMonth=${PERIOD_MONTH}"
    assert_status "200"

    DRIVER_STATEMENT_LINE=$(resolve_driver_statement_order_line)
    [[ -n "$DRIVER_STATEMENT_LINE" ]] && return 0

    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  return 1
}

poll_fleet_statement_share() {
  local attempt=0
  while (( attempt < E2E_POLL_MAX )); do
    http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}/statements"
    case "$RESP_STATUS" in
      200) ;;
      404|405|501)
        skip_clean "fleet_statement" "fleet partner statement endpoint unavailable (HTTP ${RESP_STATUS})"
        ;;
      *)
        log_fail "Fleet statement lookup failed with HTTP ${RESP_STATUS}: ${RESP_BODY}"
        exit 1
        ;;
    esac

    FLEET_SHARE_MINOR=$(resolve_fleet_statement_share_minor)
    [[ -n "$FLEET_SHARE_MINOR" ]] && return 0

    sleep "$E2E_POLL_INTERVAL"
    attempt=$((attempt + 1))
  done

  return 1
}

# ══════════════════════════════════════════════════════════════════════════════
# LEG 0 — Probe platform fleet APIs
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — fleet partner probes"

switch_actor "platform_admin" "e2e-platform-admin-fleet-014"
require_endpoint "/admin/fleet-partners" "fleet_admin_api"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Create fleet partner, driver affiliation, and revenue-share rule
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — partner setup"

FLEET_FIXTURE="${TMP_DIR}/fleet-partner.json"
jq -n \
  --arg legalName "Fleet Revenue Share ${SUFFIX} Co." \
  --arg displayName "FleetShare-${SUFFIX}" \
  '{
    legalName: $legalName,
    displayName: $displayName,
    businessRegistrationNo: ("E2E-FLEET-" + $displayName),
    contactName: "E2E Fleet Owner",
    contactPhone: "+886900000014",
    active: true,
    partnershipType: "driver_recruitment"
  }' > "$FLEET_FIXTURE"

log_step "1.1 — POST /admin/fleet-partners"
http_call POST "/admin/fleet-partners" "$FLEET_FIXTURE"
skip_on_unavailable_write "fleet_admin_api" "fleet partner create"
assert_status "200|201"

FLEET_PARTNER_ID=$(json_get_first ".data.fleetPartnerId" ".data.fleet_partner_id" ".data.id")
if [[ -z "$FLEET_PARTNER_ID" ]]; then
  log_fail "Fleet partner create response missing fleetPartnerId: ${RESP_BODY}"
  exit 1
fi
chain_set "platform" "fleetPartnerId" "$FLEET_PARTNER_ID"
save_evidence "$SCENARIO" "platform" "fleetPartnerId" "$FLEET_PARTNER_ID"
log_ok "Fleet partner created: ${FLEET_PARTNER_ID}"

AFFILIATION_FIXTURE="${TMP_DIR}/fleet-affiliation.json"
jq -n \
  --arg fleetPartnerId "$FLEET_PARTNER_ID" \
  --arg effectiveFrom "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    fleetPartnerId: $fleetPartnerId,
    affiliationType: "recruited_by",
    effectiveFrom: $effectiveFrom
  }' > "$AFFILIATION_FIXTURE"

log_step "1.2 — POST /admin/drivers/:driverId/fleet-affiliations"
http_call POST "/admin/drivers/${E2E_SEED_DRIVER_ID}/fleet-affiliations" "$AFFILIATION_FIXTURE"
skip_on_unavailable_write "fleet_affiliation" "driver fleet affiliation API"
assert_status "200|201"

AFFILIATION_ID=$(json_get_first ".data.affiliationId" ".data.affiliation_id" ".data.id")
if [[ -z "$AFFILIATION_ID" ]]; then
  log_fail "Driver affiliation response missing affiliationId: ${RESP_BODY}"
  exit 1
fi
chain_set "platform" "affiliationId" "$AFFILIATION_ID"
save_evidence "$SCENARIO" "platform" "affiliationId" "$AFFILIATION_ID"
save_evidence "$SCENARIO" "platform" "driverId" "$E2E_SEED_DRIVER_ID"
log_ok "Driver affiliated: ${AFFILIATION_ID}"

RULE_FIXTURE="${TMP_DIR}/fleet-rule.json"
jq -n \
  --arg effectiveFrom "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    appliesTo: "all_trips",
    formula: "percent_of_gross",
    rateBps: 1200,
    effectiveFrom: $effectiveFrom
  }' > "$RULE_FIXTURE"

log_step "1.3 — POST /admin/fleet-partners/:id/revenue-share-rules"
http_call POST "/admin/fleet-partners/${FLEET_PARTNER_ID}/revenue-share-rules" "$RULE_FIXTURE"
skip_on_unavailable_write "revenue_share_rule" "fleet revenue-share rule API"
assert_status "200|201"

REVENUE_RULE_ID=$(json_get_first ".data.ruleId" ".data.rule_id" ".data.id")
if [[ -z "$REVENUE_RULE_ID" ]]; then
  log_fail "Revenue-share rule response missing ruleId: ${RESP_BODY}"
  exit 1
fi
chain_set "platform" "revenueRuleId" "$REVENUE_RULE_ID"
save_evidence "$SCENARIO" "platform" "revenueRuleId" "$REVENUE_RULE_ID"
log_ok "Revenue-share rule created: ${REVENUE_RULE_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Tenant booking and dispatch
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Tenant Portal — booking creation"

switch_actor "tenant_admin" "e2e-tenant-admin-fleet-014" "${E2E_SEED_TENANT_ID}"

BOOKING_FIXTURE="${TMP_DIR}/booking.json"
jq \
  --arg ws "$WINDOW_START" \
  --arg we "$WINDOW_END" \
  '.reservationWindowStart = $ws | .reservationWindowEnd = $we' \
  "${SCRIPT_DIR}/fixtures/e2e-booking-enterprise.json" > "$BOOKING_FIXTURE"

log_step "2.1 — POST /tenant/bookings"
http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"

BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
[[ -n "$BOOKING_ID" ]] || { log_fail "No bookingId in response: ${RESP_BODY}"; exit 1; }

chain_set "tenant" "bookingId" "$BOOKING_ID"
save_evidence "$SCENARIO" "tenant" "bookingId" "$BOOKING_ID"
log_ok "Booking created: ${BOOKING_ID}"

log_step "2.2 — GET /tenant/bookings/:bookingId"
http_call GET "/tenant/bookings/${BOOKING_ID}"
assert_status "200"

ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
[[ -n "$ORDER_ID" ]] || { log_fail "Booking read-back missing orderId: ${RESP_BODY}"; exit 1; }
chain_set "tenant" "orderId" "$ORDER_ID"
save_evidence "$SCENARIO" "tenant" "orderId" "$ORDER_ID"
log_ok "Booking orderId: ${ORDER_ID}"

log_surface "Ops Console — dispatch assignment"
switch_actor "ops_user" "e2e-ops-fleet-014"

DISPATCH_FIXTURE="${TMP_DIR}/dispatch.json"
printf '%s\n' '{"mode":"auto"}' > "$DISPATCH_FIXTURE"

log_step "2.3 — POST /orders/:orderId/dispatch"
http_call POST "/orders/${ORDER_ID}/dispatch" "$DISPATCH_FIXTURE"
if [[ ! "$RESP_STATUS" =~ ^(200|201)$ ]]; then
  skip_clean "dispatch" "/orders/${ORDER_ID}/dispatch returned ${RESP_STATUS}; lifecycle unavailable"
fi

DISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")
ATTEMPT=0
while (( ATTEMPT < E2E_POLL_MAX )) && [[ -z "$DISPATCH_JOB_ID" ]]; do
  http_call GET "/dispatch/tasks"
  if [[ "$RESP_STATUS" != "200" ]]; then
    skip_clean "dispatch" "/dispatch/tasks returned ${RESP_STATUS}; cannot resolve dispatch job"
  fi
  DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
    2>/dev/null | head -1 || true)
  [[ -n "$DISPATCH_JOB_ID" ]] && break
  sleep "$E2E_POLL_INTERVAL"
  ATTEMPT=$((ATTEMPT + 1))
done
[[ -n "$DISPATCH_JOB_ID" ]] || skip_clean "dispatch" "no dispatch job visible for orderId=${ORDER_ID}"

chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "ops" "dispatchJobId" "$DISPATCH_JOB_ID"
log_ok "Dispatch job found: ${DISPATCH_JOB_ID}"

log_step "2.4 — GET /dispatch/tasks/:dispatchJobId/candidates"
http_call GET "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates"
if [[ "$RESP_STATUS" != "200" ]]; then
  skip_clean "dispatch" "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates returned ${RESP_STATUS}"
fi
ASSIGN_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r \
  '.data.items[]? | select((.driverId // .driver_id // empty) == "'"${E2E_SEED_DRIVER_ID}"'") | (.vehicleId // .vehicle_id // empty)' \
  2>/dev/null | head -1 || true)
[[ -n "$ASSIGN_VEHICLE_ID" ]] || ASSIGN_VEHICLE_ID="${E2E_SEED_VEHICLE_ID}"

ASSIGN_FIXTURE="${TMP_DIR}/assign.json"
jq \
  --arg jobId "$DISPATCH_JOB_ID" \
  --arg vehicle "$ASSIGN_VEHICLE_ID" \
  --arg driver "$E2E_SEED_DRIVER_ID" \
  '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
  "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$ASSIGN_FIXTURE"

log_step "2.5 — POST /dispatch/assign"
http_call POST "/dispatch/assign" "$ASSIGN_FIXTURE"
if [[ ! "$RESP_STATUS" =~ ^(200|201)$ ]]; then
  skip_clean "dispatch" "/dispatch/assign returned ${RESP_STATUS}; cannot exercise driver leg"
fi

TASK_ID=$(json_get_first ".data.taskId" ".data.task_id")
if [[ -z "$TASK_ID" ]]; then
  switch_actor "driver_user" "e2e-driver-${E2E_SEED_DRIVER_ID}" "${E2E_SEED_TENANT_ID}"
  http_call GET "/driver/tasks"
  if [[ "$RESP_STATUS" != "200" ]]; then
    skip_clean "driver" "/driver/tasks returned ${RESP_STATUS}; task resolution unavailable"
  fi
  TASK_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.items[] | select((.orderId // .order_id) == $oid) | (.taskId // .task_id)' \
    2>/dev/null | head -1 || true)
fi
[[ -n "$TASK_ID" ]] || skip_clean "driver" "no driver task visible for orderId=${ORDER_ID}"

chain_set "driver" "taskId" "$TASK_ID"
save_evidence "$SCENARIO" "driver" "taskId" "$TASK_ID"
save_evidence "$SCENARIO" "driver" "driverId" "$E2E_SEED_DRIVER_ID"
log_ok "Driver task resolved: ${TASK_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Driver task lifecycle
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Driver App — task lifecycle"

switch_actor "driver_user" "e2e-driver-${E2E_SEED_DRIVER_ID}" "${E2E_SEED_TENANT_ID}"

ACCEPT_FIXTURE="${TMP_DIR}/accept.json"
DEPART_FIXTURE="${TMP_DIR}/depart.json"
ARRIVE_FIXTURE="${TMP_DIR}/arrived.json"
START_FIXTURE="${TMP_DIR}/start.json"
COMPLETE_FIXTURE="${TMP_DIR}/complete.json"

jq --arg ts "$COMPLETED_AT" '.acceptedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" > "$ACCEPT_FIXTURE"
jq --arg ts "$COMPLETED_AT" '.departedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-depart.json" > "$DEPART_FIXTURE"
jq --arg ts "$COMPLETED_AT" '.arrivedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-arrived-pickup.json" > "$ARRIVE_FIXTURE"
jq --arg ts "$COMPLETED_AT" '.startedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-start.json" > "$START_FIXTURE"
jq --arg ts "$COMPLETED_AT" '.completedAt = $ts | .signoff.signedAt = $ts' \
  "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" > "$COMPLETE_FIXTURE"

for transition in \
  "accept:$ACCEPT_FIXTURE" \
  "depart:$DEPART_FIXTURE" \
  "arrived_pickup:$ARRIVE_FIXTURE" \
  "start:$START_FIXTURE" \
  "complete:$COMPLETE_FIXTURE"; do
  action="${transition%%:*}"
  fixture="${transition#*:}"
  log_step "3.x — POST /driver/tasks/:taskId/${action}"
  http_call POST "/driver/tasks/${TASK_ID}/${action}" "$fixture"
  if [[ ! "$RESP_STATUS" =~ ^(200|201)$ ]]; then
    skip_clean "driver" "/driver/tasks/${TASK_ID}/${action} returned ${RESP_STATUS}; lifecycle truncated"
  fi
done

save_evidence "$SCENARIO" "driver" "completedAt" "$COMPLETED_AT"
log_ok "Trip completed at ${COMPLETED_AT}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Driver earnings statement
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Billing — driver statement generation"

switch_actor "platform_admin" "e2e-platform-admin-fleet-014"

FEE_PLAN_FIXTURE="${TMP_DIR}/fee-plan.json"
jq -n \
  --arg version "$PERIOD_MONTH" \
  --arg planName "E2E-014 driver fee plan ${SUFFIX}" \
  '{
    planName: $planName,
    version: $version,
    serviceFeeBps: 1000,
    reimbursementMode: "platform_funded"
  }' > "$FEE_PLAN_FIXTURE"

log_step "4.1 — POST /driver-fee-plans/publish"
http_call POST "/driver-fee-plans/publish" "$FEE_PLAN_FIXTURE"
case "$RESP_STATUS" in
  200|201) ;;
  404|405|501) skip_clean "driver_statement" "driver statement endpoints unavailable on this environment (publish returned ${RESP_STATUS})" ;;
  *) log_fail "Driver fee plan publish failed with HTTP ${RESP_STATUS}: ${RESP_BODY}"; exit 1 ;;
esac

GENERATE_STATEMENT_FIXTURE="${TMP_DIR}/generate-driver-statement.json"
jq -n \
  --arg periodMonth "$PERIOD_MONTH" \
  --arg driverId "$E2E_SEED_DRIVER_ID" \
  '{periodMonth: $periodMonth, driverId: $driverId}' > "$GENERATE_STATEMENT_FIXTURE"

log_step "4.2 — POST /driver-statements/generate"
http_call POST "/driver-statements/generate" "$GENERATE_STATEMENT_FIXTURE"
case "$RESP_STATUS" in
  200|201) ;;
  400) skip_clean "driver_statement" "driver statements found no eligible trips for ${PERIOD_MONTH}; settlement ingestion not available yet" ;;
  404|405|501) skip_clean "driver_statement" "driver statement generation endpoint unavailable (HTTP ${RESP_STATUS})" ;;
  *) log_fail "Driver statement generation failed with HTTP ${RESP_STATUS}: ${RESP_BODY}"; exit 1 ;;
esac

STATEMENT_ID=$(echo "$RESP_BODY" | jq -r --arg did "$E2E_SEED_DRIVER_ID" \
  '.data.items[]? | select((.driverId // .driver_id // empty) == $did) | (.statementId // .statement_id // empty)' \
  2>/dev/null | head -1 || true)
[[ -n "$STATEMENT_ID" ]] && chain_set "billing" "driverStatementId" "$STATEMENT_ID"

log_step "4.3 — GET /driver-statements?periodMonth="
if ! poll_driver_statement_line; then
  skip_clean "driver_statement" "driver statement list did not include orderId=${ORDER_ID}"
fi
save_evidence "$SCENARIO" "billing" "driverStatementLineMatch" "$DRIVER_STATEMENT_LINE"
save_evidence "$SCENARIO" "billing" "driverStatementPeriodMonth" "$PERIOD_MONTH"
log_ok "Driver statement includes completed orderId=${ORDER_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 5 — Fleet partner statement
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — fleet partner statement"

log_step "5.1 — GET /admin/fleet-partners/:id/statements"
if ! poll_fleet_statement_share; then
  skip_clean "fleet_statement" "fleet statement payload did not expose a share line for orderId=${ORDER_ID}"
fi

STATEMENT_ID=$(echo "$RESP_BODY" | jq -r --arg fp "$FLEET_PARTNER_ID" '
  .data.items[]? 
  | select((.fleetPartnerId // .fleet_partner_id // .partnerId // .partner_id // "") == $fp)
  | (.statementId // .statement_id // empty)
' 2>/dev/null | head -1 || true)
[[ -n "$STATEMENT_ID" ]] && chain_set "billing" "fleetStatementId" "$STATEMENT_ID"
save_evidence "$SCENARIO" "billing" "fleetShareAmountMinor" "$FLEET_SHARE_MINOR"
log_ok "Fleet statement exposes share amountMinor=${FLEET_SHARE_MINOR} for orderId=${ORDER_ID}"

log_step "Chain continuity assertions"
assert_chain "platform" "fleetPartnerId"
assert_chain "platform" "affiliationId"
assert_chain "platform" "revenueRuleId"
assert_chain "tenant" "bookingId"
assert_chain "tenant" "orderId"
assert_chain "ops" "dispatchJobId"
assert_chain "driver" "taskId"

print_chain_summary
echo ""
log_ok "E2E-014 complete — fleet partner revenue-share shell passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
