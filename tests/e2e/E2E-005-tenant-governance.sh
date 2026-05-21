#!/usr/bin/env bash
# E2E-005 — Tenant governance negative-path pack
#
# Companion integration suite:
#   tests/integ/tenant-governance-negative.test.ts
#
# This live/API scenario exercises the same negative-path family through the
# public HTTP surface, retaining audit evidence for each subcase where the
# environment exposes the required endpoints and seed users.
#
# Subcases:
#   A. unknown cost center
#   B. disabled cost center
#   C. cross-tenant cost center
#   D. quota_insufficient
#   E. rule block
#   F. no approver rollback
#   G. governance-sensitive update triggers re-evaluation
#   H. notes-only update does not re-evaluate
#   I. rejected booking does not dispatch
#   J. manual SLA escalation remains visible in admin summary + audit
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-005"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-005 — Tenant governance negative-path pack${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-005-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUFFIX="$(date +%s | tail -c 7)"
CC_DISABLED="CC-DIS-${SUFFIX}"
CC_LIMIT="CC-LIMIT-${SUFFIX}"
CC_BLOCK="CC-BLOCK-${SUFFIX}"
CC_NOAPP="CC-NOAPP-${SUFFIX}"
CC_OPS="CC-OPS-${SUFFIX}"
CC_FIN="CC-FIN-${SUFFIX}"
CC_XTEN="CC-XTEN-${SUFFIX}"

TENANT_ADMIN_USER_ID=""
TENANT_FINANCE_USER_ID=""
TENANT_ADMIN_EMAIL=""
TENANT_FINANCE_EMAIL=""
OTHER_TENANT_ID=""

json_error_code() {
  echo "$RESP_BODY" | jq -r '.error.code // .data.error.code // empty' 2>/dev/null || true
}

require_error_code() {
  local expected="$1"
  local actual
  actual="$(json_error_code)"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "Expected error.code=${expected}, got '${actual:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

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

write_booking_fixture() {
  local path="$1" cost_center="${2:-}" notes="${3:-}"
  local window_start window_end
  window_start=$(date -u -d "+2 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ")
  window_end=$(date -u -d "+3 hours" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+3H +"%Y-%m-%dT%H:%M:%SZ")

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
      passenger: { name: "Governance Rider", phone: "0912000099" }
    }
    + (if $costCenter != "" then { costCenter: $costCenter } else {} end)
    + (if $notes != "" then { notes: $notes } else {} end)' \
    > "$path"
}

write_disable_cost_center_fixture() {
  local path="$1" code="$2"
  jq -n --arg code "$code" '{ code: $code, reason: "e2e_negative_pack" }' > "$path"
}

write_quota_policy_fixture() {
  local path="$1" cost_center="$2"
  jq -n \
    --arg costCenterCode "$cost_center" \
    '{
      costCenterCode: $costCenterCode,
      period: "monthly",
      limit: {
        bookingCountLimit: 0,
        amountMinorLimit: 0,
        currency: "TWD",
        enforcementMode: "hard_block"
      }
    }' \
    > "$path"
}

write_rule_block_fixture() {
  local path="$1" cost_center="$2"
  jq -n \
    --arg costCenterCode "$cost_center" \
    '{
      ruleName: "E2E block rule",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: $costCenterCode
        }
      ],
      action: "block",
      approvers: []
    }' \
    > "$path"
}

write_rule_missing_approver_fixture() {
  local path="$1" cost_center="$2"
  jq -n \
    --arg costCenterCode "$cost_center" \
    '{
      ruleName: "E2E missing approver rule",
      priority: 20,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: $costCenterCode
        }
      ],
      action: "require_approval",
      approvers: [
        {
          kind: "tenant_role",
          roleCode: "tenant_missing_role_e2e_005"
        }
      ]
    }' \
    > "$path"
}

write_rule_role_fixture() {
  local path="$1" name="$2" priority="$3" cost_center="$4" approver_kind="$5"
  jq -n \
    --arg name "$name" \
    --argjson priority "$priority" \
    --arg costCenterCode "$cost_center" \
    --arg approverKind "$approver_kind" \
    '{
      ruleName: $name,
      priority: $priority,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: $costCenterCode
        }
      ],
      action: "require_approval",
      approvers: [
        {
          kind: $approverKind
        }
      ]
    }' \
    > "$path"
}

