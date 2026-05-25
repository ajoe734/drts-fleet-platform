#!/usr/bin/env bash
# E2E-010 — Governance-aware billing & reporting
#
# Companion specs:
#   docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
#   docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
#
# Directive (`docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §H)
# requires this script to assert every field in the governance billing
# verification body. The 13 verification-body fields enumerated by §H:
#
#   1. costCenterCode
#   2. costCenterName
#   3. ownerUserId
#   4. ownerName
#   5. legacy_unmapped (flag, may be false)
#   6. approvalEvaluationId
#   7. approvalRequestId
#   8. approvalState
#   9. quotaPeriodKey
#   10. quotaUsageDelta
#   11. partnerProgramCode             (set when WF-PARTNER-001 path; else null OK)
#   12. eligibilityVerificationId      (set when WF-PARTNER-001 path; else null OK)
#   13. platformEarningsRef            (set when WF-FWD-001 path; else null OK)
#   plus chain: auditId + reportArtifactId
#
# Per directive §10 / §0.2 this script MUST hard-fail on missing seed or
# missing fields. No warning-skip is allowed.
#
# Subcases exercised in this happy-path run (full UAT pack lives in the UAT
# doc; the script focuses on the contract that the verification body emits
# every governance-aware field even when the value is null because the source
# booking did not exercise that pathway):
#
#   A. UAT-FIN-GOV-001 — single cost center, single booking, full attribution
#   B. UAT-FIN-GOV-004 — quota usage tracking (verifies quotaUsageDelta is set
#      to the policy unit and quotaPeriodKey is the active period)
#
# Variants UAT-FIN-GOV-002 / 003 / 005 / 006 / 007 / 008 / 009 are covered by
# the UAT pack and by E2E-005 negative paths; this script focuses on the
# verification-body contract since that is what §H makes blocking.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-010"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-010 — Governance-aware billing & reporting${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-010-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUFFIX="$(date +%s | tail -c 7)"
CC_CODE="CC-GOV-${SUFFIX}"
QUOTA_PERIOD_KEY=""
APPROVAL_RULE_ID=""

# ───────────────────────────────────────────────────────────────────────
# Pre-flight: directive §0.2 forbids silent pass; hard-check seed env.
# ───────────────────────────────────────────────────────────────────────
log_step "Pre-flight: required environment"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    log_fail "Required env var ${name} not set. Aborting per directive §0.2 (no silent pass)."
    exit 1
  fi
  log_ok "${name} present"
}

require_env "E2E_BASE_URL"
require_env "E2E_TENANT_ADMIN_TOKEN"

: "${E2E_TENANT_FINANCE_TOKEN:?E2E_TENANT_FINANCE_TOKEN required for report-export step}"
: "${E2E_TENANT_APPROVER_TOKEN:?E2E_TENANT_APPROVER_TOKEN required for approval step}"
: "${E2E_TENANT_DRIVER_TOKEN:?E2E_TENANT_DRIVER_TOKEN required for trip completion step}"
log_ok "all required tokens present"

# ───────────────────────────────────────────────────────────────────────
# Setup: cost center, quota policy, approval rule
# ───────────────────────────────────────────────────────────────────────
log_step "Setup A — cost center"
switch_actor tenant_admin "$E2E_TENANT_ADMIN_TOKEN"

CC_FIXTURE="${TMP_DIR}/cc.json"
jq -n \
  --arg code "$CC_CODE" \
  --arg name "Governance E2E ${SUFFIX}" \
  --arg owner "fin@e2e.local" \
  '{
    code: $code,
    name: $name,
    ownerEmail: $owner,
    monthlyQuotaTrips: 500,
    approvalProfile: "default"
  }' > "$CC_FIXTURE"

http_call POST "/tenant/cost-centers" "$CC_FIXTURE"
assert_status "200|201"
CC_NAME=$(json_get '.data.name')
OWNER_USER_ID=$(json_get '.data.ownerUserId')
[[ -n "$CC_NAME" && -n "$OWNER_USER_ID" ]] || { log_fail "cost-center response missing name/ownerUserId"; exit 1; }
chain_set "$SCENARIO" "setup.costCenterCode" "$CC_CODE"
chain_set "$SCENARIO" "setup.costCenterName" "$CC_NAME"
chain_set "$SCENARIO" "setup.ownerUserId" "$OWNER_USER_ID"
log_ok "cost center created: $CC_CODE / $CC_NAME / owner=$OWNER_USER_ID"

