#!/usr/bin/env bash
# E2E-011 — Platform admin control-plane full chain
#
# Surface chain:
#   Platform Admin (tenant create/settings/onboarding/rollout)
#   -> Partner Governance (entry + credential)
#   -> Platform Pricing (draft + publish)
#   -> Audit
#
# Pass criteria (E2E-011):
#   1. Platform admin can create a tenant and mutate modules/quotas/onboarding.
#   2. Platform admin can create a partner entry and issue an ingress credential.
#   3. Credential plaintext is returned only at issue time; list read-back is masked.
#   4. Pricing publish produces an active version.
#   5. Rollout promotion gate rejects premature production promotion and blocks promotion while rollback_hold is active.
#   6. Tenant can progress sandbox -> pilot -> production after the required controls are satisfied.
#   7. Audit contains the expected mutation family for tenant, partner, credential, pricing, and rollout operations.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-011"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-011 — Platform admin control-plane full chain${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-011-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

RUN_TAG="$(date +%s)"
TENANT_CODE="e2eadm${RUN_TAG}"
TENANT_NAME="E2E Admin Tenant ${RUN_TAG}"
PARTNER_ENTRY_SLUG="e2e-admin-entry-${RUN_TAG}"
PRICING_VERSION="e2e-admin-${RUN_TAG}"

NEW_TENANT_ID=""
PARTNER_KEY_ID=""
PRICING_RULE_ID=""

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

assert_json_equals() {
  local actual="$1" expected="$2" message="$3"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "${message}: expected '${expected}', got '${actual:-<empty>}'"
    exit 1
  fi
}

write_tenant_create_fixture() {
  local path="$1"
  jq -n \
    --arg name "$TENANT_NAME" \
    --arg code "$TENANT_CODE" \
    '{
      name: $name,
      code: $code,
      enabledModules: ["enterprise_dispatch"],
      integrationMode: "api_key_and_webhook",
      bootstrapAdminEmail: "ops-admin@e2e.example.com",
      sandboxBaseUrl: "https://sandbox.e2e-admin.example.com"
    }' > "$path"
}

write_modules_fixture() {
  local path="$1"
  jq -n \
    '{
      enabledModules: ["enterprise_dispatch", "billing", "reporting", "webhooks"]
    }' > "$path"
}

write_quotas_fixture() {
  local path="$1"
  jq -n \
    '{
      quotas: {
        activeDrivers: 12,
        monthlyBookings: 345,
        monthlyApiCalls: 6789
      }
    }' > "$path"
}

write_onboarding_fixture() {
  local path="$1"
  jq -n \
    '{
      billingBaseline: {
        invoiceTitle: "E2E Admin Tenant Billing",
        contactName: "E2E Billing Owner",
        email: "billing-owner@e2e.example.com"
      },
      integrationPackage: {
        mode: "api_key_and_webhook",
        sandboxBaseUrl: "https://sandbox.e2e-admin.example.com",
        productionBaseUrl: "https://api.e2e-admin.example.com",
        apiKeyScopes: [
          "tenant:bookings:write",
          "tenant:reports:read",
          "tenant:webhooks:write"
        ]
      },
      rollout: {
        cutoverOwner: "E2E Cutover Owner",
        rollbackOwner: "E2E Rollback Owner",
        rollbackPrepared: true,
        notes: "E2E-011 rollout metadata"
      }
    }' > "$path"
}

write_role_fixture() {
  local path="$1" role_code="$2"
  jq -n --arg roleCode "$role_code" '{ roleCode: $roleCode }' > "$path"
}

write_rollout_fixture() {
  local path="$1" stage="$2" notes="$3"
  jq -n \
    --arg stage "$stage" \
    --arg notes "$notes" \
    '{ stage: $stage, notes: $notes }' > "$path"
}

write_partner_entry_fixture() {
  local path="$1"
  jq -n \
    --arg tenantId "$NEW_TENANT_ID" \
    --arg entrySlug "$PARTNER_ENTRY_SLUG" \
    '{
      tenantId: $tenantId,
      partnerCode: "bank_demo_alpha",
      partnerType: "bank",
      programId: "program-e2e-admin",
      programCode: "PROGRAM_E2E_ADMIN",
      bankCode: "BKE2E",
      entrySlug: $entrySlug,
      displayName: "E2E Admin Partner Entry",
      businessDispatchSubtype: "credit_card_airport_transfer",
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      entryHost: "partner-e2e.example.com",
      entryPath: "/airport-transfer",
      themeAccent: "#0055AA",
      status: "active",
      activeFlag: true
    }' > "$path"
}