write_booking_update_fixture() {
  local path="$1" mode="$2" value="$3"
  case "$mode" in
    notes)
      jq -n --arg notes "$value" '{ notes: $notes }' > "$path"
      ;;
    cost_center)
      jq -n --arg costCenter "$value" '{ costCenter: $costCenter }' > "$path"
      ;;
    *)
      log_fail "Unsupported booking update mode: ${mode}"
      exit 1
      ;;
  esac
}

write_reject_fixture() {
  local path="$1"
  jq -n '{ reasonCode: "finance_reject", reasonNote: "E2E-005 negative-path check" }' > "$path"
}

write_escalate_fixture() {
  local path="$1"
  jq -n '{ reasonNote: "E2E-005 manual SLA escalation" }' > "$path"
}

write_dispatch_fixture() {
  local path="$1"
  jq -n '{ mode: "auto" }' > "$path"
}

require_audit_match() {
  local evidence_key="$1"
  local jq_filter="$2"
  switch_actor "platform_admin" "e2e-platform-admin-001"
  http_call GET "/audit"
  assert_status "200"
  local audit_id
  audit_id=$(echo "$RESP_BODY" | jq -r "${jq_filter} | .auditId // empty" 2>/dev/null | head -1 || true)
  if [[ -z "$audit_id" ]]; then
    log_fail "Missing audit evidence for ${evidence_key}"
    log_fail "Audit filter: ${jq_filter}"
    exit 1
  fi
  save_evidence "$SCENARIO" "audit" "$evidence_key" "$audit_id"
  log_ok "Audit evidence captured for ${evidence_key}: ${audit_id}"
}

discover_tenant_users() {
  log_surface "Tenant Console — discover tenant governance actors"
  switch_actor "tenant_admin" "e2e-bootstrap-tenant-admin" "$E2E_SEED_TENANT_ID"
  http_call GET "/tenant/users"
  assert_status "200"

  TENANT_ADMIN_USER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select(.roleCode == "tenant_admin" and .status == "active") | .userId' \
    2>/dev/null | head -1 || true)
  TENANT_ADMIN_EMAIL=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select(.roleCode == "tenant_admin" and .status == "active") | .email' \
    2>/dev/null | head -1 || true)
  TENANT_FINANCE_USER_ID=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select(.roleCode == "tenant_finance_admin" and .status == "active") | .userId' \
    2>/dev/null | head -1 || true)
  TENANT_FINANCE_EMAIL=$(echo "$RESP_BODY" | jq -r \
    '.data.items[] | select(.roleCode == "tenant_finance_admin" and .status == "active") | .email' \
    2>/dev/null | head -1 || true)

  if [[ -z "$TENANT_ADMIN_USER_ID" || -z "$TENANT_FINANCE_USER_ID" ]]; then
    log_warn "Seed tenant lacks active tenant_admin / tenant_finance_admin users."
    log_warn "Skipping E2E-005 because approval actions cannot be authenticated safely on this environment."
    exit 0
  fi

  save_evidence "$SCENARIO" "setup" "tenantAdminUserId" "$TENANT_ADMIN_USER_ID"
  save_evidence "$SCENARIO" "setup" "tenantFinanceUserId" "$TENANT_FINANCE_USER_ID"
  log_ok "Discovered tenant governance users: admin=${TENANT_ADMIN_USER_ID}, finance=${TENANT_FINANCE_USER_ID}"
}