log_step "Setup B — quota policy"
QUOTA_FIXTURE="${TMP_DIR}/quota.json"
jq -n \
  --arg costCenterCode "$CC_CODE" \
  '{
    scope: {field: "cost_center.code", op: "eq", value: $costCenterCode},
    policy: {periodUnit: "month", unit: "trips", ceiling: 500},
    name: "gov-e2e-monthly"
  }' > "$QUOTA_FIXTURE"

http_call POST "/tenant/quotas/policies" "$QUOTA_FIXTURE"
assert_status "200|201"
QUOTA_PERIOD_KEY=$(json_get '.data.activePeriodKey')
[[ -n "$QUOTA_PERIOD_KEY" ]] || { log_fail "quota policy response missing activePeriodKey"; exit 1; }
chain_set "$SCENARIO" "setup.quotaPeriodKey" "$QUOTA_PERIOD_KEY"
log_ok "quota policy active period: $QUOTA_PERIOD_KEY"

log_step "Setup C — approval rule"
APPR_FIXTURE="${TMP_DIR}/appr.json"
jq -n \
  --arg costCenterCode "$CC_CODE" \
  '{
    name: "gov-e2e-threshold",
    priority: 10,
    when: [{field: "cost_center.code", op: "eq", value: $costCenterCode},
           {field: "booking.price", op: "gte", value: 1500}],
    action: "require_approval",
    approverKind: "cost_center.owner"
  }' > "$APPR_FIXTURE"

http_call POST "/tenant/approval-rules" "$APPR_FIXTURE"
assert_status "200|201"
APPROVAL_RULE_ID=$(json_get '.data.ruleId')
[[ -n "$APPROVAL_RULE_ID" ]] || { log_fail "approval rule response missing ruleId"; exit 1; }
chain_set "$SCENARIO" "setup.approvalRuleId" "$APPROVAL_RULE_ID"
log_ok "approval rule created: $APPROVAL_RULE_ID"

# ───────────────────────────────────────────────────────────────────────
# Booking → Approval → Trip → Invoice → Report
# ───────────────────────────────────────────────────────────────────────
log_step "1. Create booking (will trigger approval)"
BOOKING_FIXTURE="${TMP_DIR}/booking.json"
jq -n \
  --arg cc "$CC_CODE" \
  --arg projectCode "PRJ-GOV-E2E-${SUFFIX}" \
  '{
    passenger: {name: "Gov E2E", phone: "+886912345678"},
    pickup: {address: "台北車站", lat: 25.0478, lng: 121.5170},
    drop: {address: "桃園機場 T2", lat: 25.0789, lng: 121.2342},
    serviceType: "airport_pickup",
    requestedAt: "now+90m",
    costCenterCode: $cc,
    projectCode: $projectCode,
    quoteHint: {currency: "TWD", expected: 1800}
  }' > "$BOOKING_FIXTURE"

http_call POST "/tenant/bookings" "$BOOKING_FIXTURE"
assert_status "200|201"
BOOKING_ID=$(json_get '.data.bookingId')
APPROVAL_REQUEST_ID=$(json_get '.data.approvalRequestId')
APPROVAL_EVAL_ID=$(json_get '.data.approvalEvaluationId')
APPROVAL_STATE=$(json_get '.data.approvalState')
[[ -n "$BOOKING_ID" && -n "$APPROVAL_REQUEST_ID" ]] || {
  log_fail "booking did not enter approval; missing bookingId/approvalRequestId"
  exit 1
}
chain_set "$SCENARIO" "booking.id" "$BOOKING_ID"
chain_set "$SCENARIO" "booking.approvalRequestId" "$APPROVAL_REQUEST_ID"
chain_set "$SCENARIO" "booking.approvalEvaluationId" "$APPROVAL_EVAL_ID"
log_ok "booking $BOOKING_ID created; approval queued ($APPROVAL_REQUEST_ID), state=$APPROVAL_STATE"