write_issue_credential_fixture() {
  local path="$1"
  jq -n '{ rotationReason: "e2e_initial_issue" }' > "$path"
}

write_pricing_create_fixture() {
  local path="$1"
  jq -n \
    --arg version "$PRICING_VERSION" \
    '{
      ruleName: "E2E Admin Pricing",
      version: $version,
      serviceFeeBps: 850,
      reimbursementMode: "mixed",
      applicableTo: "all",
      notes: "E2E-011 publish flow"
    }' > "$path"
}

write_pricing_publish_fixture() {
  local path="$1"
  jq -n \
    '{ publishedBy: "e2e-platform-admin-011" }' > "$path"
}

require_audit_count() {
  local action_name="$1" resource_id="$2" minimum="$3"
  switch_actor "platform_admin" "e2e-platform-admin-011"
  http_call GET "/audit"
  assert_status "200"

  local count
  count=$(echo "$RESP_BODY" | jq -r \
    --arg action "$action_name" \
    --arg resource "$resource_id" \
    '[.data.items[] | select(.actionName == $action and (.resourceId // "") == $resource)] | length' \
    2>/dev/null || true)
  count="${count:-0}"

  if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= minimum )); then
    save_evidence "$SCENARIO" "audit" "${action_name}" "$count"
    log_ok "Audit count ${action_name}/${resource_id} = ${count}"
    return 0
  fi

  log_fail "Expected audit count >= ${minimum} for action=${action_name}, resourceId=${resource_id}; got '${count:-<empty>}'"
  log_fail "Body: ${RESP_BODY}"
  exit 1
}

log_surface "Platform Admin — tenant authority"
switch_actor "platform_admin" "e2e-platform-admin-011"

TENANT_CREATE_FIXTURE="${TMP_DIR}/tenant-create.json"
MODULES_FIXTURE="${TMP_DIR}/tenant-modules.json"
QUOTAS_FIXTURE="${TMP_DIR}/tenant-quotas.json"
ONBOARDING_FIXTURE="${TMP_DIR}/tenant-onboarding.json"
ROLE_TENANT_ADMIN_FIXTURE="${TMP_DIR}/role-tenant-admin.json"
ROLE_TENANT_OPS_FIXTURE="${TMP_DIR}/role-tenant-ops-admin.json"
ROLLOUT_PRODUCTION_FIXTURE="${TMP_DIR}/rollout-production.json"
ROLLOUT_SANDBOX_FIXTURE="${TMP_DIR}/rollout-sandbox.json"
ROLLOUT_PILOT_FIXTURE="${TMP_DIR}/rollout-pilot.json"
PARTNER_ENTRY_FIXTURE="${TMP_DIR}/partner-entry.json"
ISSUE_CREDENTIAL_FIXTURE="${TMP_DIR}/credential-issue.json"
PRICING_CREATE_FIXTURE="${TMP_DIR}/pricing-create.json"
PRICING_PUBLISH_FIXTURE="${TMP_DIR}/pricing-publish.json"

write_tenant_create_fixture "$TENANT_CREATE_FIXTURE"
write_modules_fixture "$MODULES_FIXTURE"
write_quotas_fixture "$QUOTAS_FIXTURE"
write_onboarding_fixture "$ONBOARDING_FIXTURE"
write_role_fixture "$ROLE_TENANT_ADMIN_FIXTURE" "tenant_admin"
write_role_fixture "$ROLE_TENANT_OPS_FIXTURE" "tenant_ops_admin"
write_rollout_fixture "$ROLLOUT_PRODUCTION_FIXTURE" "production" "Premature promotion should fail"
write_rollout_fixture "$ROLLOUT_SANDBOX_FIXTURE" "sandbox" "Sandbox promotion for E2E-011"
write_rollout_fixture "$ROLLOUT_PILOT_FIXTURE" "pilot" "Pilot promotion for E2E-011"
write_issue_credential_fixture "$ISSUE_CREDENTIAL_FIXTURE"
write_pricing_create_fixture "$PRICING_CREATE_FIXTURE"
write_pricing_publish_fixture "$PRICING_PUBLISH_FIXTURE"