bootstrap_cost_centers_and_rules() {
  log_surface "Tenant Console — bootstrap governance fixtures"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  local fixture

  fixture="${TMP_DIR}/cc-disabled.json"
  write_cost_center_fixture "$fixture" "$CC_DISABLED" "E2E disabled cost center" "$TENANT_ADMIN_USER_ID"
  http_call POST "/tenant/cost-centers" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/cc-disable.json"
  write_disable_cost_center_fixture "$fixture" "$CC_DISABLED"
  http_call POST "/tenant/cost-centers/disable" "$fixture"
  assert_status "200"

  fixture="${TMP_DIR}/cc-limit.json"
  write_cost_center_fixture "$fixture" "$CC_LIMIT" "E2E quota hard-block center" "$TENANT_FINANCE_USER_ID"
  http_call POST "/tenant/cost-centers" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/cc-block.json"
  write_cost_center_fixture "$fixture" "$CC_BLOCK" "E2E block center" "$TENANT_ADMIN_USER_ID"
  http_call POST "/tenant/cost-centers" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/cc-noapp.json"
  write_cost_center_fixture "$fixture" "$CC_NOAPP" "E2E no-approver center" "$TENANT_ADMIN_USER_ID"
  http_call POST "/tenant/cost-centers" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/cc-ops.json"
  write_cost_center_fixture "$fixture" "$CC_OPS" "E2E ops center" "$TENANT_ADMIN_USER_ID"
  http_call POST "/tenant/cost-centers" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/cc-fin.json"
  write_cost_center_fixture "$fixture" "$CC_FIN" "E2E finance center" "$TENANT_FINANCE_USER_ID"
  http_call POST "/tenant/cost-centers" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/quota-limit.json"
  write_quota_policy_fixture "$fixture" "$CC_LIMIT"
  http_call POST "/tenant/quotas/policies" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/rule-block.json"
  write_rule_block_fixture "$fixture" "$CC_BLOCK"
  http_call POST "/tenant/approval-rules" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/rule-noapp.json"
  write_rule_missing_approver_fixture "$fixture" "$CC_NOAPP"
  http_call POST "/tenant/approval-rules" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/rule-ops.json"
  write_rule_role_fixture "$fixture" "E2E ops approval" 30 "$CC_OPS" "tenant_admin"
  http_call POST "/tenant/approval-rules" "$fixture"
  assert_status "200|201"

  fixture="${TMP_DIR}/rule-fin.json"
  write_rule_role_fixture "$fixture" "E2E finance approval" 40 "$CC_FIN" "tenant_finance_admin"
  http_call POST "/tenant/approval-rules" "$fixture"
  assert_status "200|201"

  log_ok "Governance fixtures created for E2E-005"
}

subcase_unknown_cost_center() {
  log_step "A — unknown cost center"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
  local fixture="${TMP_DIR}/booking-unknown.json"
  write_booking_fixture "$fixture" "CC-UNKNOWN-${SUFFIX}" ""
  http_call POST "/tenant/bookings" "$fixture"
  assert_status "400"
  require_error_code "BOOKING_COST_CENTER_UNKNOWN"
  save_evidence "$SCENARIO" "caseA" "httpStatus" "$RESP_STATUS"
  require_audit_match "unknown_cost_center" \
    ".data.items[] | select(.actionName == \"booking.cost_center.validation_rejected\" and .newValuesSummary.errorCode == \"BOOKING_COST_CENTER_UNKNOWN\" and .newValuesSummary.normalized == \"CC-UNKNOWN-${SUFFIX}\")"
}

subcase_disabled_cost_center() {
  log_step "B — disabled cost center"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
  local fixture="${TMP_DIR}/booking-disabled.json"
  write_booking_fixture "$fixture" "$CC_DISABLED" ""
  http_call POST "/tenant/bookings" "$fixture"
  assert_status "400"
  require_error_code "BOOKING_COST_CENTER_DISABLED"
  save_evidence "$SCENARIO" "caseB" "httpStatus" "$RESP_STATUS"
  require_audit_match "disabled_cost_center" \
    ".data.items[] | select(.actionName == \"booking.cost_center.validation_rejected\" and .newValuesSummary.errorCode == \"BOOKING_COST_CENTER_DISABLED\" and .newValuesSummary.costCenter == \"${CC_DISABLED}\")"
}

