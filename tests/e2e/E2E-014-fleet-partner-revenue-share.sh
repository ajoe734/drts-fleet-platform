#!/usr/bin/env bash
# E2E-014 — Fleet partner revenue share (WF-FLEET-001)
#
# SD reference: docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md §6 + §9
#   create fleet partner
#   → affiliate driver
#   → create revenue share rule
#   → driver completes trip
#   → driver earnings calculated
#   → fleet partner share calculated
#   → fleet partner statement generated
#
# Surface chain:
#   Platform Admin (fleet master data + revenue share rule)
#   -> Platform Admin (driver settlement / earnings)
#   -> Platform Admin (fleet partner statement)
#   -> Fleet Partner Portal (self-service statement read-back)
#
# Deterministic earnings basis
# ----------------------------
# Fleet partner statements are derived from driver settlement statements, which
# are derived from completed settlement trips. The repo ships a deterministic
# in-memory settlement seed for driver `drv-demo-001` in period `2026-03`
# (orders order-demo-031 / order-demo-032). These completed trips are the
# "driver completes trip" basis for this scenario in both sandbox and staging,
# so the share math is reproducible without depending on a live, same-month
# dispatch landing in the settlement ledger.
#
# The scenario creates its OWN fleet partner, its OWN affiliation for the seeded
# driver, and its OWN all_trips/percent_of_gross rule, then proves the full
# attribution chain end to end against that freshly created partner.
#
# Pass criteria (E2E-014):
#   1. A fleet partner is created and read back by id.
#   2. The seeded earning-bearing driver is affiliated to that fleet partner and
#      shows up in the partner's driver roster.
#   3. A percent_of_gross revenue share rule is created and listed for the partner.
#   4. The driver's settlement statement for the period is generated with a
#      positive gross earning and at least one completed-trip line (driver
#      earnings calculated).
#   5. The fleet partner statement for the period is generated with line items
#      bound to the created rule + affiliation + driver, a positive share amount,
#      a gross-earning basis equal to the driver's gross, and a share amount equal
#      to the sum of per-line round(gross * rateBps / 10000) (fleet share calculated
#      + statement generated).
#   6. The fleet partner portal self-service statement endpoint surfaces the same
#      statement (best-effort: a partner-realm auth rejection downgrades to a warn).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-014"

# Seeded, earning-bearing driver + period (see SETTLEMENT_TRIP_SEED in
# apps/api/src/modules/billing-settlement/billing-settlement.service.ts).
FLEET_DRIVER_ID="${E2E_FLEET_DRIVER_ID:-drv-demo-001}"
FLEET_PERIOD="${E2E_FLEET_PERIOD:-2026-03}"
# percent_of_gross rate in basis points (1000 bps = 10%).
FLEET_RATE_BPS="${E2E_FLEET_RATE_BPS:-1000}"
# Affiliation / rule effective floor — must precede the seeded trip completion.
EFFECTIVE_FROM="${E2E_FLEET_EFFECTIVE_FROM:-2026-01-01T00:00:00.000Z}"

PARTNER_FIXTURE=""
AFFILIATION_FIXTURE=""
RULE_FIXTURE=""
DRIVER_STMT_FIXTURE=""

cleanup() {
  rm -f \
    "${PARTNER_FIXTURE:-}" \
    "${AFFILIATION_FIXTURE:-}" \
    "${RULE_FIXTURE:-}" \
    "${DRIVER_STMT_FIXTURE:-}"
}
trap cleanup EXIT

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-014 — Fleet partner revenue share${RESET}"
echo -e "${BOLD}  driver=${FLEET_DRIVER_ID} period=${FLEET_PERIOD} rateBps=${FLEET_RATE_BPS}${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 1 — Platform Admin: create fleet partner
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — create fleet partner"

switch_actor "platform_admin" "e2e-platform-admin-001"

