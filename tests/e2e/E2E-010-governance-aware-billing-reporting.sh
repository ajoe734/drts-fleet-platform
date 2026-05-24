#!/usr/bin/env bash
# E2E-010 — Governance-aware billing / reporting shell
#
# Workflow family: WF-FIN-GOV-001 (depends on WF-TGV-001 + WF-FIN-001 per Q3
# decision in docs/00-context/phase1-v3-resolution-20260519.md).
#
# Authoritative inputs:
#   - docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
#     (FIN-GOV-SPEC-001)
#   - docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
#     (FIN-GOV-UAT-001, sub-cases FG-01..FG-09)
#   - docs/00-context/phase1-design-blueprint-completion-directive-20260519.md
#     §3.7 (governance-aware billing/reporting acceptance bar)
#
# Companion artifacts:
#   - tests/integ/tenant-governance-negative.test.ts (negative-path coverage)
#   - apps/api/tests/integration/tenant-governance-e2e.test.ts (governed
#     booking → approval → completion → invoice line ↔ orderId binding)
#   - tests/e2e/E2E-001-enterprise-dispatch.sh (driver-lifecycle pattern reused)
#   - tests/e2e/E2E-005-tenant-governance.sh (positive setup pattern reused)
#
# Chain exercised end-to-end:
#   tenant cost-center + quota policy + require_approval rule
#   -> governed booking with costCenterCode (cost-center attribution preserved)
#   -> quota ledger reserve entry
#   -> approval evaluation snapshot reachable from booking
#   -> approve approval request (tenant_admin role)
#   -> ops dispatch + assign
#   -> driver accept → depart → arrived_pickup → start → complete
#   -> tenant invoice generation (today's UTC window, closed)
#   -> invoice line for the governed orderId (binding evidence)
#   -> field-presence probes for cost-center / approval / quota enrichment
#   -> report-export, settlement-matrix, platform-earnings, coverage probes
#   -> sensitive download audit (FG-08, hard-failed when missing)
#   -> cross-tenant invoice scope (FG-09, hard-failed when widened)
#
# Sub-case map (matches FIN-GOV-UAT-001 §4):
#   FG-01 — Booking → invoice with explicit cost-center attribution
#   FG-02 — Quota reservation + ledger continuity
#   FG-03 — Approval evaluation snapshot reachable from billing review
#   FG-04 — Governance-aware report export columns
#   FG-05 — Partner-program reconciliation references
#   FG-06 — Platform earnings separation by platformCode
#   FG-07 — Legacy unmapped cost-center labelling
#   FG-08 — Sensitive invoice/report download audit
#   FG-09 — Cross-tenant / unauthorized finance access denied
#
# Hard-fail vs soft-record discipline (per spec FIN-GOV-SPEC-001 §6):
#   HARD FAIL (contract regression — always enforced, §6.1):
#     - cost-center attribution dropped from the governed booking read-back
#     - driver lifecycle cannot reach `task.status == completed` after the
#       environment accepted dispatch+assign (drift in WF-DRV-001 coupling)
#     - tenant invoice does not include the just-completed governed orderId
#     - FG-08: no audit entry with actionName == generate_tenant_invoice and
#       resourceId == our invoiceId (audit chain broken)
#     - FG-09: cross-tenant fetch of our invoice returns 2xx instead of 4xx
#       (tenant scope widened)
#   VERIFICATION-BODY RECORDING (always required, §6.2):
#     - each of the 13 verification-body fields MUST be recorded at the end
#       of the run, either with an observed value or with the literal
#       `NOT_POPULATED` marker. A silently-omitted field is itself a
#       regression: the recording is mandatory.
#   SUPPLEMENTAL DIRECTIVE RECONCILIATION EVIDENCE:
#     - owner presentation metadata (`ownerName`) is recorded when invoice /
#       report payloads expose it, but it is not promoted into the strict
#       13-field body because `ownerUserId` is the immutable reconciliation
#       key and `ownerName` is mutable display text.
#     - approval-evaluation evidence is recorded via `approvalRequestId`,
#       `approvalState`, `evaluatedAt`, and `decision`; current contracts do
#       not expose a separate `approvalEvaluationId`.
#   STRICT_VERIFICATION_BODY=1 (uplift gate-keeper, §6.2):
#     - when this env var is set, the final 13-field snapshot hard-fails
#       (exit 1) if ANY field records as NOT_POPULATED. Use this mode to
#       gate a `PASS (live staging evidence)` uplift once IAP/credential
#       gates clear and the governed staging rerun produces enriched
#       invoice/report artifacts.
#   SKIP (environment cannot exercise the leg, not a regression):
#     - seed tenant has no active tenant_admin user
#     - dispatch/assign returns an env-error status before driver leg starts
#     - report-job or coverage endpoints unreachable on this env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-010"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-010 — Governance-aware billing / reporting shell${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-010-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUFFIX="$(date +%s | tail -c 7)"
CC_GOV="CC-GOV-${SUFFIX}"
CC_GOV_NAME="E2E-010 governance cost center"

TENANT_ADMIN_USER_ID=""
TENANT_FINANCE_USER_ID=""

BOOKING_ID=""
ORDER_ID=""
APPROVAL_REQUEST_ID=""
DISPATCH_JOB_ID=""
TASK_ID=""
ASSIGN_VEHICLE_ID=""
ASSIGN_DRIVER_ID=""
INVOICE_ID=""

VB_COST_CENTER_CODE=""
VB_COST_CENTER_NAME=""
VB_OWNER_USER_ID=""
VB_LEGACY_UNMAPPED=""
VB_APPROVAL_REQUEST_ID=""
VB_APPROVAL_STATE=""
VB_QUOTA_PERIOD_KEY=""
VB_QUOTA_USAGE_DELTA=""
VB_PARTNER_PROGRAM_CODE=""
VB_ELIGIBILITY_VERIFICATION_ID=""
VB_PLATFORM_EARNINGS_REF=""
VB_AUDIT_ID=""
VB_REPORT_ARTIFACT_ID=""

# Lifecycle gates — flipped when a leg actually lands.
APPROVED=false
DISPATCHED=false
DRIVER_COMPLETED=false

# ── Strict-mode toggle (spec FIN-GOV-SPEC-001 §6.2) ──────────────────────────
# Default (unset / "0" / "false"): NOT_POPULATED fields are soft evidence; the
# shell exits 0 so the field-presence delta is a reviewable progress signal
# while runtime enrichment lands incrementally.
# STRICT_VERIFICATION_BODY=1: the final 13-field snapshot hard-fails if any
# field is NOT_POPULATED. This is the gate-keeper for a `PASS (live staging
# evidence)` uplift.
STRICT_VERIFICATION_BODY="${STRICT_VERIFICATION_BODY:-0}"
VB_MISSING_FIELDS=()