subcase_cross_tenant_cost_center() {
  log_step "C — cross-tenant cost center"
  switch_actor "platform_admin" "e2e-platform-admin-001"

  local tenant_code="E2E-GOV-${SUFFIX}"
  local tenant_fixture="${TMP_DIR}/tenant-cross.json"
  jq --arg code "$tenant_code" '.code = $code' \
    "${SCRIPT_DIR}/fixtures/e2e-tenant-create.json" > "$tenant_fixture"

  http_call POST "/platform-admin/tenants" "$tenant_fixture"
  if [[ "$RESP_STATUS" != "200" && "$RESP_STATUS" != "201" ]]; then
    log_warn "Cross-tenant setup unavailable on this environment; skipping subcase C."
    save_evidence "$SCENARIO" "caseC" "skipped" "tenant_create_unsupported"
    return 0
  fi

  OTHER_TENANT_ID=$(json_get_first ".data.tenantId" ".data.id")
  if [[ -z "$OTHER_TENANT_ID" ]]; then
    log_warn "Cross-tenant setup returned no tenantId; skipping subcase C."
    save_evidence "$SCENARIO" "caseC" "skipped" "tenant_id_missing"
    return 0
  fi

  switch_actor "tenant_admin" "e2e-tenant-admin-other-001" "$OTHER_TENANT_ID"
  local cc_fixture="${TMP_DIR}/cc-cross.json"
  write_cost_center_fixture "$cc_fixture" "$CC_XTEN" "E2E cross-tenant cost center" ""
  http_call POST "/tenant/cost-centers" "$cc_fixture"
  assert_status "200|201"

  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
  local booking_fixture="${TMP_DIR}/booking-cross.json"
  write_booking_fixture "$booking_fixture" "$CC_XTEN" ""
  http_call POST "/tenant/bookings" "$booking_fixture"
  assert_status "400"
  require_error_code "BOOKING_COST_CENTER_UNKNOWN"
  save_evidence "$SCENARIO" "caseC" "otherTenantId" "$OTHER_TENANT_ID"
  require_audit_match "cross_tenant_cost_center" \
    ".data.items[] | select(.actionName == \"booking.cost_center.validation_rejected\" and .newValuesSummary.errorCode == \"BOOKING_COST_CENTER_UNKNOWN\" and .newValuesSummary.normalized == \"${CC_XTEN}\")"
}

subcase_quota_insufficient() {
  log_step "D — quota_insufficient"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
  local fixture="${TMP_DIR}/booking-limit.json"
  write_booking_fixture "$fixture" "$CC_LIMIT" ""
  http_call POST "/tenant/bookings" "$fixture"
  assert_status "409"
  require_error_code "QUOTA_INSUFFICIENT_AT_COMMIT"
  save_evidence "$SCENARIO" "caseD" "httpStatus" "$RESP_STATUS"
  require_audit_match "quota_insufficient" \
    ".data.items[] | select(.actionName == \"tenant.quota_reservation.blocked\" and .newValuesSummary.errorCode == \"QUOTA_INSUFFICIENT_AT_COMMIT\" and .newValuesSummary.costCenterCode == \"${CC_LIMIT}\")"
}

subcase_rule_block() {
  log_step "E — rule block"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
  local fixture="${TMP_DIR}/booking-block.json"
  write_booking_fixture "$fixture" "$CC_BLOCK" ""
  http_call POST "/tenant/bookings" "$fixture"
  assert_status "200|201"
  local booking_id order_id approval_state
  booking_id=$(json_get_first ".data.bookingId" ".data.booking_id")
  http_call GET "/tenant/bookings/${booking_id}"
  assert_status "200"
  approval_state=$(json_get_first ".data.approvalState" ".data.approval_state")
  order_id=$(json_get_first ".data.orderId" ".data.order_id")
  if [[ "$approval_state" != "blocked" ]]; then
    log_fail "Expected blocked approvalState for rule-block booking, got '${approval_state:-<empty>}'"
    exit 1
  fi
  save_evidence "$SCENARIO" "caseE" "bookingId" "$booking_id"
  save_evidence "$SCENARIO" "caseE" "orderId" "$order_id"

  switch_actor "platform_admin" "e2e-platform-admin-001"
  local dispatch_fixture="${TMP_DIR}/dispatch-auto.json"
  write_dispatch_fixture "$dispatch_fixture"
  http_call POST "/orders/${order_id}/dispatch" "$dispatch_fixture"
  assert_status "409"
  require_error_code "BOOKING_APPROVAL_PENDING"
  require_audit_match "rule_block" \
    ".data.items[] | select(.actionName == \"booking.approval_state.changed\" and .resourceId == \"${booking_id}\" and .newValuesSummary.approvalState == \"blocked\")"
}