PARTNER_FIXTURE=$(mktemp /tmp/drts-e2e-014-partner-XXXXXX.json)
# A unique registration number keeps repeat runs from colliding on real backends.
REG_NO="E2E014-$(date +%s | tail -c 7)"
jq -n \
  --arg regNo "$REG_NO" \
  '{
    legalName: "E2E Fleet Partner Revenue Share Co., Ltd.",
    displayName: "E2E Fleet Partner",
    businessRegistrationNo: $regNo,
    contactName: "E2E Fleet Ops",
    contactPhone: "+886-2-5550-0014",
    active: true,
    partnershipType: "fleet_management"
  }' > "$PARTNER_FIXTURE"

log_step "1.1 — POST /admin/fleet-partners"
http_call POST "/admin/fleet-partners" "$PARTNER_FIXTURE"
assert_status "200|201"

FLEET_PARTNER_ID=$(json_get_first ".data.fleetPartnerId" ".data.fleet_partner_id")
if [[ -z "$FLEET_PARTNER_ID" ]]; then
  log_fail "No fleetPartnerId in create response: ${RESP_BODY}"
  exit 1
fi

chain_set "platform_admin" "fleetPartnerId" "$FLEET_PARTNER_ID"
save_evidence "$SCENARIO" "platform_admin" "fleetPartnerId" "$FLEET_PARTNER_ID"

log_step "1.2 — GET /admin/fleet-partners/:fleetPartnerId"
http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}"
assert_status "200"
READBACK_ID=$(json_get_first ".data.fleetPartnerId" ".data.fleet_partner_id")
if [[ "$READBACK_ID" != "$FLEET_PARTNER_ID" ]]; then
  log_fail "Fleet partner read-back id mismatch: want ${FLEET_PARTNER_ID}, got '${READBACK_ID:-<empty>}'"
  exit 1
fi
log_ok "Fleet partner created: ${FLEET_PARTNER_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 2 — Platform Admin: affiliate the earning-bearing driver
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — driver fleet affiliation"

AFFILIATION_FIXTURE=$(mktemp /tmp/drts-e2e-014-affiliation-XXXXXX.json)
jq -n \
  --arg fleetPartnerId "$FLEET_PARTNER_ID" \
  --arg effectiveFrom "$EFFECTIVE_FROM" \
  '{
    fleetPartnerId: $fleetPartnerId,
    affiliationType: "managed_by",
    effectiveFrom: $effectiveFrom,
    effectiveUntil: null
  }' > "$AFFILIATION_FIXTURE"

log_step "2.1 — POST /admin/drivers/:driverId/fleet-affiliations"
http_call POST "/admin/drivers/${FLEET_DRIVER_ID}/fleet-affiliations" "$AFFILIATION_FIXTURE"
assert_status "200|201"

AFFILIATION_ID=$(json_get_first ".data.affiliationId" ".data.affiliation_id")
if [[ -z "$AFFILIATION_ID" ]]; then
  log_fail "No affiliationId in response: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "affiliationId" "$AFFILIATION_ID"
save_evidence "$SCENARIO" "platform_admin" "affiliationId" "$AFFILIATION_ID"

log_step "2.2 — GET /admin/fleet-partners/:fleetPartnerId/drivers (roster contains driver)"
http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}/drivers"
assert_status "200"
ROSTER_HIT=$(echo "$RESP_BODY" | jq -r --arg drv "$FLEET_DRIVER_ID" \
  '[.data.items[]? | select((.driverId // .driver_id) == $drv)] | length' \
  2>/dev/null || echo "0")
if [[ "${ROSTER_HIT:-0}" -lt 1 ]]; then
  log_fail "Driver ${FLEET_DRIVER_ID} not present in fleet partner roster: ${RESP_BODY}"
  exit 1
fi
log_ok "Driver ${FLEET_DRIVER_ID} affiliated: ${AFFILIATION_ID}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 3 — Platform Admin: create revenue share rule
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — revenue share rule"

RULE_FIXTURE=$(mktemp /tmp/drts-e2e-014-rule-XXXXXX.json)
jq -n \
  --arg effectiveFrom "$EFFECTIVE_FROM" \
  --argjson rateBps "$FLEET_RATE_BPS" \
  '{
    appliesTo: "all_trips",
    formula: "percent_of_gross",
    rateBps: $rateBps,
    effectiveFrom: $effectiveFrom,
    effectiveUntil: null
  }' > "$RULE_FIXTURE"