log_step "1.1 — POST /platform-admin/tenants"
http_call POST "/platform-admin/tenants" "$TENANT_CREATE_FIXTURE"
assert_status "200|201"

NEW_TENANT_ID="$(json_get_first ".data.tenantId" ".data.id")"
if [[ -z "$NEW_TENANT_ID" ]]; then
  log_fail "No tenantId/id returned from tenant create."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "tenantId" "$NEW_TENANT_ID"
chain_set "platform_admin" "tenantCode" "$TENANT_CODE"
save_evidence "$SCENARIO" "platform_admin" "tenantId" "$NEW_TENANT_ID"
log_ok "Tenant created: tenantId=${NEW_TENANT_ID}, code=${TENANT_CODE}"

write_partner_entry_fixture "$PARTNER_ENTRY_FIXTURE"

log_step "1.2 — POST /platform-admin/tenants/:tenantId/settings (modules)"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/settings" "$MODULES_FIXTURE"
assert_status "200|201"
MODULES_COUNT="$(echo "$RESP_BODY" | jq -r '.data.enabledModules | length' 2>/dev/null || true)"
if [[ "${MODULES_COUNT:-0}" -lt 4 ]]; then
  log_fail "Expected 4 enabled modules after modules update."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "platform_admin" "enabledModulesCount" "$MODULES_COUNT"
log_ok "Modules updated to billing/reporting/webhooks-enabled tenant"

log_step "1.3 — POST /platform-admin/tenants/:tenantId/settings (quotas)"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/settings" "$QUOTAS_FIXTURE"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.quotas.activeDrivers // empty' 2>/dev/null || true)" "12" "Quota activeDrivers mismatch"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.quotas.monthlyBookings // empty' 2>/dev/null || true)" "345" "Quota monthlyBookings mismatch"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.quotas.monthlyApiCalls // empty' 2>/dev/null || true)" "6789" "Quota monthlyApiCalls mismatch"
save_evidence "$SCENARIO" "platform_admin" "monthlyBookingsQuota" "345"
log_ok "Tenant quotas updated"

log_step "1.4 — POST /platform-admin/tenants/:tenantId/onboarding"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/onboarding" "$ONBOARDING_FIXTURE"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.rollout.cutoverOwner // empty' 2>/dev/null || true)" "E2E Cutover Owner" "Cutover owner mismatch"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.rollout.rollbackPrepared // empty' 2>/dev/null || true)" "true" "Rollback prepared mismatch"
save_evidence "$SCENARIO" "platform_admin" "cutoverOwner" "E2E Cutover Owner"
log_ok "Onboarding package updated with rollout metadata"

log_step "1.5 — POST /platform-admin/tenants/:tenantId/rollout (production should fail before gates)"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/rollout" "$ROLLOUT_PRODUCTION_FIXTURE"
assert_status "409"
require_error_code "TENANT_PROMOTION_GATE_BLOCKED"
save_evidence "$SCENARIO" "rollout" "prematureProductionBlocked" "true"
log_ok "Production promotion correctly blocked before rollout gates are met"

log_step "1.6 — POST /platform-admin/tenants/:tenantId/roles/invite + acknowledge required roles"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/roles/invite" "$ROLE_TENANT_ADMIN_FIXTURE"
assert_status "200|201"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/roles/acknowledge" "$ROLE_TENANT_ADMIN_FIXTURE"
assert_status "200|201"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/roles/invite" "$ROLE_TENANT_OPS_FIXTURE"
assert_status "200|201"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/roles/acknowledge" "$ROLE_TENANT_OPS_FIXTURE"
assert_status "200|201"
save_evidence "$SCENARIO" "rollout" "requiredRolesAcknowledged" "tenant_admin,tenant_ops_admin"
log_ok "Required tenant roles invited and acknowledged"

log_surface "Platform Admin — partner governance"

log_step "2.1 — POST /platform-admin/partner-entries"
http_call POST "/platform-admin/partner-entries" "$PARTNER_ENTRY_FIXTURE"
assert_status "200|201"
ENTRY_SLUG_READBACK="$(json_get_first ".data.entrySlug" ".data.entry_slug")"
assert_json_equals "$ENTRY_SLUG_READBACK" "$PARTNER_ENTRY_SLUG" "Partner entry slug mismatch"
chain_set "partner" "entrySlug" "$PARTNER_ENTRY_SLUG"
save_evidence "$SCENARIO" "partner" "entrySlug" "$PARTNER_ENTRY_SLUG"
log_ok "Partner entry created: ${PARTNER_ENTRY_SLUG}"