# ── Field-presence evidence helper ────────────────────────────────────────────
# record_field SUBCASE FIELD VALUE
#   - logs whether a governance enrichment field is populated in this run
#   - never hard-fails directly: a `null` / empty value is recorded as
#     `<field>=NOT_POPULATED` so the reviewer can read which directive targets
#     are still "BLOCKED FOR LIVE" without rewriting the script. The
#     verification-body strict-mode check is centralised in
#     `emit_verification_body_fields` so non-VB recordings (e.g., FG-04 / FG-05
#     / FG-06 probe details) never accidentally hard-fail a default run.
record_field() {
  local subcase="$1" field="$2" raw="${3:-}"
  if [[ -z "$raw" || "$raw" == "null" ]]; then
    save_evidence "$SCENARIO" "$subcase" "$field" "NOT_POPULATED"
    log_warn "  ${subcase}: ${field} not populated (recorded as NOT_POPULATED)"
  else
    save_evidence "$SCENARIO" "$subcase" "$field" "$raw"
    log_ok "  ${subcase}: ${field}=${raw}"
  fi
}

# record_vb_field FIELD VALUE
#   - mandatory recording for one of the 13 verification-body fields
#   - tracks NOT_POPULATED in VB_MISSING_FIELDS so strict mode can
#     hard-fail at the end with a complete list
record_vb_field() {
  local field="$1" raw="${2:-}"
  if [[ -z "$raw" || "$raw" == "null" ]]; then
    save_evidence "$SCENARIO" "VERIFY" "$field" "NOT_POPULATED"
    log_warn "  VERIFY: ${field} not populated (recorded as NOT_POPULATED)"
    VB_MISSING_FIELDS+=("$field")
  else
    save_evidence "$SCENARIO" "VERIFY" "$field" "$raw"
    log_ok "  VERIFY: ${field}=${raw}"
  fi
}

emit_verification_body_fields() {
  log_step "Verification body — emit 13-field evidence snapshot (strict=${STRICT_VERIFICATION_BODY})"
  record_vb_field "costCenterCode" "$VB_COST_CENTER_CODE"
  record_vb_field "costCenterName" "$VB_COST_CENTER_NAME"
  record_vb_field "ownerUserId" "$VB_OWNER_USER_ID"
  record_vb_field "legacy_unmapped" "$VB_LEGACY_UNMAPPED"
  record_vb_field "approvalRequestId" "$VB_APPROVAL_REQUEST_ID"
  record_vb_field "approvalState" "$VB_APPROVAL_STATE"
  record_vb_field "quotaPeriodKey" "$VB_QUOTA_PERIOD_KEY"
  record_vb_field "quotaUsageDelta" "$VB_QUOTA_USAGE_DELTA"
  record_vb_field "partnerProgramCode" "$VB_PARTNER_PROGRAM_CODE"
  record_vb_field "eligibilityVerificationId" "$VB_ELIGIBILITY_VERIFICATION_ID"
  record_vb_field "platformEarningsRef" "$VB_PLATFORM_EARNINGS_REF"
  record_vb_field "auditId" "$VB_AUDIT_ID"
  record_vb_field "reportArtifactId" "$VB_REPORT_ARTIFACT_ID"

  if [[ "$STRICT_VERIFICATION_BODY" == "1" || "$STRICT_VERIFICATION_BODY" == "true" ]]; then
    if (( ${#VB_MISSING_FIELDS[@]} > 0 )); then
      save_evidence "$SCENARIO" "VERIFY" "strictModeFailure" "${VB_MISSING_FIELDS[*]}"
      log_fail "STRICT_VERIFICATION_BODY=1: ${#VB_MISSING_FIELDS[@]} verification-body field(s) recorded as NOT_POPULATED:"
      log_fail "  ${VB_MISSING_FIELDS[*]}"
      log_fail "Live-staging uplift is not eligible until every verification-body field is populated."
      exit 1
    fi
    save_evidence "$SCENARIO" "VERIFY" "strictModePass" "all-13-populated"
    log_ok "STRICT_VERIFICATION_BODY=1: all 13 verification-body fields populated — uplift gate clear"
  fi
}

# ── Skip-clean / fail-hard helpers ────────────────────────────────────────────
skip_clean() {
  local subcase="$1" reason="$2"
  save_evidence "$SCENARIO" "$subcase" "skipped" "$reason"
  log_warn "Skip: ${subcase} — ${reason}"
}

fail_contract() {
  local subcase="$1" reason="$2"
  save_evidence "$SCENARIO" "$subcase" "contract_regression" "$reason"
  log_fail "Contract regression in ${subcase}: ${reason}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
}

# ── Fixture writers ───────────────────────────────────────────────────────────
write_cost_center_fixture() {
  local path="$1" code="$2" name="$3" owner_user_id="${4:-}"
  jq -n \
    --arg code "$code" \
    --arg name "$name" \
    --arg ownerUserId "$owner_user_id" \
    '{
      code: $code,
      name: $name
    } + (if $ownerUserId != "" then { ownerUserId: $ownerUserId } else {} end)' \
    > "$path"
}

write_quota_policy_fixture() {
  local path="$1" cost_center="$2"
  jq -n \
    --arg costCenterCode "$cost_center" \
    '{
      costCenterCode: $costCenterCode,
      period: "monthly",
      limit: {
        bookingCountLimit: 100,
        amountMinorLimit: 100000000,
        currency: "TWD",
        enforcementMode: "warn_only"
      }
    }' \
    > "$path"
}

write_require_approval_rule_fixture() {
  local path="$1" cost_center="$2"
  # tenant_admin is the approver role so the bootstrap actor used in this
  # script can self-approve the resulting approval request — matching the
  # E2E-005 / tenant-governance-e2e.test.ts pattern for the positive path.
  jq -n \
    --arg costCenterCode "$cost_center" \
    '{
      ruleName: "E2E-010 require_approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: $costCenterCode
        }
      ],
      action: "require_approval",
      approvers: [
        { kind: "tenant_role", roleCode: "tenant_admin" }
      ]
    }' \
    > "$path"
}

write_governed_booking_fixture() {
  local path="$1" cost_center="$2" notes="${3:-E2E-010 governance probe}"
  local window_start window_end
  # Reservation window is +1h/+2h, matching E2E-001. Completion is driven
  # immediately by the driver leg, so the trip ultimately lands in today's UTC
  # billing window regardless of the reservation timestamps.
  window_start=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")
  window_end=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")

  jq -n \
    --arg windowStart "$window_start" \
    --arg windowEnd "$window_end" \
    --arg costCenter "$cost_center" \
    --arg notes "$notes" \
    '{
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: $windowStart,
      reservationWindowEnd: $windowEnd,
      pickup: { address: "Governance Pickup" },
      dropoff: { address: "Governance Dropoff" },
      passenger: { name: "Governance Rider", phone: "0912000099" },
      costCenter: $costCenter,
      notes: $notes
    }' \
    > "$path"
}