log_step "3.1 — POST /admin/fleet-partners/:fleetPartnerId/revenue-share-rules"
http_call POST "/admin/fleet-partners/${FLEET_PARTNER_ID}/revenue-share-rules" "$RULE_FIXTURE"
assert_status "200|201"

RULE_ID=$(json_get_first ".data.ruleId" ".data.rule_id")
if [[ -z "$RULE_ID" ]]; then
  log_fail "No ruleId in response: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "ruleId" "$RULE_ID"
save_evidence "$SCENARIO" "platform_admin" "ruleId" "$RULE_ID"

log_step "3.2 — GET /admin/fleet-partners/:fleetPartnerId/revenue-share-rules (rule listed)"
http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}/revenue-share-rules"
assert_status "200"
RULE_LISTED=$(echo "$RESP_BODY" | jq -r --arg id "$RULE_ID" \
  '[.data.items[]? | select((.ruleId // .rule_id) == $id)] | length' \
  2>/dev/null || echo "0")
if [[ "${RULE_LISTED:-0}" -lt 1 ]]; then
  log_fail "Created rule ${RULE_ID} not present in rule list: ${RESP_BODY}"
  exit 1
fi
log_ok "Revenue share rule created: ${RULE_ID} (all_trips, percent_of_gross, ${FLEET_RATE_BPS}bps)"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 4 — Platform Admin: driver completes trip -> driver earnings calculated
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — driver settlement / earnings"

DRIVER_STMT_FIXTURE=$(mktemp /tmp/drts-e2e-014-driver-stmt-XXXXXX.json)
jq -n \
  --arg periodMonth "$FLEET_PERIOD" \
  --arg driverId "$FLEET_DRIVER_ID" \
  '{ periodMonth: $periodMonth, driverId: $driverId }' > "$DRIVER_STMT_FIXTURE"

log_step "4.1 — POST /driver-statements/generate"
http_call POST "/driver-statements/generate" "$DRIVER_STMT_FIXTURE"
assert_status "200|201"

log_step "4.2 — GET /driver-statements?periodMonth=${FLEET_PERIOD}"
http_call GET "/driver-statements?periodMonth=${FLEET_PERIOD}"
assert_status "200"

DRIVER_STATEMENT=$(echo "$RESP_BODY" | jq -c --arg drv "$FLEET_DRIVER_ID" \
  'first(.data.items[]? | select((.driverId // .driver_id) == $drv)) // empty' \
  2>/dev/null || true)
if [[ -z "$DRIVER_STATEMENT" ]]; then
  log_fail "No driver statement for ${FLEET_DRIVER_ID} in ${FLEET_PERIOD}: ${RESP_BODY}"
  exit 1
fi

DRIVER_GROSS=$(echo "$DRIVER_STATEMENT" | jq -r '.grossEarning.amountMinor // 0')
DRIVER_NET=$(echo "$DRIVER_STATEMENT" | jq -r '.netAmount.amountMinor // 0')
DRIVER_TRIP_LINES=$(echo "$DRIVER_STATEMENT" | jq -r '[.lines[]? | select((.orderId // "") != "")] | length')
if [[ "${DRIVER_GROSS:-0}" -le 0 ]]; then
  log_fail "Driver gross earning is not positive (${DRIVER_GROSS}): ${DRIVER_STATEMENT}"
  exit 1
fi
if [[ "${DRIVER_TRIP_LINES:-0}" -lt 1 ]]; then
  log_fail "Driver statement has no completed-trip lines: ${DRIVER_STATEMENT}"
  exit 1
fi