log_step "2.2 — POST /platform-admin/partner-entries/:entrySlug/credentials/issue"
http_call POST "/platform-admin/partner-entries/${PARTNER_ENTRY_SLUG}/credentials/issue" "$ISSUE_CREDENTIAL_FIXTURE"
assert_status "200|201"
PARTNER_KEY_ID="$(json_get_first ".data.credential.keyId" ".data.keyId")"
PLAINTEXT_KEY="$(json_get_first ".data.plaintextKey" ".data.plaintext_key")"
if [[ -z "$PARTNER_KEY_ID" || -z "$PLAINTEXT_KEY" ]]; then
  log_fail "Expected keyId and plaintextKey from credential issue."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
chain_set "partner" "credentialKeyId" "$PARTNER_KEY_ID"
save_evidence "$SCENARIO" "partner" "credentialKeyId" "$PARTNER_KEY_ID"
save_evidence "$SCENARIO" "partner" "plaintextKeyShownAtIssue" "true"
log_ok "Partner ingress credential issued: keyId=${PARTNER_KEY_ID}"

log_step "2.3 — GET /platform-admin/partner-entries/:entrySlug/credentials"
http_call GET "/platform-admin/partner-entries/${PARTNER_ENTRY_SLUG}/credentials"
assert_status "200"
LIST_KEY_ID="$(echo "$RESP_BODY" | jq -r --arg kid "$PARTNER_KEY_ID" '.data.items[] | select(.keyId == $kid) | .keyId' 2>/dev/null | head -1 || true)"
LIST_PLAINTEXT="$(echo "$RESP_BODY" | jq -r --arg kid "$PARTNER_KEY_ID" '.data.items[] | select(.keyId == $kid) | .plaintextKey // empty' 2>/dev/null | head -1 || true)"
assert_json_equals "$LIST_KEY_ID" "$PARTNER_KEY_ID" "Credential list keyId mismatch"
if [[ -n "$LIST_PLAINTEXT" ]]; then
  log_fail "Credential plaintextKey must not be returned by list endpoint."
  exit 1
fi
save_evidence "$SCENARIO" "partner" "credentialPlaintextHiddenOnList" "true"
log_ok "Credential list hides plaintext as expected"

log_surface "Platform Admin — pricing and rollout"

log_step "3.1 — POST /platform-admin/pricing-rules"
http_call POST "/platform-admin/pricing-rules" "$PRICING_CREATE_FIXTURE"
assert_status "200|201"
PRICING_RULE_ID="$(json_get_first ".data.ruleId" ".data.rule_id")"
if [[ -z "$PRICING_RULE_ID" ]]; then
  log_fail "No pricing ruleId returned."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
chain_set "pricing" "ruleId" "$PRICING_RULE_ID"
chain_set "pricing" "version" "$PRICING_VERSION"
save_evidence "$SCENARIO" "pricing" "ruleId" "$PRICING_RULE_ID"
log_ok "Pricing rule created: ruleId=${PRICING_RULE_ID}"

log_step "3.2 — POST /platform-admin/pricing-rules/:ruleId/publish"
http_call POST "/platform-admin/pricing-rules/${PRICING_RULE_ID}/publish" "$PRICING_PUBLISH_FIXTURE"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.status // empty' 2>/dev/null || true)" "active" "Pricing rule status mismatch"
PUBLISHED_AT="$(echo "$RESP_BODY" | jq -r '.data.publishedAt // empty' 2>/dev/null || true)"
if [[ -z "$PUBLISHED_AT" ]]; then
  log_fail "Pricing publish did not return publishedAt."
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "pricing" "publishedAt" "$PUBLISHED_AT"
log_ok "Pricing rule published at ${PUBLISHED_AT}"

log_step "3.3 — POST /platform-admin/tenants/:tenantId/rollout (sandbox)"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/rollout" "$ROLLOUT_SANDBOX_FIXTURE"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.rollout.stage // empty' 2>/dev/null || true)" "sandbox" "Sandbox rollout stage mismatch"
save_evidence "$SCENARIO" "rollout" "sandboxPromoted" "true"
log_ok "Sandbox rollout stage recorded"