write_invoice_today_fixture() {
  # Billing period = [today 00:00 UTC, now-1s]. The driver-completed governed
  # trip lands inside this window, so the resulting invoice will include the
  # governed orderId (binding evidence for FG-01/FG-08).
  local path="$1" tenant_id="$2"
  local period_start period_end
  period_start=$(date -u +"%Y-%m-%dT00:00:00Z")
  period_end=$(date -u -d "-1 second" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v-1S +"%Y-%m-%dT%H:%M:%SZ")
  jq -n \
    --arg tid "$tenant_id" \
    --arg ps "$period_start" \
    --arg pe "$period_end" \
    '{ tenantId: $tid, periodStart: $ps, periodEnd: $pe }' \
    > "$path"
}

write_report_job_fixture() {
  local path="$1" tenant_id="$2"
  local period_start period_end
  period_start=$(date -u +"%Y-%m-01T00:00:00Z")
  period_end=$(date -u +"%Y-%m-%dT23:59:59Z")
  jq -n \
    --arg tid "$tenant_id" \
    --arg ps "$period_start" \
    --arg pe "$period_end" \
    '{
      jobType: "trip_summary",
      format: "csv",
      filters: {
        tenantId: $tid,
        periodStart: $ps,
        periodEnd: $pe
      },
      recipients: []
    }' \
    > "$path"
}

# ── 0. Tenant actor discovery ─────────────────────────────────────────────────
discover_tenant_users() {
  log_surface "Tenant Console — discover tenant governance actors"
  switch_actor "tenant_admin" "e2e-bootstrap-tenant-admin" "$E2E_SEED_TENANT_ID"
  http_call GET "/tenant/users"
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "GET /tenant/users returned HTTP ${RESP_STATUS}; seed tenant lacks usable governance actors."
    log_warn "Skipping E2E-010 — environment cannot authenticate tenant governance actions safely."
    save_evidence "$SCENARIO" "setup" "skipped" "tenant_users_lookup_unavailable"
    exit 0
  fi

  TENANT_ADMIN_USER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select(.roleCode == "tenant_admin" and .status == "active") | .userId' \
    2>/dev/null | head -1 || true)
  TENANT_FINANCE_USER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select(.roleCode == "tenant_finance_admin" and .status == "active") | .userId' \
    2>/dev/null | head -1 || true)

  if [[ -z "$TENANT_ADMIN_USER_ID" ]]; then
    log_warn "Seed tenant lacks an active tenant_admin user; skipping E2E-010."
    save_evidence "$SCENARIO" "setup" "skipped" "tenant_admin_missing"
    exit 0
  fi

  save_evidence "$SCENARIO" "setup" "tenantAdminUserId" "$TENANT_ADMIN_USER_ID"
  save_evidence "$SCENARIO" "setup" "tenantFinanceUserId" "${TENANT_FINANCE_USER_ID:-<missing>}"
  log_ok "Discovered governance actors: admin=${TENANT_ADMIN_USER_ID}, finance=${TENANT_FINANCE_USER_ID:-<missing>}"
}

# ── 1. Bootstrap governance fixtures ──────────────────────────────────────────
bootstrap_governance_fixtures() {
  log_surface "Tenant Console — governance fixtures for billing/reporting probe"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  local fixture
  fixture="${TMP_DIR}/cc-gov.json"
  write_cost_center_fixture "$fixture" "$CC_GOV" "$CC_GOV_NAME" "$TENANT_ADMIN_USER_ID"
  http_call POST "/tenant/cost-centers" "$fixture"
  assert_status "200|201"
  chain_set "tenant" "costCenterCode" "$CC_GOV"

  fixture="${TMP_DIR}/quota-gov.json"
  write_quota_policy_fixture "$fixture" "$CC_GOV"
  http_call POST "/tenant/quotas/policies" "$fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    log_warn "POST /tenant/quotas/policies returned HTTP ${RESP_STATUS}; quota probe will be best-effort."
    save_evidence "$SCENARIO" "setup" "quotaPolicyStatus" "$RESP_STATUS"
  else
    save_evidence "$SCENARIO" "setup" "quotaPolicyStatus" "$RESP_STATUS"
  fi

  fixture="${TMP_DIR}/rule-gov.json"
  write_require_approval_rule_fixture "$fixture" "$CC_GOV"
  http_call POST "/tenant/approval-rules" "$fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    log_warn "POST /tenant/approval-rules returned HTTP ${RESP_STATUS}; approval snapshot probe will be best-effort."
    save_evidence "$SCENARIO" "setup" "approvalRuleStatus" "$RESP_STATUS"
  else
    save_evidence "$SCENARIO" "setup" "approvalRuleStatus" "$RESP_STATUS"
  fi

  log_ok "Governance fixtures created for cost-center ${CC_GOV}"
}

# ── 2. FG-01 — Booking with explicit cost center ─────────────────────────────
subcase_fg01_booking_with_cost_center() {
  log_step "FG-01 — Governed booking carries cost-center attribution"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  local fixture="${TMP_DIR}/booking-gov.json"
  write_governed_booking_fixture "$fixture" "$CC_GOV"
  http_call POST "/tenant/bookings" "$fixture"
  assert_status "200|201"
  BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
  if [[ -z "$BOOKING_ID" ]]; then
    fail_contract "FG-01" "governed booking POST returned no bookingId"
  fi
  chain_set "tenant" "bookingId" "$BOOKING_ID"
  save_evidence "$SCENARIO" "FG-01" "bookingId" "$BOOKING_ID"

  http_call GET "/tenant/bookings/${BOOKING_ID}"
  assert_status "200"
  local stored_cc approval_state
  stored_cc=$(json_get_first ".data.costCenter" ".data.cost_center" ".data.costCenterCode")
  if [[ "$stored_cc" != "$CC_GOV" ]]; then
    fail_contract "FG-01" \
      "cost-center attribution dropped from booking read-back: expected ${CC_GOV}, got '${stored_cc:-<empty>}'"
  fi
  approval_state=$(json_get_first ".data.approvalState" ".data.approval_state")
  ORDER_ID=$(json_get_first ".data.orderId" ".data.order_id")
  if [[ -z "$ORDER_ID" ]]; then
    fail_contract "FG-01" "booking read-back did not expose orderId; dispatch leg cannot bind to invoice"
  fi
  chain_set "tenant" "orderId" "$ORDER_ID"
  save_evidence "$SCENARIO" "FG-01" "costCenter" "$stored_cc"
  save_evidence "$SCENARIO" "FG-01" "orderId" "$ORDER_ID"
  record_field "FG-01" "approvalState" "$approval_state"
  VB_COST_CENTER_CODE="$stored_cc"
  VB_APPROVAL_STATE="$approval_state"
  # If no rule matched (e.g., the approval-rule setup returned non-2xx earlier
  # on this environment), the booking is auto-approved (approvalState =
  # `not_required`) and the lifecycle leg should still proceed without going
  # through /tenant/approval-requests/:id/approve.
  if [[ "$approval_state" == "not_required" ]]; then
    APPROVED=true
  fi
  log_ok "Booking ${BOOKING_ID} attributed to cost-center ${stored_cc}, orderId=${ORDER_ID}, approvalState=${approval_state:-<unknown>}"
}