chain_set "driver" "driverGrossMinor" "$DRIVER_GROSS"
save_evidence "$SCENARIO" "driver" "grossEarningMinor" "$DRIVER_GROSS"
save_evidence "$SCENARIO" "driver" "netAmountMinor" "$DRIVER_NET"
save_evidence "$SCENARIO" "driver" "completedTripLines" "$DRIVER_TRIP_LINES"
log_ok "Driver earnings calculated: gross=${DRIVER_GROSS} net=${DRIVER_NET} over ${DRIVER_TRIP_LINES} completed trip(s)"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 5 — Platform Admin: fleet partner share + statement
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Platform Admin — fleet partner statement"

log_step "5.1 — GET /admin/fleet-partners/:fleetPartnerId/statements?periodMonth=${FLEET_PERIOD}"
http_call GET "/admin/fleet-partners/${FLEET_PARTNER_ID}/statements?periodMonth=${FLEET_PERIOD}"
assert_status "200"

FLEET_STATEMENT=$(echo "$RESP_BODY" | jq -c --arg pm "$FLEET_PERIOD" \
  'first(.data.items[]? | select(.periodMonth == $pm)) // empty' \
  2>/dev/null || true)
if [[ -z "$FLEET_STATEMENT" ]]; then
  log_fail "No fleet partner statement for ${FLEET_PARTNER_ID} in ${FLEET_PERIOD}: ${RESP_BODY}"
  exit 1
fi

STMT_ID=$(echo "$FLEET_STATEMENT" | jq -r '.statementId // empty')
STMT_FLEET_ID=$(echo "$FLEET_STATEMENT" | jq -r '.fleetPartnerId // empty')
STMT_PAYOUT=$(echo "$FLEET_STATEMENT" | jq -r '.payoutStatus // empty')
STMT_SHARE=$(echo "$FLEET_STATEMENT" | jq -r '.shareAmount.amountMinor // 0')
STMT_GROSS_BASIS=$(echo "$FLEET_STATEMENT" | jq -r '.grossEarningBasis.amountMinor // 0')
STMT_LINES=$(echo "$FLEET_STATEMENT" | jq -r '.lines | length')

if [[ "$STMT_FLEET_ID" != "$FLEET_PARTNER_ID" ]]; then
  log_fail "Statement fleetPartnerId mismatch: want ${FLEET_PARTNER_ID}, got '${STMT_FLEET_ID:-<empty>}'"
  exit 1
fi
if [[ "${STMT_LINES:-0}" -lt 1 ]]; then
  log_fail "Fleet partner statement has no line items: ${FLEET_STATEMENT}"
  exit 1
fi
if [[ -z "$STMT_PAYOUT" ]]; then
  log_fail "Fleet partner statement missing payoutStatus: ${FLEET_STATEMENT}"
  exit 1
fi

# Every line must be attributed to the rule, affiliation, and driver we created.
BAD_LINES=$(echo "$FLEET_STATEMENT" | jq -r \
  --arg rule "$RULE_ID" --arg aff "$AFFILIATION_ID" --arg drv "$FLEET_DRIVER_ID" \
  '[.lines[]? | select(.ruleId != $rule or .affiliationId != $aff or .driverId != $drv)] | length')
if [[ "${BAD_LINES:-1}" -ne 0 ]]; then
  log_fail "Fleet partner statement has lines not bound to rule=${RULE_ID}/affiliation=${AFFILIATION_ID}/driver=${FLEET_DRIVER_ID}: ${FLEET_STATEMENT}"
  exit 1
fi

# Share math: per-line share == round(grossEarning * rateBps / 10000); total == sum.
EXPECTED_SHARE=$(echo "$FLEET_STATEMENT" | jq -r \
  --argjson rate "$FLEET_RATE_BPS" \
  '[.lines[]? | ((((.grossEarning.amountMinor // 0) * $rate) + 5000) / 10000 | floor)] | add // 0')
LINE_GROSS_SUM=$(echo "$FLEET_STATEMENT" | jq -r \
  '[.lines[]? | (.grossEarning.amountMinor // 0)] | add // 0')

if [[ "${STMT_SHARE:-0}" -le 0 ]]; then
  log_fail "Fleet partner share amount is not positive (${STMT_SHARE}): ${FLEET_STATEMENT}"
  exit 1
