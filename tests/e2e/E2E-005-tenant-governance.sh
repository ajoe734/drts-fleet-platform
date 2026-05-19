#!/usr/bin/env bash
# E2E-005 — Tenant governance full lifecycle
#
# Surface chain:
#   Tenant Portal (governance setup + booking) → Ops Console (approval queue + dispatch)
#   → Driver App → Tenant Portal (quota/audit)
#
# Goal:
#   Exercise booking → quota → rule evaluation → approval → dispatch, plus a
#   quota-blocked branch, and verify the full 21-event tenant-governance audit
#   taxonomy can be observed for the generated test data.
#
# Cross-ref:
#   - docs/03-runbooks/tenant-governance-wave-closeout-20260514.md §2.2
#   - docs/04-api/audit-event-taxonomy.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-005"
chain_init

SCENARIO_START_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RUN_SUFFIX="$(date -u +%s | tail -c 7)"
TENANT_ID="${E2E_SEED_TENANT_ID}"
OPS_ACTOR_ID="e2e-ops-005-${RUN_SUFFIX}"
DRIVER_ACTOR_ID="e2e-driver-${E2E_SEED_DRIVER_ID}"

CC_OPS="E5OPS${RUN_SUFFIX}"
CC_FIN="E5FIN${RUN_SUFFIX}"
CC_EXEC="E5EXE${RUN_SUFFIX}"
CC_OLD="E5OLD${RUN_SUFFIX}"
CC_BLOCK="E5BLK${RUN_SUFFIX}"

RULE_OPS_NAME="E2E5 Ops approval ${RUN_SUFFIX}"
RULE_FIN_NAME="E2E5 Finance approval ${RUN_SUFFIX}"
RULE_FALLBACK_NAME="E2E5 Exec fallback ${RUN_SUFFIX}"
RULE_HIGH_NAME="E2E5 High value ${RUN_SUFFIX}"

RULE_OPS_ID=""
RULE_FIN_ID=""
RULE_FALLBACK_ID=""
RULE_HIGH_ID=""

TENANT_ADMIN_USER_ID=""
TENANT_FINANCE_USER_ID=""
TENANT_OPS_USER_ID=""

APPROVED_BOOKING_ID=""
APPROVED_ORDER_ID=""
APPROVED_REQUEST_ID=""
APPROVED_DISPATCH_JOB_ID=""
APPROVED_TASK_ID=""

EXPECTED_AUDIT_ACTIONS=(
  "tenant.quota_policy.updated"
  "tenant.approval_rule.updated"
  "tenant.approval_rule.created"
  "tenant.approval_rule.reordered"
  "tenant.approval_rule.disabled"
  "booking.approval_rules.evaluated"
  "booking.approval_request.created"
  "booking.approval_request.cancelled_by_re_evaluation"
  "booking.approval_request.nudged_by_ops"
  "booking.approval_request.sla_breach_acknowledged_by_ops"
  "list_cost_center_coverage"
  "upsert_cost_center"
  "disable_cost_center"
  "booking.approval_request.timeout_escalated"
  "booking.approval_request.approved"
  "booking.approval_request.rejected"
  "approver_fallback_used"
  "tenant.quota_reservation.blocked"
  "tenant.quota_ledger.entry_added"
  "tenant.quota_snapshot.refreshed"
  "booking.cost_center.validation_rejected"
)