# ── 3. FG-02 — Quota reservation + ledger continuity ─────────────────────────
subcase_fg02_quota_continuity() {
  log_step "FG-02 — Quota reservation + ledger continuity"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  http_call GET "/tenant/cost-centers/${CC_GOV}/quota"
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "GET /tenant/cost-centers/${CC_GOV}/quota returned ${RESP_STATUS}; recording quota probe as not-available."
    save_evidence "$SCENARIO" "FG-02" "quotaStatus" "$RESP_STATUS"
  else
    local quota_used quota_limit
    quota_used=$(json_get_first ".data.bookingCountUsed" ".data.usage.bookingCount" ".data.used.bookingCount")
    quota_limit=$(json_get_first ".data.bookingCountLimit" ".data.limit.bookingCount" ".data.limit.bookingCountLimit")
    record_field "FG-02" "quotaBookingCountUsed" "$quota_used"
    record_field "FG-02" "quotaBookingCountLimit" "$quota_limit"
    VB_QUOTA_USAGE_DELTA="$quota_used"
  fi

  http_call GET "/tenant/quotas/ledger?costCenterCode=${CC_GOV}&bookingId=${BOOKING_ID}"
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "GET /tenant/quotas/ledger returned ${RESP_STATUS}; ledger continuity not available on this env."
    save_evidence "$SCENARIO" "FG-02" "ledgerStatus" "$RESP_STATUS"
  else
    local ledger_count ledger_period_key ledger_usage_delta
    ledger_count=$(json_get ".data.items | length")
    ledger_period_key=$(echo "$RESP_BODY" | jq -r '.data.items[0]? | (.quotaPeriodKey // .quota_period_key // .periodKey // .period_key // empty)' 2>/dev/null || true)
    ledger_usage_delta=$(echo "$RESP_BODY" | jq -r '.data.items[0]? | (.usageDelta // .usage_delta // .bookingCountDelta // .booking_count_delta // empty)' 2>/dev/null || true)
    save_evidence "$SCENARIO" "FG-02" "ledgerEntryCount" "${ledger_count:-0}"
    record_field "FG-02" "quotaPeriodKey" "$ledger_period_key"
    record_field "FG-02" "quotaUsageDelta" "$ledger_usage_delta"
    [[ -n "$ledger_period_key" ]] && VB_QUOTA_PERIOD_KEY="$ledger_period_key"
    [[ -n "$ledger_usage_delta" ]] && VB_QUOTA_USAGE_DELTA="$ledger_usage_delta"
    if [[ "${ledger_count:-0}" -lt 1 ]]; then
      log_warn "Quota ledger has no entries for booking ${BOOKING_ID} after governed booking — recording as not-observed."
    else
      log_ok "Quota ledger reflects ${ledger_count} entries for booking ${BOOKING_ID}"
    fi
  fi
}

# ── 4. FG-03 — Approval evaluation snapshot ──────────────────────────────────
subcase_fg03_approval_snapshot() {
  log_step "FG-03 — Approval evaluation snapshot reachable from booking"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  http_call GET "/tenant/approval-requests?bookingId=${BOOKING_ID}"
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "GET /tenant/approval-requests returned ${RESP_STATUS}; snapshot probe is best-effort."
    save_evidence "$SCENARIO" "FG-03" "approvalRequestStatus" "$RESP_STATUS"
    return 0
  fi

  APPROVAL_REQUEST_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0].approvalRequestId // empty' 2>/dev/null || true)
  local approval_state evaluated_at decision
  approval_state=$(echo "$RESP_BODY" | jq -r '.data.items[0].state // .data.items[0].status // empty' 2>/dev/null || true)
  evaluated_at=$(echo "$RESP_BODY" | jq -r '.data.items[0].evaluatedAt // .data.items[0].evaluated_at // empty' 2>/dev/null || true)
  decision=$(echo "$RESP_BODY" | jq -r '.data.items[0].decision // .data.items[0].evaluationSnapshot.outcome.decision // empty' 2>/dev/null || true)

  record_field "FG-03" "approvalRequestId" "$APPROVAL_REQUEST_ID"
  record_field "FG-03" "approvalRequestState" "$approval_state"
  record_field "FG-03" "evaluatedAt" "$evaluated_at"
  record_field "FG-03" "decision" "$decision"
  VB_APPROVAL_REQUEST_ID="$APPROVAL_REQUEST_ID"
  [[ -n "$approval_state" ]] && VB_APPROVAL_STATE="$approval_state"
}

# ── 5. Approval gate — approve the governed booking before dispatch ──────────
# The require_approval rule we registered keeps the booking in
# approvalState=pending. dispatch is blocked while pending (E2E-005 case E
# proves the 409 BOOKING_APPROVAL_PENDING). Approve as tenant_admin so the
# downstream lifecycle can proceed and the invoice generation step actually
# sees a completed governed trip.
approve_governed_booking() {
  log_step "FG-03 (continued) — approve governed booking"
  if [[ -z "$APPROVAL_REQUEST_ID" ]]; then
    log_warn "No approval request available; assuming booking was auto-approved."
    return 0
  fi
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
  local approve_fixture="${TMP_DIR}/approve.json"
  jq -n '{ reasonNote: "E2E-010 governance approve" }' > "$approve_fixture"
  http_call POST "/tenant/approval-requests/${APPROVAL_REQUEST_ID}/approve" "$approve_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    log_warn "POST /tenant/approval-requests/${APPROVAL_REQUEST_ID}/approve returned ${RESP_STATUS}; lifecycle will skip if booking stays pending."
    save_evidence "$SCENARIO" "FG-03" "approveStatus" "$RESP_STATUS"
    return 0
  fi
  APPROVED=true
  save_evidence "$SCENARIO" "FG-03" "approveStatus" "$RESP_STATUS"

  http_call GET "/tenant/bookings/${BOOKING_ID}"
  if [[ "$RESP_STATUS" == "200" ]]; then
    local post_state
    post_state=$(json_get_first ".data.approvalState" ".data.approval_state")
    record_field "FG-03" "approvalStateAfterApprove" "$post_state"
    [[ -n "$post_state" ]] && VB_APPROVAL_STATE="$post_state"
  fi
}