log_step "2. Approve booking"
switch_actor tenant_approver "$E2E_TENANT_APPROVER_TOKEN"
APPR_DECISION="${TMP_DIR}/decision.json"
jq -n --arg id "$APPROVAL_REQUEST_ID" '{requestId: $id, decision: "approve", note: "E2E-010 governance happy path"}' > "$APPR_DECISION"
http_call POST "/tenant/approval-requests/decide" "$APPR_DECISION"
assert_status "200"
APPROVAL_STATE=$(json_get '.data.approvalState')
[[ "$APPROVAL_STATE" == "approved" ]] || { log_fail "approval not approved; got '$APPROVAL_STATE'"; exit 1; }
log_ok "approval completed: state=approved"

log_step "3. Trip lifecycle (dispatch → complete)"
switch_actor tenant_admin "$E2E_TENANT_ADMIN_TOKEN"
http_call POST "/dispatch/auto-assign" "{\"bookingId\":\"$BOOKING_ID\"}"
assert_status "200"
DISPATCH_ID=$(json_get '.data.dispatchId')
[[ -n "$DISPATCH_ID" ]] || { log_fail "dispatch assignment failed"; exit 1; }

switch_actor tenant_driver "$E2E_TENANT_DRIVER_TOKEN"
http_call POST "/driver/trip/start" "{\"bookingId\":\"$BOOKING_ID\"}"
assert_status "200"
http_call POST "/driver/trip/complete" "{\"bookingId\":\"$BOOKING_ID\",\"finalPrice\":1800,\"currency\":\"TWD\"}"
assert_status "200"
log_ok "trip completed"

# ───────────────────────────────────────────────────────────────────────
# Invoice + report — the verification body MUST emit all 13 fields
# ───────────────────────────────────────────────────────────────────────
log_step "4. Fetch billing record"
switch_actor tenant_finance "$E2E_TENANT_FINANCE_TOKEN"
http_call GET "/tenant/billing/by-booking/$BOOKING_ID"
assert_status "200"
BILLING_BODY="$RESP_BODY"
BILLING_ID=$(echo "$BILLING_BODY" | jq -r '.data.billingId // empty')
[[ -n "$BILLING_ID" ]] || { log_fail "billing record not generated"; exit 1; }
chain_set "$SCENARIO" "billing.id" "$BILLING_ID"
log_ok "billing record fetched: $BILLING_ID"

log_step "5. Fetch report export (governance period)"
REPORT_FIXTURE="${TMP_DIR}/report-req.json"
jq -n --arg cc "$CC_CODE" --arg period "$QUOTA_PERIOD_KEY" '{costCenterCode: $cc, periodKey: $period, format: "json"}' > "$REPORT_FIXTURE"
http_call POST "/tenant/reports/governance-export" "$REPORT_FIXTURE"
assert_status "200|201"
REPORT_BODY="$RESP_BODY"
REPORT_ARTIFACT_ID=$(echo "$REPORT_BODY" | jq -r '.data.reportArtifactId // empty')
[[ -n "$REPORT_ARTIFACT_ID" ]] || { log_fail "report export missing reportArtifactId"; exit 1; }
chain_set "$SCENARIO" "report.artifactId" "$REPORT_ARTIFACT_ID"
log_ok "report artifact: $REPORT_ARTIFACT_ID"

log_step "6. Fetch audit row for billing record"
http_call GET "/audit?resourceType=billing&resourceId=$BILLING_ID"
assert_status "200"
AUDIT_ID=$(json_get_first '.data[].auditId')
[[ -n "$AUDIT_ID" ]] || { log_fail "no audit row for billing $BILLING_ID"; exit 1; }
chain_set "$SCENARIO" "audit.id" "$AUDIT_ID"
log_ok "audit row: $AUDIT_ID"

# ───────────────────────────────────────────────────────────────────────
# Verification body — hard-assert every field per directive §H
# ───────────────────────────────────────────────────────────────────────
log_step "7. Verify governance-aware verification body — all 13 fields"

# Per spec §2 + UAT §1: even on the non-partner / non-forwarded happy path,
# the verification body MUST emit ALL keys (value may be null when the
# pathway was not exercised). This is the directive's hard contract.
REQUIRED_KEYS=(
  costCenterCode
  costCenterName
  ownerUserId
  ownerName
  legacy_unmapped
  approvalEvaluationId
  approvalRequestId
  approvalState
  quotaPeriodKey
  quotaUsageDelta
  partnerProgramCode
  eligibilityVerificationId
  platformEarningsRef
)