TMP_FILES=()
cleanup() {
  if [[ ${#TMP_FILES[@]} -gt 0 ]]; then
    rm -f "${TMP_FILES[@]}"
  fi
}
trap cleanup EXIT

make_tmp_json() {
  local tmp
  tmp=$(mktemp "/tmp/drts-e2e-005-XXXXXX.json")
  TMP_FILES+=("$tmp")
  echo "$tmp"
}

json_from_file() {
  local source_file="$1"
  local target_file
  target_file=$(make_tmp_json)
  jq "${@:2}" "$source_file" > "$target_file"
  echo "$target_file"
}

write_json() {
  local target_file
  target_file=$(make_tmp_json)
  cat > "$target_file"
  echo "$target_file"
}

future_window_start() {
  date -u -d "+$1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+"$1"H +"%Y-%m-%dT%H:%M:%SZ"
}

future_window_end() {
  date -u -d "+$1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v+"$1"H +"%Y-%m-%dT%H:%M:%SZ"
}

booking_fixture() {
  local cost_center="$1"
  local rider_name="$2"
  local rider_phone="$3"
  local start_hour="$4"
  local end_hour="$5"
  json_from_file \
    "${SCRIPT_DIR}/fixtures/e2e-booking-enterprise.json" \
    --arg cc "$cost_center" \
    --arg rn "$rider_name" \
    --arg rp "$rider_phone" \
    --arg ws "$(future_window_start "$start_hour")" \
    --arg we "$(future_window_end "$end_hour")" \
    '.costCenter = $cc
    | .reservationWindowStart = $ws
    | .reservationWindowEnd = $we
    | .passenger.name = $rn
    | .passenger.phone = $rp'
}

switch_tenant_actor() {
  local actor_id="$1"
  switch_actor "tenant_admin" "$actor_id" "$TENANT_ID"
}

assert_error_code() {
  local expected="$1"
  local code
  code=$(echo "$RESP_BODY" | jq -r '.error.code // empty' 2>/dev/null || true)
  if [[ "$code" != "$expected" ]]; then
    log_fail "Expected error code ${expected}, got '${code:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  log_ok "Error code ${expected} confirmed"
}

fetch_approval_request_id() {
  local booking_id="$1"
  local status="${2:-}"
  switch_tenant_actor "$TENANT_ADMIN_USER_ID"
  if [[ -n "$status" ]]; then
    http_call GET "/tenant/approval-requests?bookingId=${booking_id}&status=${status}"
  else
    http_call GET "/tenant/approval-requests?bookingId=${booking_id}"
  fi
  assert_status "200"
  echo "$RESP_BODY" | jq -r '
    .data.items
    | sort_by(.createdAt // .created_at // "")
    | last
    | (.approvalRequestId // .approval_request_id // empty)
  ' 2>/dev/null || true
}

fetch_booking_field() {
  local booking_id="$1"
  local jq_expr="$2"
  switch_tenant_actor "$TENANT_ADMIN_USER_ID"
  http_call GET "/tenant/bookings/${booking_id}"
  assert_status "200"
  echo "$RESP_BODY" | jq -r "${jq_expr} // empty" 2>/dev/null || true
}

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-005 — Tenant governance lifecycle${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

log_surface "Tenant Portal — governance bootstrap"

switch_actor "tenant_admin" "e2e-tenant-bootstrap-${RUN_SUFFIX}" "$TENANT_ID"

log_step "0.1 — GET /tenant/users (resolve real approvers)"
http_call GET "/tenant/users"
assert_status "200"
TENANT_ADMIN_USER_ID=$(echo "$RESP_BODY" | jq -r '.data.items[] | select((.roleCode // .role_code) == "tenant_admin") | (.userId // .user_id)' 2>/dev/null | head -1 || true)
TENANT_FINANCE_USER_ID=$(echo "$RESP_BODY" | jq -r '.data.items[] | select((.roleCode // .role_code) == "tenant_finance_admin") | (.userId // .user_id)' 2>/dev/null | head -1 || true)
TENANT_OPS_USER_ID=$(echo "$RESP_BODY" | jq -r '.data.items[] | select((.roleCode // .role_code) == "tenant_ops_admin") | (.userId // .user_id)' 2>/dev/null | head -1 || true)

if [[ -z "$TENANT_ADMIN_USER_ID" || -z "$TENANT_FINANCE_USER_ID" || -z "$TENANT_OPS_USER_ID" ]]; then
  log_warn "Seed tenant is missing tenant_admin / tenant_finance_admin / tenant_ops_admin users."
  log_warn "Governance approval flows cannot be authorized on this environment; skipping E2E-005."
  exit 0
fi

chain_set "tenant" "tenantId" "$TENANT_ID"
chain_set "tenant" "tenantAdminUserId" "$TENANT_ADMIN_USER_ID"
chain_set "tenant" "tenantFinanceUserId" "$TENANT_FINANCE_USER_ID"
chain_set "tenant" "tenantOpsUserId" "$TENANT_OPS_USER_ID"
save_evidence "$SCENARIO" "tenant" "tenantAdminUserId" "$TENANT_ADMIN_USER_ID"
save_evidence "$SCENARIO" "tenant" "tenantFinanceUserId" "$TENANT_FINANCE_USER_ID"
save_evidence "$SCENARIO" "tenant" "tenantOpsUserId" "$TENANT_OPS_USER_ID"
log_ok "Approver identities resolved"

switch_tenant_actor "$TENANT_ADMIN_USER_ID"

log_step "0.2 — POST /tenant/cost-centers (create/update governance directory)"
for payload in \
  "{\"code\":\"${CC_OPS}\",\"name\":\"E2E5 Ops ${RUN_SUFFIX}\",\"ownerUserId\":\"${TENANT_OPS_USER_ID}\"}" \
  "{\"code\":\"${CC_FIN}\",\"name\":\"E2E5 Finance ${RUN_SUFFIX}\",\"ownerUserId\":\"${TENANT_FINANCE_USER_ID}\"}" \
  "{\"code\":\"${CC_EXEC}\",\"name\":\"E2E5 Executive ${RUN_SUFFIX}\",\"ownerUserId\":null}" \
  "{\"code\":\"${CC_OLD}\",\"name\":\"E2E5 Legacy ${RUN_SUFFIX}\",\"ownerUserId\":\"${TENANT_OPS_USER_ID}\"}" \
  "{\"code\":\"${CC_BLOCK}\",\"name\":\"E2E5 Blocked ${RUN_SUFFIX}\",\"ownerUserId\":\"${TENANT_FINANCE_USER_ID}\"}" \
  "{\"code\":\"${CC_OPS}\",\"name\":\"E2E5 Ops HQ ${RUN_SUFFIX}\",\"ownerUserId\":\"${TENANT_OPS_USER_ID}\"}"
do
  payload_file=$(write_json <<<"$payload")
  http_call POST "/tenant/cost-centers" "$payload_file"
  assert_status "200|201"
done
log_ok "Cost centers upserted"

log_step "0.3 — GET /tenant/cost-centers/coverage"
http_call GET "/tenant/cost-centers/coverage"
assert_status "200"
save_evidence "$SCENARIO" "tenant" "coverageGeneratedAt" "$(json_get '.data.generatedAt')"
log_ok "Coverage report listed"

log_step "0.4 — POST /tenant/cost-centers/disable"
payload_file=$(write_json <<EOF
{"code":"${CC_OLD}","reason":"e2e-005 disabled validation path"}
EOF
)
http_call POST "/tenant/cost-centers/disable" "$payload_file"
assert_status "200|201"
log_ok "Legacy cost center disabled"

log_step "0.5 — POST /tenant/quotas/policies (tenant-wide)"
payload_file=$(write_json <<EOF
{
  "period":"monthly",
  "limit":{
    "bookingCountLimit":12,
    "amountMinorLimit":1000000,
    "currency":"TWD",
    "enforcementMode":"hard_block"
  }
}
EOF
)
http_call POST "/tenant/quotas/policies" "$payload_file"
assert_status "200|201"

log_step "0.6 — POST /tenant/quotas/policies (blocked cost center)"
payload_file=$(write_json <<EOF
{
  "costCenterCode":"${CC_BLOCK}",
  "period":"monthly",
  "limit":{
    "bookingCountLimit":1,
    "amountMinorLimit":100000,
    "currency":"TWD",
    "enforcementMode":"hard_block"
  }
}
EOF
)
http_call POST "/tenant/quotas/policies" "$payload_file"
assert_status "200|201"
log_ok "Quota policies upserted"

log_step "0.7 — POST /tenant/approval-rules (create governance rules)"
payload_file=$(write_json <<EOF
{
  "ruleName":"${RULE_OPS_NAME}",
  "priority":10,
  "conditions":[{"field":"cost_center.code","op":"eq","value":"${CC_OPS}"}],
  "action":"require_approval",
  "approvalMode":"any_of",
  "approvers":[{"kind":"tenant_admin"}]
}
EOF
)
http_call POST "/tenant/approval-rules" "$payload_file"
assert_status "200|201"
RULE_OPS_ID=$(json_get_first ".data.ruleId" ".data.rule_id")

payload_file=$(write_json <<EOF
{
  "ruleName":"${RULE_FIN_NAME}",
  "priority":20,
  "conditions":[{"field":"cost_center.code","op":"eq","value":"${CC_FIN}"}],
  "action":"require_approval",
  "approvalMode":"any_of",
  "approvers":[{"kind":"tenant_finance_admin"}]
}
EOF
)
http_call POST "/tenant/approval-rules" "$payload_file"
assert_status "200|201"
RULE_FIN_ID=$(json_get_first ".data.ruleId" ".data.rule_id")

payload_file=$(write_json <<EOF
{
  "ruleName":"${RULE_FALLBACK_NAME}",
  "priority":30,
  "conditions":[{"field":"cost_center.code","op":"eq","value":"${CC_EXEC}"}],
  "action":"require_approval",
  "approvalMode":"ordered_chain",
  "approvers":[{"kind":"cost_center_owner","costCenterCode":"${CC_EXEC}"}],
  "escalationTarget":{"kind":"tenant_admin"}
}
EOF
)
http_call POST "/tenant/approval-rules" "$payload_file"
assert_status "200|201"
RULE_FALLBACK_ID=$(json_get_first ".data.ruleId" ".data.rule_id")

payload_file=$(write_json <<EOF
{
  "ruleName":"${RULE_HIGH_NAME}",
  "priority":40,
  "conditions":[{"field":"booking.amount_minor","op":"gte","value":100000}],
  "action":"require_approval",
  "approvalMode":"any_of",
  "approvers":[{"kind":"tenant_admin"}]
}
EOF
)
http_call POST "/tenant/approval-rules" "$payload_file"
assert_status "200|201"
RULE_HIGH_ID=$(json_get_first ".data.ruleId" ".data.rule_id")
log_ok "Approval rules created"

log_step "0.8 — PUT /tenant/approval-rules/:ruleId (update high-value rule)"
payload_file=$(write_json <<EOF
{
  "ruleName":"${RULE_HIGH_NAME}",
  "description":"Updated during E2E-005 taxonomy coverage",
  "priority":40,
  "conditions":[{"field":"booking.amount_minor","op":"gte","value":100000}],
  "action":"require_approval",
  "approvalMode":"any_of",
  "approvers":[{"kind":"tenant_admin"}]
}
EOF
)
http_call PUT "/tenant/approval-rules/${RULE_HIGH_ID}" "$payload_file"
assert_status "200|201"

log_step "0.9 — POST /tenant/approval-rules/reorder"
payload_file=$(write_json <<EOF
{"orderedRuleIds":["${RULE_FALLBACK_ID}","${RULE_FIN_ID}","${RULE_OPS_ID}","${RULE_HIGH_ID}"]}
EOF
)
http_call POST "/tenant/approval-rules/reorder" "$payload_file"
assert_status "200|201"

log_step "0.10 — POST /tenant/approval-rules/:ruleId/disable"
http_call POST "/tenant/approval-rules/${RULE_HIGH_ID}/disable" "$(write_json <<< '{}')"
assert_status "200|201"
log_ok "Approval rule update / reorder / disable complete"

log_step "0.11 — POST /tenant/quotas/preview"
payload_file=$(write_json <<EOF
{
  "costCenterCode":"${CC_FIN}",
  "estimatedAmountMinor":150000,
  "currency":"TWD",
  "reservationWindowStart":"$(future_window_start 1)",
  "businessDispatchSubtype":"enterprise_dispatch"
}
EOF
)
http_call POST "/tenant/quotas/preview" "$payload_file"
assert_status "200"
PREVIEW_TRIGGER=$(echo "$RESP_BODY" | jq -r '.data.impacts[0].triggered // empty' 2>/dev/null || true)
save_evidence "$SCENARIO" "tenant" "quotaPreviewTriggered" "${PREVIEW_TRIGGER:-unknown}"
log_ok "Quota preview captured"

log_step "0.12 — POST /tenant/approval-rules/evaluate"
payload_file=$(write_json <<EOF
{
  "subject":{"subjectType":"booking","bookingId":null,"draftId":"e2e-005-dry-run","operation":"dry_run"},
  "inputSnapshot":{
    "costCenterCode":"${CC_FIN}",
    "businessDispatchSubtype":"enterprise_dispatch",
    "reservationWindowStart":"$(future_window_start 1)",
    "reservationWindowEnd":"$(future_window_end 2)",
    "passengerId":null,
    "passengerRole":"guest",
    "amountMinor":150000,
    "currency":"TWD",
    "vehiclePreference":null
  },
  "quotaImpacts":[]
}
EOF
)
http_call POST "/tenant/approval-rules/evaluate" "$payload_file"
assert_status "200"
log_ok "Rule dry-run evaluation emitted"

log_step "0.13 — POST /tenant/bookings (disabled cost-center validation)"
payload_file=$(booking_fixture "$CC_OLD" "E2E5 Invalid Rider" "0912050000" 1 2)
http_call POST "/tenant/bookings" "$payload_file"
if [[ "$RESP_STATUS" =~ ^2 ]]; then
  log_fail "Disabled cost-center booking unexpectedly succeeded."
  exit 1
fi
assert_error_code "BOOKING_COST_CENTER_DISABLED"

log_surface "Tenant Portal — approved governance flow"

switch_tenant_actor "$TENANT_ADMIN_USER_ID"

log_step "1.1 — POST /tenant/bookings (approval-required booking)"
payload_file=$(booking_fixture "$CC_FIN" "E2E5 Approved Rider" "0912050001" 3 4)
http_call POST "/tenant/bookings" "$payload_file"
assert_status "200|201"
APPROVED_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
if [[ -z "$APPROVED_BOOKING_ID" ]]; then
  log_fail "Approval-required booking did not return bookingId."
  exit 1
fi
APPROVED_ORDER_ID=$(fetch_booking_field "$APPROVED_BOOKING_ID" '.data.orderId // .data.order_id')
APPROVED_STATE=$(fetch_booking_field "$APPROVED_BOOKING_ID" '.data.approvalState // .data.approval_state')
APPROVED_REQUEST_ID=$(fetch_approval_request_id "$APPROVED_BOOKING_ID" "pending")

if [[ "$APPROVED_STATE" != "pending" || -z "$APPROVED_REQUEST_ID" ]]; then
  log_fail "Expected approval-required booking to be pending with a request."
  exit 1
fi

chain_set "tenant" "approvedBookingId" "$APPROVED_BOOKING_ID"
chain_set "tenant" "approvedOrderId" "$APPROVED_ORDER_ID"
chain_set "tenant" "approvedRequestId" "$APPROVED_REQUEST_ID"
save_evidence "$SCENARIO" "tenant" "approvedBookingId" "$APPROVED_BOOKING_ID"
save_evidence "$SCENARIO" "tenant" "approvedRequestId" "$APPROVED_REQUEST_ID"
log_ok "Approval-required booking created"

log_step "1.2 — GET /ops/approval-requests?tenantId="
switch_actor "ops_user" "$OPS_ACTOR_ID"
http_call GET "/ops/approval-requests?tenantId=${TENANT_ID}&status=pending"
assert_status "200"
OPS_QUEUE_REQUEST=$(echo "$RESP_BODY" | jq -r --arg rid "$APPROVED_REQUEST_ID" '.data.items[] | select((.approvalRequestId // .approval_request_id) == $rid) | (.approvalRequestId // .approval_request_id)' 2>/dev/null | head -1 || true)
if [[ -z "$OPS_QUEUE_REQUEST" ]]; then
  log_fail "Approval request not visible in ops queue."
  exit 1
fi
log_ok "Approval request visible in ops queue"

log_step "1.3 — POST /ops/approval-requests/:id/nudge"
payload_file=$(write_json <<EOF
{"reasonNote":"E2E-005 nudge before approval"}
EOF
)
http_call POST "/ops/approval-requests/${APPROVED_REQUEST_ID}/nudge" "$payload_file"
assert_status "200|201"

log_step "1.4 — POST /ops/approval-requests/:id/acknowledge-breach"
payload_file=$(write_json <<EOF
{"reasonNote":"E2E-005 SLA acknowledgement"}
EOF
)
http_call POST "/ops/approval-requests/${APPROVED_REQUEST_ID}/acknowledge-breach" "$payload_file"
assert_status "200|201"

log_step "1.5 — POST /orders/:orderId/dispatch (must block while pending)"
payload_file=$(write_json <<EOF
{"mode":"auto"}
EOF
)
http_call POST "/orders/${APPROVED_ORDER_ID}/dispatch" "$payload_file"
if [[ "$RESP_STATUS" == "200" || "$RESP_STATUS" == "201" ]]; then
  log_fail "Dispatch unexpectedly succeeded while booking approval was pending."
  exit 1
fi
assert_error_code "BOOKING_APPROVAL_PENDING"

log_step "1.6 — POST /tenant/approval-requests/:id/approve"
switch_tenant_actor "$TENANT_FINANCE_USER_ID"
http_call POST "/tenant/approval-requests/${APPROVED_REQUEST_ID}/approve" "$(write_json <<< '{}')"
assert_status "200|201"

APPROVED_STATE=$(fetch_booking_field "$APPROVED_BOOKING_ID" '.data.approvalState // .data.approval_state')
if [[ "$APPROVED_STATE" != "approved" ]]; then
  log_fail "Expected approved booking approvalState=approved, got '${APPROVED_STATE:-<empty>}'"
  exit 1
fi
save_evidence "$SCENARIO" "tenant" "approvedBookingApprovalState" "$APPROVED_STATE"
log_ok "Booking approved"

log_surface "Ops Console — approved booking dispatch"

switch_actor "ops_user" "$OPS_ACTOR_ID"

log_step "2.1 — POST /orders/:orderId/dispatch"
payload_file=$(write_json <<EOF
{"mode":"auto"}
EOF
)
http_call POST "/orders/${APPROVED_ORDER_ID}/dispatch" "$payload_file"
assert_status "200|201"
APPROVED_DISPATCH_JOB_ID=$(json_get_first ".data.dispatchJobId" ".data.dispatch_job_id")

log_step "2.2 — GET /dispatch/tasks (resolve dispatch job)"
attempt=0
while (( attempt < E2E_POLL_MAX )) && [[ -z "$APPROVED_DISPATCH_JOB_ID" ]]; do
  http_call GET "/dispatch/tasks"
  assert_status "200"
  APPROVED_DISPATCH_JOB_ID=$(echo "$RESP_BODY" | jq -r --arg oid "$APPROVED_ORDER_ID" '.data.items[] | select((.orderId // .order_id) == $oid) | (.dispatchJobId // .dispatch_job_id)' 2>/dev/null | head -1 || true)
  [[ -n "$APPROVED_DISPATCH_JOB_ID" ]] && break
  sleep "$E2E_POLL_INTERVAL"
  attempt=$((attempt + 1))
done
if [[ -z "$APPROVED_DISPATCH_JOB_ID" ]]; then
  log_fail "Dispatch job never appeared for approved booking."
  exit 1
fi

chain_set "ops" "dispatchJobId" "$APPROVED_DISPATCH_JOB_ID"
save_evidence "$SCENARIO" "ops" "dispatchJobId" "$APPROVED_DISPATCH_JOB_ID"
log_ok "Dispatch job resolved"

log_step "2.3 — GET /dispatch/tasks/:dispatchJobId/candidates"
http_call GET "/dispatch/tasks/${APPROVED_DISPATCH_JOB_ID}/candidates"
assert_status "200"
ASSIGN_VEHICLE_ID=$(echo "$RESP_BODY" | jq -r '.data.items[0] | (.vehicleId // .vehicle_id // empty)' 2>/dev/null || true)
ASSIGN_DRIVER_ID=$(echo "$RESP_BODY" | jq -r '.data.items[0] | (.driverId // .driver_id // empty)' 2>/dev/null || true)
[[ -z "$ASSIGN_VEHICLE_ID" ]] && ASSIGN_VEHICLE_ID="$E2E_SEED_VEHICLE_ID"
[[ -z "$ASSIGN_DRIVER_ID" ]] && ASSIGN_DRIVER_ID="$E2E_SEED_DRIVER_ID"

log_step "2.4 — POST /dispatch/assign"
payload_file=$(json_from_file \
  "${SCRIPT_DIR}/fixtures/e2e-dispatch-assign.json" \
  --arg jobId "$APPROVED_DISPATCH_JOB_ID" \
  --arg vehicle "$ASSIGN_VEHICLE_ID" \
  --arg driver "$ASSIGN_DRIVER_ID" \
  '.dispatchJobId = $jobId | .vehicleId = $vehicle | .driverId = $driver')
http_call POST "/dispatch/assign" "$payload_file"
assert_status "200|201"
APPROVED_TASK_ID=$(json_get_first ".data.taskId" ".data.task_id")
if [[ -z "$APPROVED_TASK_ID" ]]; then
  http_call GET "/driver/tasks"
  assert_status "200"
  APPROVED_TASK_ID=$(echo "$RESP_BODY" | jq -r --arg jobId "$APPROVED_DISPATCH_JOB_ID" '.data.items[] | select((.dispatchJobId // .dispatch_job_id) == $jobId) | (.taskId // .task_id)' 2>/dev/null | head -1 || true)
fi
if [[ -z "$APPROVED_TASK_ID" ]]; then
  log_fail "dispatch/assign did not yield a driver task."
  exit 1
fi
chain_set "driver" "taskId" "$APPROVED_TASK_ID"
save_evidence "$SCENARIO" "driver" "taskId" "$APPROVED_TASK_ID"
log_ok "Dispatch assignment created"

log_surface "Driver App — approved booking lifecycle"

switch_actor "driver_user" "$DRIVER_ACTOR_ID" "$TENANT_ID"

log_step "3.1 — POST /driver/tasks/:taskId/accept"
payload_file=$(json_from_file \
  "${SCRIPT_DIR}/fixtures/e2e-driver-accept.json" \
  --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '.acceptedAt = $ts')
http_call POST "/driver/tasks/${APPROVED_TASK_ID}/accept" "$payload_file"
assert_status "200|201"

log_step "3.2 — POST /driver/tasks/:taskId/depart"
payload_file=$(json_from_file \
  "${SCRIPT_DIR}/fixtures/e2e-driver-depart.json" \
  --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '.departedAt = $ts')
http_call POST "/driver/tasks/${APPROVED_TASK_ID}/depart" "$payload_file"
assert_status "200|201"

log_step "3.3 — POST /driver/tasks/:taskId/arrived_pickup"
payload_file=$(json_from_file \
  "${SCRIPT_DIR}/fixtures/e2e-driver-arrived-pickup.json" \
  --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '.arrivedAt = $ts')
http_call POST "/driver/tasks/${APPROVED_TASK_ID}/arrived_pickup" "$payload_file"
assert_status "200|201"

log_step "3.4 — POST /driver/tasks/:taskId/start"
payload_file=$(json_from_file \
  "${SCRIPT_DIR}/fixtures/e2e-driver-start.json" \
  --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '.startedAt = $ts')
http_call POST "/driver/tasks/${APPROVED_TASK_ID}/start" "$payload_file"
assert_status "200|201"

log_step "3.5 — POST /driver/tasks/:taskId/complete"
completed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
payload_file=$(json_from_file \
  "${SCRIPT_DIR}/fixtures/e2e-driver-complete.json" \
  --arg ts "$completed_at" \
  '.completedAt = $ts | .signoff.signedAt = $ts')
http_call POST "/driver/tasks/${APPROVED_TASK_ID}/complete" "$payload_file"
assert_status "200|201"
save_evidence "$SCENARIO" "driver" "completedAt" "$completed_at"
log_ok "Driver trip completed"

log_surface "Tenant Portal — quota, billing, and audit branches"

switch_tenant_actor "$TENANT_ADMIN_USER_ID"

log_step "4.1 — GET /tenant/quotas/ledger?bookingId="
http_call GET "/tenant/quotas/ledger?bookingId=${APPROVED_BOOKING_ID}"
assert_status "200"
LEDGER_COUNT=$(json_get ".data.items | length")
if [[ "${LEDGER_COUNT:-0}" -lt 1 ]]; then
  log_fail "Expected at least one quota ledger entry for approved booking."
  exit 1
fi
save_evidence "$SCENARIO" "tenant" "approvedBookingLedgerEntries" "$LEDGER_COUNT"
log_ok "Quota ledger entries present"

log_step "4.2 — POST /tenant/invoices/generate"
sleep 2
period_start=$(date -u +"%Y-%m-%dT00:00:00Z")
period_end=$(date -u -d "-1 second" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v-1S +"%Y-%m-%dT%H:%M:%SZ")
payload_file=$(write_json <<EOF
{"tenantId":"${TENANT_ID}","periodStart":"${period_start}","periodEnd":"${period_end}"}
EOF
)
http_call POST "/tenant/invoices/generate" "$payload_file"
assert_status "200|201"
INVOICE_ID=$(json_get_first ".data.invoiceId" ".data.invoice_id")
chain_set "billing" "invoiceId" "$INVOICE_ID"
save_evidence "$SCENARIO" "billing" "invoiceId" "$INVOICE_ID"
log_ok "Invoice generated"

log_step "4.3 — POST /tenant/bookings (quota-blocked booking)"
payload_file=$(booking_fixture "$CC_BLOCK" "E2E5 Blocked Rider" "0912050002" 5 6)
http_call POST "/tenant/bookings" "$payload_file"
assert_status "200|201"
BLOCKED_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
BLOCKED_ORDER_ID=$(fetch_booking_field "$BLOCKED_BOOKING_ID" '.data.orderId // .data.order_id')
BLOCKED_STATE=$(fetch_booking_field "$BLOCKED_BOOKING_ID" '.data.approvalState // .data.approval_state')
if [[ "$BLOCKED_STATE" != "blocked" ]]; then
  log_fail "Expected quota-blocked booking approvalState=blocked, got '${BLOCKED_STATE:-<empty>}'"
  exit 1
fi
http_call POST "/orders/${BLOCKED_ORDER_ID}/dispatch" "$(write_json <<< '{"mode":"auto"}')"
if [[ "$RESP_STATUS" == "200" || "$RESP_STATUS" == "201" ]]; then
  log_fail "Quota-blocked booking unexpectedly dispatched."
  exit 1
fi
assert_error_code "BOOKING_APPROVAL_PENDING"
save_evidence "$SCENARIO" "tenant" "blockedBookingId" "$BLOCKED_BOOKING_ID"
log_ok "Blocked branch verified"

log_step "4.4 — POST /tenant/bookings (rejected booking)"
payload_file=$(booking_fixture "$CC_FIN" "E2E5 Rejected Rider" "0912050003" 7 8)
http_call POST "/tenant/bookings" "$payload_file"
assert_status "200|201"
REJECTED_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
REJECTED_REQUEST_ID=$(fetch_approval_request_id "$REJECTED_BOOKING_ID" "pending")
switch_tenant_actor "$TENANT_FINANCE_USER_ID"
payload_file=$(write_json <<EOF
{"reasonCode":"finance_reject","reasonNote":"E2E-005 rejection path"}
EOF
)
http_call POST "/tenant/approval-requests/${REJECTED_REQUEST_ID}/reject" "$payload_file"
assert_status "200|201"
log_ok "Rejected branch verified"

log_step "4.5 — POST /tenant/bookings (manual escalate booking)"
switch_tenant_actor "$TENANT_ADMIN_USER_ID"
payload_file=$(booking_fixture "$CC_FIN" "E2E5 Escalated Rider" "0912050004" 9 10)
http_call POST "/tenant/bookings" "$payload_file"
assert_status "200|201"
ESCALATED_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
ESCALATED_REQUEST_ID=$(fetch_approval_request_id "$ESCALATED_BOOKING_ID" "pending")
payload_file=$(write_json <<EOF
{"reasonNote":"E2E-005 manual escalation"}
EOF
)
http_call POST "/tenant/approval-requests/${ESCALATED_REQUEST_ID}/escalate" "$payload_file"
assert_status "200|201"
log_ok "Escalation branch verified"

log_step "4.6 — POST /tenant/bookings (fallback approver booking)"
payload_file=$(booking_fixture "$CC_EXEC" "E2E5 Fallback Rider" "0912050005" 11 12)
http_call POST "/tenant/bookings" "$payload_file"
assert_status "200|201"
FALLBACK_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
FALLBACK_REQUEST_ID=$(fetch_approval_request_id "$FALLBACK_BOOKING_ID" "pending")
if [[ -z "$FALLBACK_REQUEST_ID" ]]; then
  log_fail "Fallback booking did not create an approval request."
  exit 1
fi
log_ok "Fallback approver branch created"

log_step "4.7 — POST /tenant/bookings + PUT /tenant/bookings/:id (re-evaluation)"
payload_file=$(booking_fixture "$CC_OPS" "E2E5 Reeval Rider" "0912050006" 13 14)
http_call POST "/tenant/bookings" "$payload_file"
assert_status "200|201"
REEVAL_BOOKING_ID=$(json_get_first ".data.bookingId" ".data.booking_id")
ORIGINAL_REEVAL_REQUEST_ID=$(fetch_approval_request_id "$REEVAL_BOOKING_ID" "pending")
payload_file=$(write_json <<EOF
{"costCenter":"${CC_FIN}"}
EOF
)
http_call PUT "/tenant/bookings/${REEVAL_BOOKING_ID}" "$payload_file"
assert_status "200|201"
NEW_REEVAL_REQUEST_ID=$(fetch_approval_request_id "$REEVAL_BOOKING_ID" "pending")
if [[ -z "$ORIGINAL_REEVAL_REQUEST_ID" || -z "$NEW_REEVAL_REQUEST_ID" || "$ORIGINAL_REEVAL_REQUEST_ID" == "$NEW_REEVAL_REQUEST_ID" ]]; then
  log_fail "Re-evaluation did not rotate to a new approval request."
  exit 1
fi
log_ok "Re-evaluation branch verified"

log_step "4.8 — GET /tenant/audit (verify 21-event taxonomy for this run window)"
switch_tenant_actor "$TENANT_ADMIN_USER_ID"
http_call GET "/tenant/audit"
assert_status "200"

for action_name in "${EXPECTED_AUDIT_ACTIONS[@]}"; do
  present=$(echo "$RESP_BODY" | jq -r \
    --arg action "$action_name" \
    --arg started_at "$SCENARIO_START_AT" \
    '[.data.items[] | select(.actionName == $action and (.createdAt // .created_at // "") >= $started_at)] | length' \
    2>/dev/null || true)
  if [[ "${present:-0}" -lt 1 ]]; then
    log_fail "Expected tenant audit to include action '${action_name}' for the current E2E-005 run window."
    exit 1
  fi
done

UNIQUE_EXPECTED_COUNT=$(printf '%s\n' "${EXPECTED_AUDIT_ACTIONS[@]}" | wc -l | tr -d ' ')
OBSERVED_EXPECTED_COUNT=$(echo "$RESP_BODY" | jq -r \
  --arg started_at "$SCENARIO_START_AT" \
  --argjson expected "$(printf '%s\n' "${EXPECTED_AUDIT_ACTIONS[@]}" | jq -R . | jq -s .)" \
  '[.data.items[]
    | select((.createdAt // .created_at // "") >= $started_at)
    | select((.actionName as $a | $expected | index($a)) != null)
    | .actionName] | unique | length' 2>/dev/null || true)
save_evidence "$SCENARIO" "audit" "expectedActionCount" "$UNIQUE_EXPECTED_COUNT"
save_evidence "$SCENARIO" "audit" "observedExpectedActionCount" "${OBSERVED_EXPECTED_COUNT:-0}"
save_evidence "$SCENARIO" "audit" "runWindowStartedAt" "$SCENARIO_START_AT"
log_ok "All ${UNIQUE_EXPECTED_COUNT} governance audit actions observed"

log_step "4.9 — GET /orders/:orderId/dispatch-trace"
switch_actor "ops_user" "$OPS_ACTOR_ID"
http_call GET "/orders/${APPROVED_ORDER_ID}/dispatch-trace"
assert_status "200"
TRACE_COUNT=$(json_get ".data.items | length")
if [[ "${TRACE_COUNT:-0}" -lt 6 ]]; then
  log_fail "Expected dispatch trace to capture the approved flow."
  exit 1
fi
save_evidence "$SCENARIO" "ops" "dispatchTraceCount" "$TRACE_COUNT"
log_ok "Dispatch trace captured"

log_step "Chain continuity assertions"
assert_chain "tenant" "tenantId"
assert_chain "tenant" "approvedBookingId"
assert_chain "tenant" "approvedOrderId"
assert_chain "tenant" "approvedRequestId"
assert_chain "ops" "dispatchJobId"
assert_chain "driver" "taskId"
assert_chain "billing" "invoiceId"

print_chain_summary

echo ""
log_ok "E2E-005 complete — tenant governance lifecycle passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