fi
if [[ "${STMT_SHARE}" != "${EXPECTED_SHARE}" ]]; then
  log_fail "Fleet share mismatch: statement=${STMT_SHARE}, expected sum(round(gross*${FLEET_RATE_BPS}/10000))=${EXPECTED_SHARE}"
  exit 1
fi
if [[ "${STMT_GROSS_BASIS}" != "${LINE_GROSS_SUM}" ]]; then
  log_fail "Gross basis mismatch: statement basis=${STMT_GROSS_BASIS}, sum(line gross)=${LINE_GROSS_SUM}"
  exit 1
fi
# Cross-surface invariant: fleet gross basis == driver statement gross (all_trips rule).
if [[ "${STMT_GROSS_BASIS}" != "${DRIVER_GROSS}" ]]; then
  log_fail "Gross basis (${STMT_GROSS_BASIS}) does not equal driver gross earning (${DRIVER_GROSS})"
  exit 1
fi

chain_set "fleet_partner" "statementId" "$STMT_ID"
chain_set "fleet_partner" "shareAmountMinor" "$STMT_SHARE"
save_evidence "$SCENARIO" "fleet_partner" "statementId" "$STMT_ID"
save_evidence "$SCENARIO" "fleet_partner" "shareAmountMinor" "$STMT_SHARE"
save_evidence "$SCENARIO" "fleet_partner" "grossEarningBasisMinor" "$STMT_GROSS_BASIS"
save_evidence "$SCENARIO" "fleet_partner" "payoutStatus" "$STMT_PAYOUT"
log_ok "Fleet partner share calculated + statement generated: ${STMT_ID} share=${STMT_SHARE} basis=${STMT_GROSS_BASIS} status=${STMT_PAYOUT}"

# ══════════════════════════════════════════════════════════════════════════════
# LEG 6 — Fleet Partner Portal: self-service statement read-back (best-effort)
# ══════════════════════════════════════════════════════════════════════════════
log_surface "Fleet Partner Portal — self-service statements"

switch_actor "partner_api_key" "e2e-fleet-partner-001"
E2E_FLEET_PARTNER_ID="$FLEET_PARTNER_ID"
E2E_EXTRA_SCOPES="billing:read"

log_step "6.1 — GET /fleet-partner/statements?periodMonth=${FLEET_PERIOD}"
http_call GET "/fleet-partner/statements?periodMonth=${FLEET_PERIOD}"
if [[ "${RESP_STATUS}" =~ ^(200|201)$ ]]; then
  PORTAL_SHARE=$(echo "$RESP_BODY" | jq -r --arg id "$STMT_ID" \
    'first(.data.items[]? | select(.statementId == $id)) | .shareAmount.amountMinor // empty' \
    2>/dev/null || true)
  if [[ -z "$PORTAL_SHARE" ]]; then
    log_fail "Portal statement list does not surface statement ${STMT_ID}: ${RESP_BODY}"
    exit 1
  fi
  if [[ "$PORTAL_SHARE" != "$STMT_SHARE" ]]; then
    log_fail "Portal share (${PORTAL_SHARE}) disagrees with admin share (${STMT_SHARE})"
    exit 1
  fi
  save_evidence "$SCENARIO" "fleet_partner_portal" "shareAmountMinor" "$PORTAL_SHARE"
  log_ok "Fleet partner portal surfaces the same statement: share=${PORTAL_SHARE}"
elif [[ "${RESP_STATUS}" =~ ^(401|403)$ ]]; then
  log_warn "Fleet partner portal self-service rejected (HTTP ${RESP_STATUS}); partner-realm bootstrap may be gated in this environment. Admin statement evidence stands."
  save_evidence "$SCENARIO" "fleet_partner_portal" "selfServiceAccess" "gated_http_${RESP_STATUS}"
else
  log_fail "Unexpected status from portal statements: HTTP ${RESP_STATUS} — ${RESP_BODY}"
  exit 1
fi

print_chain_summary
log_ok "E2E-014 completed."