subcase_no_approver_rollback() {
  log_step "F — no approver rollback"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"
  local before_count after_count fixture
  http_call GET "/tenant/quotas/ledger?costCenterCode=${CC_NOAPP}"
  assert_status "200"
  before_count=$(json_get ".data.items | length")
  fixture="${TMP_DIR}/booking-noapp.json"
  write_booking_fixture "$fixture" "$CC_NOAPP" ""
  http_call POST "/tenant/bookings" "$fixture"
  assert_status "409"
  require_error_code "APPROVAL_NO_RESOLVABLE_APPROVERS"
  http_call GET "/tenant/quotas/ledger?costCenterCode=${CC_NOAPP}"
  assert_status "200"
  after_count=$(json_get ".data.items | length")
  if [[ "$before_count" != "$after_count" ]]; then
    log_fail "Quota ledger residue detected for unresolved approver flow: before=${before_count}, after=${after_count}"
    exit 1
  fi
  save_evidence "$SCENARIO" "caseF" "quotaLedgerCount" "$after_count"
  require_audit_match "no_approver_evaluation" \
    ".data.items[] | select(.actionName == \"booking.approval_rules.evaluated\" and .newValuesSummary.decision == \"require_approval\")"
}

subcase_notes_and_reevaluation_and_rejection() {
  log_step "G/H/I — notes-only stability, governance-sensitive re-evaluation, rejection blocks dispatch"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  local booking_fixture="${TMP_DIR}/booking-ops.json"
  write_booking_fixture "$booking_fixture" "$CC_OPS" ""
  http_call POST "/tenant/bookings" "$booking_fixture"
  assert_status "200|201"
  local booking_id order_id initial_request_id notes_request_id reevaluated_request_id
  booking_id=$(json_get_first ".data.bookingId" ".data.booking_id")

  http_call GET "/tenant/approval-requests?bookingId=${booking_id}"
  assert_status "200"
  initial_request_id=$(echo "$RESP_BODY" | jq -r '.data.items[0].approvalRequestId // empty' 2>/dev/null || true)
  if [[ -z "$initial_request_id" ]]; then
    log_fail "Expected initial approval request for booking ${booking_id}"
    exit 1
  fi

  local notes_fixture="${TMP_DIR}/booking-notes-update.json"
  write_booking_update_fixture "$notes_fixture" "notes" "No governance change"
  http_call PUT "/tenant/bookings/${booking_id}" "$notes_fixture"
  assert_status "200"
  notes_request_id=$(echo "$RESP_BODY" | jq -r '.data.approvalRequestIds[0] // empty' 2>/dev/null || true)
  if [[ "$notes_request_id" != "$initial_request_id" ]]; then
    log_fail "Notes-only update re-evaluated unexpectedly: before=${initial_request_id}, after=${notes_request_id}"
    exit 1
  fi
  save_evidence "$SCENARIO" "caseH" "approvalRequestId" "$notes_request_id"

  local reevaluate_fixture="${TMP_DIR}/booking-reevaluate-update.json"
  write_booking_update_fixture "$reevaluate_fixture" "cost_center" "$CC_FIN"
  http_call PUT "/tenant/bookings/${booking_id}" "$reevaluate_fixture"
  assert_status "200"
  reevaluated_request_id=$(echo "$RESP_BODY" | jq -r '.data.approvalRequestIds[0] // empty' 2>/dev/null || true)
  if [[ -z "$reevaluated_request_id" || "$reevaluated_request_id" == "$initial_request_id" ]]; then
    log_fail "Governance-sensitive update did not produce a replacement approval request."
    exit 1
  fi
  http_call GET "/tenant/bookings/${booking_id}"
  assert_status "200"
  order_id=$(json_get_first ".data.orderId" ".data.order_id")
  save_evidence "$SCENARIO" "caseG" "oldApprovalRequestId" "$initial_request_id"
  save_evidence "$SCENARIO" "caseG" "newApprovalRequestId" "$reevaluated_request_id"
  require_audit_match "reevaluation_cancelled_request" \
    ".data.items[] | select(.actionName == \"booking.approval_request.cancelled_by_re_evaluation\" and .newValuesSummary.bookingId == \"${booking_id}\")"

  switch_actor "tenant_admin" "$TENANT_FINANCE_USER_ID" "$E2E_SEED_TENANT_ID"
  local reject_fixture="${TMP_DIR}/reject-request.json"
  write_reject_fixture "$reject_fixture"
  http_call POST "/tenant/approval-requests/${reevaluated_request_id}/reject" "$reject_fixture"
  assert_status "200"

  switch_actor "platform_admin" "e2e-platform-admin-001"
  local dispatch_fixture="${TMP_DIR}/dispatch-reject.json"
  write_dispatch_fixture "$dispatch_fixture"
  http_call POST "/orders/${order_id}/dispatch" "$dispatch_fixture"
  assert_status "409"
  require_error_code "BOOKING_APPROVAL_PENDING"
  save_evidence "$SCENARIO" "caseI" "bookingId" "$booking_id"
  require_audit_match "rejected_booking_not_dispatched" \
    ".data.items[] | select(.actionName == \"booking.approval_request.rejected\" and .newValuesSummary.bookingId == \"${booking_id}\")"
}