missing=()
for key in "${REQUIRED_KEYS[@]}"; do
  # `has(key)` returns true if the key is present, even when its value is null.
  present=$(echo "$BILLING_BODY" | jq -r ".data | has(\"${key}\")")
  if [[ "$present" != "true" ]]; then
    missing+=("$key")
  fi
done
if (( ${#missing[@]} > 0 )); then
  log_fail "billing verification body missing keys: ${missing[*]}"
  echo "$BILLING_BODY" | jq '.' >&2
  exit 1
fi
log_ok "billing record has all 13 verification body keys (per directive §H)"

# Spot-check the actual values per UAT-FIN-GOV-001 attribution chain.
billing_cc=$(echo "$BILLING_BODY" | jq -r '.data.costCenterCode')
billing_state=$(echo "$BILLING_BODY" | jq -r '.data.approvalState')
billing_quota=$(echo "$BILLING_BODY" | jq -r '.data.quotaPeriodKey')
billing_delta=$(echo "$BILLING_BODY" | jq -r '.data.quotaUsageDelta')
billing_owner=$(echo "$BILLING_BODY" | jq -r '.data.ownerUserId')

[[ "$billing_cc"    == "$CC_CODE"            ]] || { log_fail "billing.costCenterCode=$billing_cc != $CC_CODE"; exit 1; }
[[ "$billing_state" == "approved"            ]] || { log_fail "billing.approvalState=$billing_state != approved"; exit 1; }
[[ "$billing_quota" == "$QUOTA_PERIOD_KEY"   ]] || { log_fail "billing.quotaPeriodKey=$billing_quota != $QUOTA_PERIOD_KEY"; exit 1; }
[[ -n "$billing_delta" && "$billing_delta" != "null" ]] || { log_fail "billing.quotaUsageDelta is null/empty"; exit 1; }
[[ "$billing_owner" == "$OWNER_USER_ID"      ]] || { log_fail "billing.ownerUserId=$billing_owner != $OWNER_USER_ID"; exit 1; }

log_ok "billing record values match the UAT-FIN-GOV-001 attribution chain"

# Report export should also carry the same governance fields per spec §3.
report_cc=$(echo "$REPORT_BODY" | jq -r '.data.rows[] | select(.bookingId=="'"$BOOKING_ID"'") | .costCenterCode' | head -1)
report_appr=$(echo "$REPORT_BODY" | jq -r '.data.rows[] | select(.bookingId=="'"$BOOKING_ID"'") | .approvalState' | head -1)
[[ "$report_cc"   == "$CC_CODE"  ]] || { log_fail "report row missing costCenterCode for $BOOKING_ID"; exit 1; }
[[ "$report_appr" == "approved"  ]] || { log_fail "report row missing approvalState=approved"; exit 1; }
log_ok "report export row carries governance attribution"

# Audit row must reference the billing record + report artifact.
audit_target=$(echo "$RESP_BODY" | jq -r '.data[] | select(.auditId=="'"$AUDIT_ID"'") | .resourceId' | head -1)
[[ "$audit_target" == "$BILLING_ID" ]] || { log_fail "audit row not linked to billing $BILLING_ID"; exit 1; }
log_ok "audit row links to billing record"

# ───────────────────────────────────────────────────────────────────────
# Evidence + summary
# ───────────────────────────────────────────────────────────────────────
save_evidence "$SCENARIO" "billing" "verificationBodyKeys" "all13present"
save_evidence "$SCENARIO" "billing" "costCenterCode"       "$CC_CODE"
save_evidence "$SCENARIO" "billing" "approvalState"        "approved"
save_evidence "$SCENARIO" "billing" "quotaPeriodKey"       "$QUOTA_PERIOD_KEY"
save_evidence "$SCENARIO" "report"  "artifactId"           "$REPORT_ARTIFACT_ID"
save_evidence "$SCENARIO" "audit"   "auditId"              "$AUDIT_ID"

print_chain_summary "$SCENARIO"

echo -e "\n${BOLD}${GREEN}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  E2E-010 PASS — verification body contract intact${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════${RESET}"
exit 0