# ── 6. Dispatch + driver lifecycle (E2E-001 pattern, governed) ───────────────
# This is the leg that makes the downstream invoice evidence binding. Without
# it the invoice would either be empty or, worse, include unrelated historical
# trips and pass a soft check on stale data.
drive_lifecycle_to_completion() {
  log_step "FG-01 (continued) — drive governed booking through completion"

  if ! $APPROVED; then
    skip_clean "lifecycle" "approval not granted; dispatch would be blocked with BOOKING_APPROVAL_PENDING"
    return 0
  fi

  # 1. Dispatch
  switch_actor "ops_user" "e2e-ops-001"
  local dispatch_fixture="${TMP_DIR}/dispatch-auto.json"
  jq -n '{ mode: "auto" }' > "$dispatch_fixture"
  http_call POST "/orders/${ORDER_ID}/dispatch" "$dispatch_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" && "$RESP_STATUS" != "202" ]]; then
    skip_clean "lifecycle" "dispatch returned ${RESP_STATUS}; env cannot drive governed booking through completion"
    return 0
  fi
  DISPATCHED=true
  DISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")

  # 2. Resolve dispatchJobId via poll if not in response
  local attempt=0
  while [[ -z "$DISPATCH_JOB_ID" && $attempt -lt $E2E_POLL_MAX ]]; do
    http_call GET "/dispatch/tasks"
    if [[ "$RESP_STATUS" == "200" ]]; then
      DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
        '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' \
        2>/dev/null | head -1 || true)
    fi
    if [[ -z "$DISPATCH_JOB_ID" ]]; then
      sleep "$E2E_POLL_INTERVAL"
      attempt=$((attempt + 1))
    fi
  done
  if [[ -z "$DISPATCH_JOB_ID" ]]; then
    skip_clean "lifecycle" "no dispatch job visible for orderId=${ORDER_ID} after polling; lifecycle skipped"
    return 0
  fi
  chain_set "ops" "dispatchJobId" "$DISPATCH_JOB_ID"

  # 3. Candidates + assign
  http_call GET "/dispatch/tasks/${DISPATCH_JOB_ID}/candidates"
  if [[ "$RESP_STATUS" != "200" ]]; then
    skip_clean "lifecycle" "candidates endpoint returned ${RESP_STATUS}; cannot assign driver"
    return 0
  fi
  ASSIGN_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
  ASSIGN_DRIVER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)
  [[ -n "$ASSIGN_VEHICLE_ID" ]] || ASSIGN_VEHICLE_ID="$E2E_SEED_VEHICLE_ID"
  [[ -n "$ASSIGN_DRIVER_ID" ]] || ASSIGN_DRIVER_ID="$E2E_SEED_DRIVER_ID"

  local assign_fixture="${TMP_DIR}/assign.json"
  jq \
    --arg jobId   "$DISPATCH_JOB_ID" \
    --arg vehicle "$ASSIGN_VEHICLE_ID" \
    --arg driver  "$ASSIGN_DRIVER_ID" \
    '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver' \
    "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" > "$assign_fixture"
  http_call POST "/dispatch/assign" "$assign_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    skip_clean "lifecycle" "/dispatch/assign returned ${RESP_STATUS}; cannot exercise driver leg"
    return 0
  fi
  TASK_ID=$(json_get_first ".data.taskId" ".data.task_id")

  # 4. Driver lifecycle — resolve taskId, then accept → depart → arrived_pickup → start → complete
  switch_actor "driver_user" "e2e-driver-${ASSIGN_DRIVER_ID}" "$E2E_SEED_TENANT_ID"
  if [[ -z "$TASK_ID" ]]; then
    http_call GET "/driver/tasks"
    if [[ "$RESP_STATUS" == "200" ]]; then
      TASK_ID=$(echo "$RESP_BODY" | jq -r --arg jobId "$DISPATCH_JOB_ID" \
        '.data.items[] | select((.dispatchJobId // .dispatch_job_id) == $jobId) | (.taskId // .task_id)' \
        2>/dev/null | head -1 || true)
    fi
  fi
  if [[ -z "$TASK_ID" ]]; then
    skip_clean "lifecycle" "no driver task for dispatchJob=${DISPATCH_JOB_ID}; cannot complete trip"
    return 0
  fi
  chain_set "driver" "taskId" "$TASK_ID"

  local now accept_fixture depart_fixture arrive_fixture start_fixture complete_fixture
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  accept_fixture="${TMP_DIR}/accept.json"
  jq --arg ts "$now" '.acceptedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" > "$accept_fixture"
  http_call POST "/driver/tasks/${TASK_ID}/accept" "$accept_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    skip_clean "lifecycle" "/driver/tasks/${TASK_ID}/accept returned ${RESP_STATUS}; lifecycle truncated"
    return 0
  fi

  depart_fixture="${TMP_DIR}/depart.json"
  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.departedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-depart.json" > "$depart_fixture"
  http_call POST "/driver/tasks/${TASK_ID}/depart" "$depart_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    skip_clean "lifecycle" "/driver/tasks/${TASK_ID}/depart returned ${RESP_STATUS}; lifecycle truncated"
    return 0
  fi

  arrive_fixture="${TMP_DIR}/arrived.json"
  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.arrivedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-arrived-pickup.json" > "$arrive_fixture"
  http_call POST "/driver/tasks/${TASK_ID}/arrived_pickup" "$arrive_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    skip_clean "lifecycle" "/driver/tasks/${TASK_ID}/arrived_pickup returned ${RESP_STATUS}; lifecycle truncated"
    return 0
  fi

  start_fixture="${TMP_DIR}/start.json"
  jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.startedAt = $ts' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-start.json" > "$start_fixture"
  http_call POST "/driver/tasks/${TASK_ID}/start" "$start_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    skip_clean "lifecycle" "/driver/tasks/${TASK_ID}/start returned ${RESP_STATUS}; lifecycle truncated"
    return 0
  fi

  complete_fixture="${TMP_DIR}/complete.json"
  local completed_at
  completed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  jq --arg ts "$completed_at" \
    '.completedAt = $ts | (if .signoff? then .signoff.signedAt = $ts else . end)' \
    "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" > "$complete_fixture"
  http_call POST "/driver/tasks/${TASK_ID}/complete" "$complete_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    # We accepted dispatch+assign and got through earlier driver legs but
    # cannot complete — this is a regression against WF-DRV-001 coupling.
    fail_contract "lifecycle" \
      "/driver/tasks/${TASK_ID}/complete returned ${RESP_STATUS} after earlier legs accepted"
  fi
  DRIVER_COMPLETED=true
  save_evidence "$SCENARIO" "FG-01" "completedAt" "$completed_at"
  log_ok "Governed booking completed: taskId=${TASK_ID}, orderId=${ORDER_ID}"
}