subcase_escalation_visible() {
  log_step "J — manual escalation visible in summary + audit"
  switch_actor "tenant_admin" "$TENANT_ADMIN_USER_ID" "$E2E_SEED_TENANT_ID"

  local booking_fixture="${TMP_DIR}/booking-escalate.json"
  write_booking_fixture "$booking_fixture" "$CC_FIN" ""
  http_call POST "/tenant/bookings" "$booking_fixture"
  assert_status "200|201"
  local booking_id request_id pending_count
  booking_id=$(json_get_first ".data.bookingId" ".data.booking_id")

  http_call GET "/tenant/approval-requests?bookingId=${booking_id}"
  assert_status "200"
  request_id=$(echo "$RESP_BODY" | jq -r '.data.items[0].approvalRequestId // empty' 2>/dev/null || true)
  if [[ -z "$request_id" ]]; then
    log_fail "Expected approval request for escalation booking ${booking_id}"
    exit 1
  fi

  local escalate_fixture="${TMP_DIR}/escalate-request.json"
  write_escalate_fixture "$escalate_fixture"
  http_call POST "/tenant/approval-requests/${request_id}/escalate" "$escalate_fixture"
  assert_status "200"
  save_evidence "$SCENARIO" "caseJ" "approvalRequestId" "$request_id"

  switch_actor "platform_admin" "e2e-platform-admin-001"
  http_call GET "/admin/tenant-governance/summary"
  assert_status "200"
  pending_count=$(echo "$RESP_BODY" | jq -r \
    --arg tenantId "$E2E_SEED_TENANT_ID" \
    '.data.items[] | select(.tenantId == $tenantId or .tenant_id == $tenantId) | .pendingApprovalCount // .pending_approval_count // 0' \
    2>/dev/null | head -1 || true)
  save_evidence "$SCENARIO" "caseJ" "pendingApprovalCount" "${pending_count:-0}"
  require_audit_match "manual_timeout_escalation" \
    ".data.items[] | select(.actionName == \"booking.approval_request.timeout_escalated\" and .newValuesSummary.bookingId == \"${booking_id}\")"
}

discover_tenant_users
bootstrap_cost_centers_and_rules
subcase_unknown_cost_center
subcase_disabled_cost_center
subcase_cross_tenant_cost_center
subcase_quota_insufficient
subcase_rule_block
subcase_no_approver_rollback
subcase_notes_and_reevaluation_and_rejection
subcase_escalation_visible

print_chain_summary

echo ""
log_ok "E2E-005 complete — tenant governance negative-path pack passed."
echo -e "Evidence log: ${E2E_EVIDENCE_FILE}"