log_step "3.4 — POST /platform-admin/tenants/:tenantId/rollout (pilot)"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/rollout" "$ROLLOUT_PILOT_FIXTURE"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.rollout.stage // empty' 2>/dev/null || true)" "pilot" "Pilot rollout stage mismatch"
save_evidence "$SCENARIO" "rollout" "pilotPromoted" "true"
log_ok "Pilot rollout stage recorded"

log_step "3.5 — POST /platform-admin/tenants/:tenantId/rollback-hold"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/rollback-hold"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.status // empty' 2>/dev/null || true)" "rollback_hold" "Rollback hold status mismatch"
save_evidence "$SCENARIO" "rollout" "rollbackHold" "true"
log_ok "Tenant entered rollback hold"

log_step "3.6 — POST /platform-admin/tenants/:tenantId/rollout (production blocked by rollback hold)"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/rollout" "$ROLLOUT_PRODUCTION_FIXTURE"
assert_status "409"
require_error_code "TENANT_IN_ROLLBACK_HOLD"
save_evidence "$SCENARIO" "rollout" "rollbackHoldBlockedProduction" "true"
log_ok "Rollback hold prevented production promotion"

log_step "3.7 — POST /platform-admin/tenants/:tenantId/activate"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/activate"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.status // empty' 2>/dev/null || true)" "active" "Activate status mismatch"
log_ok "Tenant re-activated after rollback hold"

log_step "3.8 — POST /platform-admin/tenants/:tenantId/rollout (production)"
http_call POST "/platform-admin/tenants/${NEW_TENANT_ID}/rollout" "$ROLLOUT_PRODUCTION_FIXTURE"
assert_status "200|201"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.rollout.stage // empty' 2>/dev/null || true)" "production" "Production rollout stage mismatch"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.rollout.productionStatus // empty' 2>/dev/null || true)" "approved" "Production rollout status mismatch"
chain_set "platform_admin" "rolloutStage" "production"
save_evidence "$SCENARIO" "rollout" "productionPromoted" "true"
log_ok "Production rollout stage recorded"

log_step "3.9 — GET /platform-admin/tenants/:tenantId"
http_call GET "/platform-admin/tenants/${NEW_TENANT_ID}"
assert_status "200"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.rollout.stage // empty' 2>/dev/null || true)" "production" "Tenant detail rollout stage mismatch"
assert_json_equals "$(echo "$RESP_BODY" | jq -r '.data.integrationPackage.mode // empty' 2>/dev/null || true)" "api_key_and_webhook" "Integration mode mismatch"
save_evidence "$SCENARIO" "platform_admin" "tenantStatusFinal" "$(echo "$RESP_BODY" | jq -r '.data.status // empty' 2>/dev/null || true)"
log_ok "Tenant detail read-back matches final production state"

log_surface "Audit — control-plane evidence review"

log_step "4.1 — GET /audit and verify mutation families"
require_audit_count "create_platform_tenant" "$NEW_TENANT_ID" 1
require_audit_count "update_platform_tenant_settings" "$NEW_TENANT_ID" 2
require_audit_count "update_platform_tenant_onboarding" "$NEW_TENANT_ID" 1
require_audit_count "invite_tenant_role" "$NEW_TENANT_ID" 2
require_audit_count "acknowledge_tenant_role" "$NEW_TENANT_ID" 2
require_audit_count "update_platform_tenant_rollout" "$NEW_TENANT_ID" 3
require_audit_count "set_tenant_rollback_hold" "$NEW_TENANT_ID" 1
require_audit_count "update_platform_tenant_status" "$NEW_TENANT_ID" 1
require_audit_count "create_partner_entry" "$PARTNER_ENTRY_SLUG" 1
require_audit_count "issue_partner_ingress_credential" "$PARTNER_KEY_ID" 1
require_audit_count "create_platform_pricing_rule" "$PRICING_RULE_ID" 1
require_audit_count "publish_platform_pricing_rule" "$PRICING_RULE_ID" 1

log_step "Chain continuity assertions"
assert_chain "platform_admin" "tenantId"
assert_chain "platform_admin" "tenantCode"
assert_chain "platform_admin" "rolloutStage"
assert_chain "partner" "entrySlug"
assert_chain "partner" "credentialKeyId"
assert_chain "pricing" "ruleId"
assert_chain "pricing" "version"

print_chain_summary

echo ""
log_ok "E2E-011 complete — platform admin control-plane flow passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