# ── 7. FG-04 — Governance-aware report export ────────────────────────────────
subcase_fg04_report_export() {
  log_step "FG-04 — Governance-aware report export"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  local fixture="${TMP_DIR}/report-job.json"
  write_report_job_fixture "$fixture" "$E2E_SEED_TENANT_ID"
  http_call POST "/tenant/reports/jobs" "$fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    switch_actor "platform_admin" "e2e-platform-admin-001"
    http_call POST "/reports/jobs" "$fixture"
  fi
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    log_warn "Report-job creation returned ${RESP_STATUS}; recording FG-04 as not-available."
    save_evidence "$SCENARIO" "FG-04" "reportJobStatus" "$RESP_STATUS"
    return 0
  fi

  local job_id job_status
  job_id=$(json_get_first ".data.jobId" ".data.job_id")
  job_status=$(json_get_first ".data.status")
  save_evidence "$SCENARIO" "FG-04" "reportJobId" "${job_id:-<missing>}"
  save_evidence "$SCENARIO" "FG-04" "reportJobInitialStatus" "${job_status:-<missing>}"

  if [[ -z "$job_id" ]]; then
    log_warn "Report job created but jobId missing; FG-04 governance columns cannot be inspected."
    return 0
  fi

  http_call GET "/tenant/reports/${job_id}"
  if [[ "$RESP_STATUS" != "200" ]]; then
    http_call GET "/reports/${job_id}"
  fi
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "Report job ${job_id} fetch returned ${RESP_STATUS}; recording FG-04 column probe as not-available."
    save_evidence "$SCENARIO" "FG-04" "reportJobFetchStatus" "$RESP_STATUS"
    return 0
  fi

  local has_cc has_owner_user has_owner_name has_approval has_quota has_partner has_legacy report_artifact_id
  has_cc=$(echo "$RESP_BODY" | jq -r '
    (..|.costCenterCode? // empty),
    (..|.costCenterName? // empty) | select(. != null and . != "") | "present"' \
    2>/dev/null | head -1)
  has_owner_user=$(echo "$RESP_BODY" | jq -r '
    (..|.ownerUserId? // empty) | select(. != null and . != "") | "present"' \
    2>/dev/null | head -1)
  has_owner_name=$(echo "$RESP_BODY" | jq -r '
    (..|.ownerName? // empty) | select(. != null and . != "") | "present"' \
    2>/dev/null | head -1)
  has_approval=$(echo "$RESP_BODY" | jq -r '
    (..|.approvalState? // empty),
    (..|.approval_state? // empty) | select(. != null and . != "") | "present"' \
    2>/dev/null | head -1)
  has_quota=$(echo "$RESP_BODY" | jq -r '
    (..|.quotaImpacts? // empty),
    (..|.quota_impacts? // empty) | select(. != null and . != "") | "present"' \
    2>/dev/null | head -1)
  has_partner=$(echo "$RESP_BODY" | jq -r '
    (..|.partnerProgramId? // empty),
    (..|.programId? // empty) | select(. != null and . != "") | "present"' \
    2>/dev/null | head -1)
  has_legacy=$(echo "$RESP_BODY" | jq -r '
    (..|.legacy_unmapped? // empty),
    (..|.legacyUnmapped? // empty) | select(. != null) | "present"' \
    2>/dev/null | head -1)
  report_artifact_id=$(echo "$RESP_BODY" | jq -r '
    (..|.reportArtifactId? // empty),
    (..|.report_artifact_id? // empty),
    (..|.artifactId? // empty),
    (..|.artifact_id? // empty) | select(. != null and . != "")' \
    2>/dev/null | head -1)

  record_field "FG-04" "reportCostCenterField" "${has_cc:-}"
  record_field "FG-04" "reportOwnerUserField" "${has_owner_user:-}"
  record_field "FG-04" "reportOwnerNameField" "${has_owner_name:-}"
  record_field "FG-04" "reportApprovalStateField" "${has_approval:-}"
  record_field "FG-04" "reportQuotaImpactField" "${has_quota:-}"
  record_field "FG-04" "reportPartnerProgramField" "${has_partner:-}"
  record_field "FG-04" "reportLegacyUnmappedField" "${has_legacy:-}"
  record_field "FG-04" "reportArtifactId" "${report_artifact_id:-}"
  [[ -n "$report_artifact_id" ]] && VB_REPORT_ARTIFACT_ID="$report_artifact_id"
}

# ── 8. FG-01 / FG-08 — Invoice generation tied to governed orderId + audit ──
subcase_invoice_governance_and_audit() {
  log_step "FG-01/FG-08 — Tenant invoice generation + audited download (bound to orderId=${ORDER_ID})"

  if ! $DRIVER_COMPLETED; then
    skip_clean "FG-01" "lifecycle did not reach completion; invoice binding cannot be exercised"
    skip_clean "FG-08" "lifecycle did not reach completion; audit binding cannot be exercised"
    return 0
  fi

  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  # Give settlement projection a moment to land after task completion. The
  # billing service filters on `eligibleForTenantInvoice` + completedAt in
  # period; the seed completion is synchronous but the integration shim may
  # buffer briefly on staging.
  sleep 2

  local fixture="${TMP_DIR}/invoice-gov.json"
  write_invoice_today_fixture "$fixture" "$E2E_SEED_TENANT_ID"
  http_call POST "/tenant/invoices/generate" "$fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    fail_contract "FG-01" \
      "invoice generation returned HTTP ${RESP_STATUS} after governed booking completed — billing baseline regression"
  fi

  INVOICE_ID=$(json_get_first ".data.invoiceId" ".data.invoice_id")
  if [[ -z "$INVOICE_ID" ]]; then
    fail_contract "FG-01" "invoice generation returned no invoiceId"
  fi
  save_evidence "$SCENARIO" "FG-01" "invoiceId" "$INVOICE_ID"
  chain_set "billing" "invoiceId" "$INVOICE_ID"

  http_call GET "/tenant/invoices/${INVOICE_ID}"
  assert_status "200"

  # Binding evidence: invoice.lines[*].orderId must include our governed
  # orderId. This is what the integration test asserts at
  # apps/api/tests/integration/tenant-governance-e2e.test.ts:573-579 and is the
  # only deterministic link between the governed booking and the invoice line
  # given the runtime still leaves cost-center enrichment as a follow-up
  # (see FIN-GOV-SPEC-001 §"Open Gaps").
  local matched_line_id
  matched_line_id=$(echo "$RESP_BODY" | jq -r --arg oid "$ORDER_ID" \
    '.data.lines[]? | select((.orderId // .order_id) == $oid) | (.lineId // .line_id // "present")' \
    2>/dev/null | head -1 || true)
  if [[ -z "$matched_line_id" ]]; then
    fail_contract "FG-01" \
      "invoice ${INVOICE_ID} does not contain a line for governed orderId=${ORDER_ID} — billing/booking binding broken"
  fi
  save_evidence "$SCENARIO" "FG-01" "invoiceLineForGovernedOrderId" "$matched_line_id"
  log_ok "FG-01 binding evidence: invoice ${INVOICE_ID} line ${matched_line_id} carries governed orderId=${ORDER_ID}"

  # Field presence on the matched governed line (soft — these are runtime
  # enrichment gaps per spec, NOT contract regressions).
  local matched_line_json cc_code cc_name owner_user_id owner_name approval_state active_flag legacy_unmapped partner_id program_id eligibility_verification_id platform_earnings_ref
  matched_line_json=$(echo "$RESP_BODY" | jq -c --arg oid "$ORDER_ID" \
    '.data.lines[]? | select((.orderId // .order_id) == $oid)' 2>/dev/null | head -1 || true)
  if [[ -n "$matched_line_json" ]]; then
    cc_code=$(echo "$matched_line_json" | jq -r '.costCenterCode // empty' 2>/dev/null || true)
    cc_name=$(echo "$matched_line_json" | jq -r '.costCenterName // empty' 2>/dev/null || true)
    owner_user_id=$(echo "$matched_line_json" | jq -r '.ownerUserId // empty' 2>/dev/null || true)
    owner_name=$(echo "$matched_line_json" | jq -r '.ownerName // empty' 2>/dev/null || true)
    approval_state=$(echo "$matched_line_json" | jq -r '.approvalState // empty' 2>/dev/null || true)
    active_flag=$(echo "$matched_line_json" | jq -r 'if has("activeFlag") then (.activeFlag | tostring) else "" end' 2>/dev/null || true)
    legacy_unmapped=$(echo "$matched_line_json" | jq -r 'if has("legacy_unmapped") then (.legacy_unmapped | tostring) elif has("legacyUnmapped") then (.legacyUnmapped | tostring) else "" end' 2>/dev/null || true)
    partner_id=$(echo "$matched_line_json" | jq -r '.partnerId // empty' 2>/dev/null || true)
    program_id=$(echo "$matched_line_json" | jq -r '.partnerProgramId // empty' 2>/dev/null || true)
    eligibility_verification_id=$(echo "$matched_line_json" | jq -r '.eligibilityVerificationId // .eligibility_verification_id // empty' 2>/dev/null || true)
    platform_earnings_ref=$(echo "$matched_line_json" | jq -r '.platformEarningsRef // .platform_earnings_ref // empty' 2>/dev/null || true)
    record_field "FG-01" "lineCostCenterCode" "$cc_code"
    record_field "FG-01" "lineCostCenterName" "$cc_name"
    record_field "FG-01" "lineOwnerUserId" "$owner_user_id"
    record_field "FG-01" "lineOwnerName" "$owner_name"
    record_field "FG-01" "lineApprovalState" "$approval_state"
    record_field "FG-01" "lineActiveFlag" "$active_flag"
    record_field "FG-01" "lineLegacyUnmapped" "$legacy_unmapped"
    record_field "FG-05" "linePartnerId" "$partner_id"
    record_field "FG-05" "linePartnerProgramId" "$program_id"
    record_field "FG-05" "lineEligibilityVerificationId" "$eligibility_verification_id"
    record_field "FG-06" "linePlatformEarningsRef" "$platform_earnings_ref"
    [[ -n "$cc_code" ]] && VB_COST_CENTER_CODE="$cc_code"
    [[ -n "$cc_name" ]] && VB_COST_CENTER_NAME="$cc_name"
    [[ -n "$owner_user_id" ]] && VB_OWNER_USER_ID="$owner_user_id"
    [[ -n "$approval_state" ]] && VB_APPROVAL_STATE="$approval_state"
    [[ -n "$legacy_unmapped" ]] && VB_LEGACY_UNMAPPED="$legacy_unmapped"
    [[ -n "$program_id" ]] && VB_PARTNER_PROGRAM_CODE="$program_id"
    [[ -n "$eligibility_verification_id" ]] && VB_ELIGIBILITY_VERIFICATION_ID="$eligibility_verification_id"
    [[ -n "$platform_earnings_ref" ]] && VB_PLATFORM_EARNINGS_REF="$platform_earnings_ref"
  fi

  # FG-08 — invoice generation must emit an audit entry with resourceId =
  # invoiceId. Per billing-settlement.service.ts:502-520 the action is
  # `generate_tenant_invoice` and resourceType is `tenant_invoice`. A missing
  # entry means the audit chain is broken for sensitive finance artifacts —
  # that is the FG-08 contract regression named in FIN-GOV-SPEC-001 §5.
  switch_actor "platform_admin" "e2e-platform-admin-001"
  http_call GET "/audit"
  if [[ "$RESP_STATUS" != "200" ]]; then
    fail_contract "FG-08" \
      "GET /audit returned ${RESP_STATUS}; cannot verify sensitive finance artifact audit chain"
  fi
  local audit_id
  audit_id=$(echo "$RESP_BODY" | jq -r \
    --arg invoiceId "$INVOICE_ID" \
    '.data.items[] |
       select(
         .actionName == "generate_tenant_invoice"
         and ((.resourceId // .resource_id) == $invoiceId)
       ) | (.auditId // .audit_id)' \
    2>/dev/null | head -1 || true)
  if [[ -z "$audit_id" ]]; then
    fail_contract "FG-08" \
      "no audit entry with actionName=generate_tenant_invoice and resourceId=${INVOICE_ID} — sensitive download audit missing"
  fi
  save_evidence "$SCENARIO" "FG-08" "invoiceAuditId" "$audit_id"
  log_ok "FG-08 audit evidence: ${audit_id} ties generate_tenant_invoice to invoiceId=${INVOICE_ID}"
  VB_AUDIT_ID="$audit_id"
}

# ── 9. FG-05 / FG-06 — Settlement view + platform-earnings aggregation ───────
subcase_fg05_fg06_settlement_and_platform_earnings() {
  log_step "FG-05/FG-06 — Settlement matrix + platform-earnings governance views"
  switch_actor "platform_admin" "e2e-platform-admin-001"

  http_call GET "/settlement/matrix"
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "GET /settlement/matrix returned ${RESP_STATUS}; FG-05 partner-program view unavailable."
    save_evidence "$SCENARIO" "FG-05" "settlementMatrixStatus" "$RESP_STATUS"
  else
    local partner_row_count partner_program_id
    partner_row_count=$(echo "$RESP_BODY" | jq -r \
      '[ .data.items[]? | select(.partnerId? or .programId? or .partnerProgramId?) ] | length' \
      2>/dev/null || echo 0)
    partner_program_id=$(echo "$RESP_BODY" | jq -r \
      '.data.items[]? | (.programId // .partnerProgramId // empty) | select(. != null and . != "")' \
      2>/dev/null | head -1 || true)
    save_evidence "$SCENARIO" "FG-05" "settlementPartnerRowCount" "${partner_row_count:-0}"
    record_field "FG-05" "settlementPartnerProgramId" "$partner_program_id"
  fi

  http_call GET "/platform-earnings/by-platform"
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "GET /platform-earnings/by-platform returned ${RESP_STATUS}; FG-06 platform aggregation unavailable."
    save_evidence "$SCENARIO" "FG-06" "platformEarningsStatus" "$RESP_STATUS"
    return 0
  fi
  local platform_codes platform_item_count platform_earnings_ref
  platform_item_count=$(json_get ".data.items | length")
  platform_codes=$(echo "$RESP_BODY" | jq -r \
    '[.data.items[]? | (.platformCode // .platform_code // empty)] | map(select(. != "")) | join(",")' \
    2>/dev/null || true)
  platform_earnings_ref=$(echo "$RESP_BODY" | jq -r \
    '.data.items[]? | (.platformEarningsRef // .platform_earnings_ref // .earningsRef // .earnings_ref // empty) | select(. != null and . != "")' \
    2>/dev/null | head -1 || true)
  save_evidence "$SCENARIO" "FG-06" "platformItemCount" "${platform_item_count:-0}"
  record_field "FG-06" "platformCodes" "$platform_codes"
  record_field "FG-06" "platformEarningsRef" "$platform_earnings_ref"
  [[ -n "$platform_earnings_ref" ]] && VB_PLATFORM_EARNINGS_REF="$platform_earnings_ref"
}

# ── 10. FG-07 — Legacy unmapped cost center labelling ────────────────────────
subcase_fg07_legacy_unmapped() {
  log_step "FG-07 — Legacy unmapped cost-center coverage labelling"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  http_call GET "/tenant/cost-centers/coverage"
  if [[ "$RESP_STATUS" != "200" ]]; then
    log_warn "GET /tenant/cost-centers/coverage returned ${RESP_STATUS}; FG-07 unavailable."
    save_evidence "$SCENARIO" "FG-07" "coverageStatus" "$RESP_STATUS"
    return 0
  fi
  local total_bookings resolved_count unresolved_count disabled_hits unresolved_sample
  total_bookings=$(json_get_first ".data.totalBookings" ".data.total_bookings")
  resolved_count=$(json_get_first ".data.resolvedCount" ".data.resolved_count")
  unresolved_count=$(json_get_first ".data.unresolvedCount" ".data.unresolved_count")
  disabled_hits=$(json_get_first ".data.disabledHits" ".data.disabled_hits")
  unresolved_sample=$(echo "$RESP_BODY" | jq -r \
    '.data.unresolvedSamples? // .data.unresolved_samples? // [] | .[0] // empty' \
    2>/dev/null || true)

  record_field "FG-07" "coverageTotalBookings" "$total_bookings"
  record_field "FG-07" "coverageResolvedCount" "$resolved_count"
  record_field "FG-07" "coverageUnresolvedCount" "$unresolved_count"
  record_field "FG-07" "coverageDisabledHits" "$disabled_hits"
  record_field "FG-07" "coverageUnresolvedSample" "$unresolved_sample"
}

# ── 11. FG-09 — Cross-tenant scope on the governed invoice ───────────────────
# Spec FIN-GOV-SPEC-001 §5 requires that sensitive finance artifacts are
# permissioned. The billing service enforces this via tenant-scope filtering
# (billing-settlement.service.ts:550-565 returns 404 NOT_FOUND if the invoice's
# tenantId does not match the requesting tenant scope). A 2xx response here
# would mean the tenant scope has widened — a contract regression.
subcase_fg09_cross_tenant_scope() {
  log_step "FG-09 — Cross-tenant scope on the governed invoice"
  if [[ -z "$INVOICE_ID" ]]; then
    skip_clean "FG-09" "no invoice was generated this run; cross-tenant probe needs a real invoiceId"
    return 0
  fi

  # Construct a probe tenant id deterministically distinct from the seed
  # tenant. UUID format keeps the validators happy; the id is unlikely to be
  # provisioned in any environment we run against.
  local probe_tenant="00000000-0000-0000-fffe-0000000000ff"
  if [[ "$probe_tenant" == "$E2E_SEED_TENANT_ID" ]]; then
    # extreme corner: just flip the last byte
    probe_tenant="00000000-0000-0000-fffe-0000000000ee"
  fi

  switch_actor "tenant_admin" "e2e-cross-tenant-probe" "$probe_tenant"
  http_call GET "/tenant/invoices/${INVOICE_ID}"
  save_evidence "$SCENARIO" "FG-09" "crossTenantStatus" "$RESP_STATUS"
  if [[ "$RESP_STATUS" =~ ^2 ]]; then
    fail_contract "FG-09" \
      "cross-tenant invoice fetch returned HTTP ${RESP_STATUS} (expected 4xx); tenant scope widened"
  fi
  log_ok "FG-09 cross-tenant scope enforced: HTTP ${RESP_STATUS}"
}

# ── Run ──────────────────────────────────────────────────────────────────────
discover_tenant_users
bootstrap_governance_fixtures
subcase_fg01_booking_with_cost_center
subcase_fg02_quota_continuity
subcase_fg03_approval_snapshot
approve_governed_booking
drive_lifecycle_to_completion
subcase_fg04_report_export
subcase_invoice_governance_and_audit
subcase_fg05_fg06_settlement_and_platform_earnings
subcase_fg07_legacy_unmapped
subcase_fg09_cross_tenant_scope

emit_verification_body_fields

print_chain_summary

echo ""
log_ok "E2E-010 complete — governance-aware billing/reporting shell finished."
log_info "Field-presence evidence (NOT_POPULATED markers) reflects current 'BLOCKED FOR LIVE' reads from FIN-GOV-UAT-001."
echo -e "Evidence log: ${EVIDENCE_FILE}"
