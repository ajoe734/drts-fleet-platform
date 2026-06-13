#!/usr/bin/env bash
# E2E-011 - Platform Admin control-plane chain (WF-ADM-001)
#
# Surface chain:
#   Platform Admin
#   -> tenant create/settings/quota
#   -> partner entry + ingress credential issue/revoke
#   -> adapter health + switchboard public-info publish
#   -> pricing publish
#   -> tenant-scoped feature flag toggle
#   -> rollout promote + rollback hold block
#   -> RBAC negative paths + audit verification
#
# Pass criteria:
#   1. All control-plane mutations return 2xx and are read back where possible.
#   2. Pricing publish carries a non-empty version field.
#   3. Rollback hold blocks production promote with production_rollback_hold_active.
#   4. At least two RBAC negative paths return 403 and create audit rows.
#   5. Every mutation in this scenario has an audit row.
#   6. No silent pass / warning skip on missing runtime capability.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-011"
RUN_TAG="${E2E_RUN_TAG:-$(date -u +%Y%m%d%H%M%S)-$$}"
TENANT_CODE="e2e011-${RUN_TAG}"
TENANT_NAME="E2E 011 Platform Control Plane ${RUN_TAG}"
ENTRY_SLUG="e2e011-${RUN_TAG}"
PARTNER_CODE="e2e011-${RUN_TAG}"
PROGRAM_ID="program-e2e011-${RUN_TAG}"
PROGRAM_CODE="E2E011-${RUN_TAG}"
PRICING_VERSION="e2e011-${RUN_TAG}"
PUBLIC_INFO_TITLE="E2E 011 Public Info ${RUN_TAG}"
FLAG_KEY="tenant-portal.booking"
PLATFORM_ACTOR_ID="e2e-platform-admin-011-${RUN_TAG}"
TENANT_NEGATIVE_ACTOR_ID="e2e-tenant-admin-denied-011-${RUN_TAG}"
READONLY_NEGATIVE_ACTOR_ID="e2e-platform-readonly-denied-011-${RUN_TAG}"

TENANT_FIXTURE=""
TENANT_SETTINGS_FIXTURE=""
QUOTA_FIXTURE=""
PARTNER_FIXTURE=""
PARTNER_UPDATE_FIXTURE=""
CREDENTIAL_ISSUE_FIXTURE=""
CREDENTIAL_REVOKE_FIXTURE=""
PUBLIC_INFO_FIXTURE=""
PUBLIC_INFO_PUBLISH_FIXTURE=""
PRICING_FIXTURE=""
PRICING_PUBLISH_FIXTURE=""
FLAG_FALSE_FIXTURE=""
FLAG_TRUE_FIXTURE=""
ROLE_FIXTURE=""
ONBOARDING_FIXTURE=""
ROLLOUT_FIXTURE=""
ROLLBACK_PROD_FIXTURE=""
RBAC_TENANT_FIXTURE=""

cleanup() {
  rm -f \
    "${TENANT_FIXTURE:-}" \
    "${TENANT_SETTINGS_FIXTURE:-}" \
    "${QUOTA_FIXTURE:-}" \
    "${PARTNER_FIXTURE:-}" \
    "${PARTNER_UPDATE_FIXTURE:-}" \
    "${CREDENTIAL_ISSUE_FIXTURE:-}" \
    "${CREDENTIAL_REVOKE_FIXTURE:-}" \
    "${PUBLIC_INFO_FIXTURE:-}" \
    "${PUBLIC_INFO_PUBLISH_FIXTURE:-}" \
    "${PRICING_FIXTURE:-}" \
    "${PRICING_PUBLISH_FIXTURE:-}" \
    "${FLAG_FALSE_FIXTURE:-}" \
    "${FLAG_TRUE_FIXTURE:-}" \
    "${ROLE_FIXTURE:-}" \
    "${ONBOARDING_FIXTURE:-}" \
    "${ROLLOUT_FIXTURE:-}" \
    "${ROLLBACK_PROD_FIXTURE:-}" \
    "${RBAC_TENANT_FIXTURE:-}"
}
trap cleanup EXIT

audit_action_exists() {
  local action="$1"
  local resource_id="${2:-}"
  echo "$RESP_BODY" | jq -e \
    --arg action "$action" \
    --arg resourceId "$resource_id" \
    '
      (.data.items // []) | any(
        ((.actionName // .action_name) == $action)
        and (
          ($resourceId == "")
          or ((.resourceId // .resource_id // "") == $resourceId)
        )
      )
    ' >/dev/null
}

assert_audit_action() {
  local action="$1"
  local resource_id="${2:-}"
  if ! audit_action_exists "$action" "$resource_id"; then
    log_fail "Missing audit action=${action}${resource_id:+ resourceId=${resource_id}}"
    return 1
  fi
  save_evidence "$SCENARIO" "audit" "$action" "${resource_id:-present}"
  log_ok "Audit present: ${action}${resource_id:+ -> ${resource_id}}"
}

write_role_fixture() {
  local role_code="$1"
  ROLE_FIXTURE=$(mktemp /tmp/drts-e2e-011-role-XXXXXX.json)
  jq -n --arg roleCode "$role_code" '{ roleCode: $roleCode }' > "$ROLE_FIXTURE"
}

chain_init

echo -e "\n${BOLD}========================================================${RESET}"
echo -e "${BOLD}  E2E-011 - Platform Admin control-plane chain${RESET}"
echo -e "${BOLD}  run=${RUN_TAG}${RESET}"
echo -e "${BOLD}========================================================${RESET}"

switch_actor "platform_admin" "$PLATFORM_ACTOR_ID"

# =============================================================================
# LEG 1 - Tenant create, module enablement, and quotas
# =============================================================================
log_surface "Platform Admin - tenant create/settings/quota"

TENANT_FIXTURE=$(mktemp /tmp/drts-e2e-011-tenant-XXXXXX.json)
jq -n \
  --arg name "$TENANT_NAME" \
  --arg code "$TENANT_CODE" \
  '{
    name: $name,
    code: $code,
    status: "active",
    enabledModules: ["enterprise_dispatch", "billing"],
    quotas: {
      activeDrivers: 20,
      monthlyBookings: 250,
      monthlyApiCalls: 5000
    },
    integrationMode: "api_key_and_webhook",
    bootstrapAdminEmail: "platform-admin+e2e011@example.test",
    sandboxBaseUrl: "https://sandbox.e2e011.example.test"
  }' > "$TENANT_FIXTURE"

log_step "1.1 - POST /platform-admin/tenants"
http_call POST "/platform-admin/tenants" "$TENANT_FIXTURE"
assert_status "200|201"
TENANT_ID=$(json_get_first ".data.id" ".data.tenant_id")
if [[ -z "$TENANT_ID" ]]; then
  log_fail "Tenant create response did not include tenant id: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "tenantId" "$TENANT_ID"
save_evidence "$SCENARIO" "tenant" "tenantId" "$TENANT_ID"

TENANT_SETTINGS_FIXTURE=$(mktemp /tmp/drts-e2e-011-tenant-settings-XXXXXX.json)
jq -n '{
  enabledModules: ["enterprise_dispatch", "billing", "reporting", "webhooks"],
  quotas: {
    activeDrivers: 75,
    monthlyBookings: 1800,
    monthlyApiCalls: 120000
  }
}' > "$TENANT_SETTINGS_FIXTURE"

log_step "1.2 - POST /platform-admin/tenants/:tenantId/settings"
http_call POST "/platform-admin/tenants/${TENANT_ID}/settings" "$TENANT_SETTINGS_FIXTURE"
assert_status "200|201"
MODULE_COUNT=$(echo "$RESP_BODY" | jq -r '(.data.enabledModules // .data.enabled_modules // []) | length')
MONTHLY_BOOKINGS=$(json_get_first ".data.quotas.monthlyBookings" ".data.quotas.monthly_bookings")
if [[ "$MODULE_COUNT" -lt 4 || "$MONTHLY_BOOKINGS" != "1800" ]]; then
  log_fail "Tenant settings did not round-trip modules/quotas: ${RESP_BODY}"
  exit 1
fi

QUOTA_FIXTURE=$(mktemp /tmp/drts-e2e-011-quota-XXXXXX.json)
jq -n '{
  period: "monthly",
  limit: {
    bookingCountLimit: 1800,
    amountMinorLimit: 90000000,
    currency: "TWD",
    enforcementMode: "warn_only"
  }
}' > "$QUOTA_FIXTURE"

log_step "1.3 - POST /tenant/quotas/policies as platform admin scoped to new tenant"
switch_actor "platform_admin" "$PLATFORM_ACTOR_ID" "$TENANT_ID"
http_call POST "/tenant/quotas/policies" "$QUOTA_FIXTURE"
assert_status "200|201"
QUOTA_TENANT_ID=$(json_get_first ".data.tenantId" ".data.tenant_id")
if [[ "$QUOTA_TENANT_ID" != "$TENANT_ID" ]]; then
  log_fail "Tenant quota policy was not scoped to created tenant: ${RESP_BODY}"
  exit 1
fi
switch_actor "platform_admin" "$PLATFORM_ACTOR_ID"

# =============================================================================
# LEG 2 - Partner entry, branding update, credential issue/revoke
# =============================================================================
log_surface "Platform Admin - partner entry and credentials"

PARTNER_FIXTURE=$(mktemp /tmp/drts-e2e-011-partner-XXXXXX.json)
jq -n \
  --arg tenantId "$TENANT_ID" \
  --arg partnerCode "$PARTNER_CODE" \
  --arg programId "$PROGRAM_ID" \
  --arg programCode "$PROGRAM_CODE" \
  --arg entrySlug "$ENTRY_SLUG" \
  '{
    tenantId: $tenantId,
    partnerCode: $partnerCode,
    partnerType: "bank",
    programId: $programId,
    programCode: $programCode,
    bankCode: "E2E011",
    entrySlug: $entrySlug,
    displayName: "E2E 011 Bank Airport Transfer",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "reference_required",
    entryHost: "booking.e2e011.example.test",
    entryPath: "/airport-transfer",
    themeAccent: "#0f766e",
    brandingMetadata: {
      displayName: "E2E 011 Bank Airport Transfer",
      themeAccent: "#0f766e",
      supportEmail: "support+e2e011@example.test",
      supportPhone: "+886-2-5550-0011"
    },
    status: "active",
    activeFlag: true
  }' > "$PARTNER_FIXTURE"

log_step "2.1 - POST /platform-admin/partner-entries"
http_call POST "/platform-admin/partner-entries" "$PARTNER_FIXTURE"
assert_status "200|201"
READ_ENTRY_SLUG=$(json_get_first ".data.entrySlug" ".data.entry_slug")
if [[ "$READ_ENTRY_SLUG" != "$ENTRY_SLUG" ]]; then
  log_fail "Partner entry slug did not round-trip: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "entrySlug" "$ENTRY_SLUG"

PARTNER_UPDATE_FIXTURE=$(mktemp /tmp/drts-e2e-011-partner-update-XXXXXX.json)
jq -n \
  --arg tenantId "$TENANT_ID" \
  --arg partnerCode "$PARTNER_CODE" \
  --arg programId "$PROGRAM_ID" \
  --arg programCode "$PROGRAM_CODE" \
  '{
    tenantId: $tenantId,
    partnerCode: $partnerCode,
    partnerType: "bank",
    programId: $programId,
    programCode: $programCode,
    bankCode: "E2E011",
    displayName: "E2E 011 Bank Airport Transfer Updated",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "reference_required",
    entryHost: "booking.e2e011.example.test",
    entryPath: "/airport-transfer",
    themeAccent: "#2563eb",
    brandingMetadata: {
      displayName: "E2E 011 Bank Airport Transfer Updated",
      themeAccent: "#2563eb",
      supportEmail: "support+e2e011-updated@example.test",
      supportPhone: "+886-2-5550-0012"
    },
    status: "active",
    activeFlag: true
  }' > "$PARTNER_UPDATE_FIXTURE"

log_step "2.2 - POST /platform-admin/partner-entries/:entrySlug (branding update)"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}" "$PARTNER_UPDATE_FIXTURE"
assert_status "200|201"
UPDATED_ACCENT=$(json_get_first ".data.themeAccent" ".data.theme_accent")
if [[ "$UPDATED_ACCENT" != "#2563eb" ]]; then
  log_fail "Partner branding update did not round-trip: ${RESP_BODY}"
  exit 1
fi

CREDENTIAL_ISSUE_FIXTURE=$(mktemp /tmp/drts-e2e-011-credential-issue-XXXXXX.json)
jq -n '{ rotationReason: "e2e011_initial_issue" }' > "$CREDENTIAL_ISSUE_FIXTURE"

log_step "2.3 - POST /platform-admin/partner-entries/:entrySlug/credentials/issue"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials/issue" "$CREDENTIAL_ISSUE_FIXTURE"
assert_status "200|201"
CREDENTIAL_KEY_ID=$(json_get_first ".data.credential.keyId" ".data.credential.key_id")
PLAINTEXT_KEY=$(json_get_first ".data.plaintextKey" ".data.plaintext_key")
if [[ -z "$CREDENTIAL_KEY_ID" || -z "$PLAINTEXT_KEY" ]]; then
  log_fail "Credential issue did not include keyId and one-time plaintext key: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "credentialKeyId" "$CREDENTIAL_KEY_ID"

log_step "2.4 - GET /platform-admin/partner-entries/:entrySlug/credentials"
http_call GET "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials"
assert_status "200"
if echo "$RESP_BODY" | jq -e '.data.items[]? | has("plaintextKey") or has("plaintext_key")' >/dev/null; then
  log_fail "Credential list leaked one-time plaintext key: ${RESP_BODY}"
  exit 1
fi
if ! echo "$RESP_BODY" | jq -e --arg keyId "$CREDENTIAL_KEY_ID" \
  '(.data.items // []) | any((.keyId // .key_id) == $keyId and ((.revokedAt // .revoked_at) == null))' >/dev/null; then
  log_fail "Issued credential was not listed as active/masked-only: ${RESP_BODY}"
  exit 1
fi

CREDENTIAL_REVOKE_FIXTURE=$(mktemp /tmp/drts-e2e-011-credential-revoke-XXXXXX.json)
jq -n '{ revokeReason: "e2e011_revoke_after_issue" }' > "$CREDENTIAL_REVOKE_FIXTURE"

log_step "2.5 - POST /platform-admin/partner-entries/:entrySlug/credentials/:keyId/revoke"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials/${CREDENTIAL_KEY_ID}/revoke" "$CREDENTIAL_REVOKE_FIXTURE"
assert_status "200|201"
REVOKED_AT=$(json_get_first ".data.revokedAt" ".data.revoked_at")
if [[ -z "$REVOKED_AT" ]]; then
  log_fail "Credential revoke did not mark revokedAt: ${RESP_BODY}"
  exit 1
fi

# =============================================================================
# LEG 3 - Adapter health and switchboard/public-info publish
# =============================================================================
log_surface "Platform Admin - adapter health and switchboard"

log_step "3.1 - GET /forwarder/adapters/health"
http_call GET "/forwarder/adapters/health"
assert_status "200"
ADAPTER_COUNT=$(echo "$RESP_BODY" | jq -r '(.data.items // []) | length')
if [[ "$ADAPTER_COUNT" -lt 1 ]]; then
  log_fail "Adapter health returned no adapter rows: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "adapter_health" "adapterCount" "$ADAPTER_COUNT"

PUBLIC_INFO_FIXTURE=$(mktemp /tmp/drts-e2e-011-public-info-XXXXXX.json)
jq -n \
  --arg title "$PUBLIC_INFO_TITLE" \
  --arg effectiveFrom "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    title: $title,
    callPhone: "+886-2-5550-0011",
    complaintPhone: "+886-2-5550-0099",
    callRateText: "E2E 011 switchboard call rate",
    fareText: "E2E 011 fare disclosure",
    paymentMethodText: "Card / invoice",
    effectiveFrom: $effectiveFrom
  }' > "$PUBLIC_INFO_FIXTURE"

log_step "3.2 - POST /platform-admin/public-info"
http_call POST "/platform-admin/public-info" "$PUBLIC_INFO_FIXTURE"
assert_status "200|201"
PUBLIC_INFO_VERSION_ID=$(json_get_first ".data.versionId" ".data.version_id")
if [[ -z "$PUBLIC_INFO_VERSION_ID" ]]; then
  log_fail "Public info create did not include version id: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "publicInfoVersionId" "$PUBLIC_INFO_VERSION_ID"

PUBLIC_INFO_PUBLISH_FIXTURE=$(mktemp /tmp/drts-e2e-011-public-info-publish-XXXXXX.json)
jq -n \
  --arg effectiveFrom "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{ effectiveFrom: $effectiveFrom }' > "$PUBLIC_INFO_PUBLISH_FIXTURE"

log_step "3.3 - POST /platform-admin/public-info/:versionId/publish"
http_call POST "/platform-admin/public-info/${PUBLIC_INFO_VERSION_ID}/publish" "$PUBLIC_INFO_PUBLISH_FIXTURE"
assert_status "200|201"
PUBLIC_INFO_STATUS=$(json_get_first ".data.status")
if [[ "$PUBLIC_INFO_STATUS" != "published" ]]; then
  log_fail "Public info publish did not return published status: ${RESP_BODY}"
  exit 1
fi

# =============================================================================
# LEG 4 - Pricing publish
# =============================================================================
log_surface "Platform Admin - pricing publish"

PRICING_FIXTURE=$(mktemp /tmp/drts-e2e-011-pricing-XXXXXX.json)
jq -n \
  --arg version "$PRICING_VERSION" \
  --arg applicableTo "credit_card_airport_transfer" \
  --arg effectiveFrom "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    ruleName: "E2E 011 Airport Transfer Pricing",
    version: $version,
    serviceFeeBps: 850,
    reimbursementMode: "mixed",
    applicableTo: $applicableTo,
    effectiveFrom: $effectiveFrom,
    notes: "E2E-011 pricing publish proof"
  }' > "$PRICING_FIXTURE"

log_step "4.1 - POST /platform-admin/pricing-rules"
http_call POST "/platform-admin/pricing-rules" "$PRICING_FIXTURE"
assert_status "200|201"
PRICING_RULE_ID=$(json_get_first ".data.ruleId" ".data.rule_id")
if [[ -z "$PRICING_RULE_ID" ]]; then
  log_fail "Pricing create did not include ruleId: ${RESP_BODY}"
  exit 1
fi
chain_set "platform_admin" "pricingRuleId" "$PRICING_RULE_ID"

PRICING_PUBLISH_FIXTURE=$(mktemp /tmp/drts-e2e-011-pricing-publish-XXXXXX.json)
jq -n \
  --arg effectiveFrom "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg publishedBy "$PLATFORM_ACTOR_ID" \
  '{ effectiveFrom: $effectiveFrom, publishedBy: $publishedBy }' > "$PRICING_PUBLISH_FIXTURE"

log_step "4.2 - POST /platform-admin/pricing-rules/:ruleId/publish"
http_call POST "/platform-admin/pricing-rules/${PRICING_RULE_ID}/publish" "$PRICING_PUBLISH_FIXTURE"
assert_status "200|201"
PUBLISHED_VERSION=$(json_get_first ".data.version")
PUBLISHED_STATUS=$(json_get_first ".data.status")
if [[ -z "$PUBLISHED_VERSION" || "$PUBLISHED_STATUS" != "active" ]]; then
  log_fail "Pricing publish did not carry active status and non-null version: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "pricing" "version" "$PUBLISHED_VERSION"

# =============================================================================
# LEG 5 - Tenant-scoped feature flag toggle
# =============================================================================
log_surface "Platform Admin - feature flag tenant override"

FLAG_FALSE_FIXTURE=$(mktemp /tmp/drts-e2e-011-flag-false-XXXXXX.json)
jq -n '{ enabled: false, description: "E2E-011 tenant override off" }' > "$FLAG_FALSE_FIXTURE"

switch_actor "platform_admin" "$PLATFORM_ACTOR_ID" "$TENANT_ID"
log_step "5.1 - POST /admin/flags/:key/tenant-overrides?tenantId=:tenantId off"
http_call POST "/admin/flags/${FLAG_KEY}/tenant-overrides?tenantId=${TENANT_ID}" "$FLAG_FALSE_FIXTURE"
assert_status "200|201"
FLAG_OFF=$(echo "$RESP_BODY" | jq -r '.data.enabled')
if [[ "$FLAG_OFF" != "false" ]]; then
  log_fail "Feature flag off override did not round-trip: ${RESP_BODY}"
  exit 1
fi

log_step "5.2 - GET /admin/flags/:key/enabled with tenant header"
http_call GET "/admin/flags/${FLAG_KEY}/enabled"
assert_status "200"
FLAG_ENABLED_READ=$(echo "$RESP_BODY" | jq -r '.data.enabled')
if [[ "$FLAG_ENABLED_READ" != "false" ]]; then
  log_fail "Feature flag runtime read did not reflect tenant override off: ${RESP_BODY}"
  exit 1
fi

FLAG_TRUE_FIXTURE=$(mktemp /tmp/drts-e2e-011-flag-true-XXXXXX.json)
jq -n '{ enabled: true, description: "E2E-011 tenant override restored on" }' > "$FLAG_TRUE_FIXTURE"

log_step "5.3 - POST /admin/flags/:key/tenant-overrides?tenantId=:tenantId on"
http_call POST "/admin/flags/${FLAG_KEY}/tenant-overrides?tenantId=${TENANT_ID}" "$FLAG_TRUE_FIXTURE"
assert_status "200|201"
FLAG_ON=$(echo "$RESP_BODY" | jq -r '.data.enabled')
if [[ "$FLAG_ON" != "true" ]]; then
  log_fail "Feature flag on override did not round-trip: ${RESP_BODY}"
  exit 1
fi
switch_actor "platform_admin" "$PLATFORM_ACTOR_ID"

# =============================================================================
# LEG 6 - Rollout promote and rollback hold block
# =============================================================================
log_surface "Platform Admin - rollout and rollback hold"

for role_code in tenant_admin tenant_ops_admin; do
  write_role_fixture "$role_code"
  log_step "6.1 - POST /platform-admin/tenants/:tenantId/roles/invite (${role_code})"
  http_call POST "/platform-admin/tenants/${TENANT_ID}/roles/invite" "$ROLE_FIXTURE"
  assert_status "200|201"
  log_step "6.2 - POST /platform-admin/tenants/:tenantId/roles/acknowledge (${role_code})"
  http_call POST "/platform-admin/tenants/${TENANT_ID}/roles/acknowledge" "$ROLE_FIXTURE"
  assert_status "200|201"
done

ROLLOUT_FIXTURE=$(mktemp /tmp/drts-e2e-011-rollout-XXXXXX.json)
jq -n '{ stage: "sandbox", notes: "E2E-011 sandbox promote" }' > "$ROLLOUT_FIXTURE"
log_step "6.3 - POST /platform-admin/tenants/:tenantId/rollout sandbox"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLOUT_FIXTURE"
assert_status "200|201"

jq -n '{ stage: "pilot", notes: "E2E-011 pilot promote" }' > "$ROLLOUT_FIXTURE"
log_step "6.4 - POST /platform-admin/tenants/:tenantId/rollout pilot"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLOUT_FIXTURE"
assert_status "200|201"
ROLLOUT_STAGE=$(json_get_first ".data.rollout.stage")
if [[ "$ROLLOUT_STAGE" != "pilot" ]]; then
  log_fail "Rollout promotion did not reach pilot: ${RESP_BODY}"
  exit 1
fi

ONBOARDING_FIXTURE=$(mktemp /tmp/drts-e2e-011-onboarding-XXXXXX.json)
jq -n '{
  rollout: {
    cutoverOwner: "E2E-011 Launch Owner",
    rollbackOwner: "E2E-011 Rollback Owner",
    rollbackPrepared: true,
    notes: "E2E-011 rollout owners prepared"
  }
}' > "$ONBOARDING_FIXTURE"

log_step "6.5 - POST /platform-admin/tenants/:tenantId/onboarding rollout owners"
http_call POST "/platform-admin/tenants/${TENANT_ID}/onboarding" "$ONBOARDING_FIXTURE"
assert_status "200|201"

log_step "6.6 - POST /platform-admin/tenants/:tenantId/rollback-hold"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollback-hold"
assert_status "200|201"
ROLLBACK_STATUS=$(json_get_first ".data.status")
if [[ "$ROLLBACK_STATUS" != "rollback_hold" ]]; then
  log_fail "Rollback hold did not set tenant status: ${RESP_BODY}"
  exit 1
fi

ROLLBACK_PROD_FIXTURE=$(mktemp /tmp/drts-e2e-011-rollback-prod-XXXXXX.json)
jq -n '{ stage: "production", notes: "E2E-011 should be blocked by rollback hold" }' > "$ROLLBACK_PROD_FIXTURE"

log_step "6.7 - POST /platform-admin/tenants/:tenantId/rollout production must be blocked"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLBACK_PROD_FIXTURE"
assert_status "409"
ROLLBACK_REASON=$(echo "$RESP_BODY" | jq -r \
  '.error.code // .error.details.reasonCode // .error.details.reason_code // empty' 2>/dev/null || true)
if [[ "$ROLLBACK_REASON" != "production_rollback_hold_active" ]]; then
  log_fail "Rollback hold block reason mismatch; expected production_rollback_hold_active, got ${ROLLBACK_REASON:-<empty>}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
save_evidence "$SCENARIO" "rollout" "rollbackBlockReason" "$ROLLBACK_REASON"

# =============================================================================
# LEG 7 - RBAC negative paths
# =============================================================================
log_surface "Platform Admin - RBAC negative paths"

RBAC_TENANT_FIXTURE=$(mktemp /tmp/drts-e2e-011-rbac-tenant-XXXXXX.json)
jq -n \
  --arg code "e2e011-denied-${RUN_TAG}" \
  '{
    name: "E2E 011 Denied Tenant",
    code: $code,
    status: "active"
  }' > "$RBAC_TENANT_FIXTURE"

log_step "7.1 - tenant_admin cannot create platform tenant"
switch_actor "tenant_admin" "$TENANT_NEGATIVE_ACTOR_ID" "$TENANT_ID"
http_call POST "/platform-admin/tenants" "$RBAC_TENANT_FIXTURE"
assert_status "403"
save_evidence "$SCENARIO" "rbac" "tenantAdminCreateStatus" "$RESP_STATUS"

log_step "7.2 - platform_admin with read-only scopes cannot publish pricing"
switch_actor "platform_admin" "$READONLY_NEGATIVE_ACTOR_ID"
E2E_EXTRA_SCOPES="foundation:read"
http_call POST "/platform-admin/pricing-rules/${PRICING_RULE_ID}/publish" "$PRICING_PUBLISH_FIXTURE"
assert_status "403"
save_evidence "$SCENARIO" "rbac" "readOnlyPublishStatus" "$RESP_STATUS"
E2E_EXTRA_SCOPES=""
switch_actor "platform_admin" "$PLATFORM_ACTOR_ID"

# =============================================================================
# LEG 8 - Audit verification
# =============================================================================
log_surface "Platform Admin - audit verification"

log_step "8.1 - GET /audit"
http_call GET "/audit"
assert_status "200"

assert_audit_action "create_platform_tenant" "$TENANT_ID"
assert_audit_action "update_platform_tenant_settings" "$TENANT_ID"
assert_audit_action "tenant.quota_policy.updated" "$TENANT_ID"
assert_audit_action "create_partner_entry" "$ENTRY_SLUG"
assert_audit_action "update_partner_entry" "$ENTRY_SLUG"
assert_audit_action "issue_partner_ingress_credential" "$CREDENTIAL_KEY_ID"
assert_audit_action "revoke_partner_ingress_credential" "$CREDENTIAL_KEY_ID"
assert_audit_action "create_public_info_version" "$PUBLIC_INFO_VERSION_ID"
assert_audit_action "publish_public_info_version" "$PUBLIC_INFO_VERSION_ID"
assert_audit_action "create_platform_pricing_rule" "$PRICING_RULE_ID"
assert_audit_action "publish_platform_pricing_rule" "$PRICING_RULE_ID"
assert_audit_action "upsert_feature_flag_tenant_override" "${FLAG_KEY}:${TENANT_ID}"
assert_audit_action "invite_tenant_role" "$TENANT_ID"
assert_audit_action "acknowledge_tenant_role" "$TENANT_ID"
assert_audit_action "update_platform_tenant_rollout" "$TENANT_ID"
assert_audit_action "update_platform_tenant_onboarding" "$TENANT_ID"
assert_audit_action "set_tenant_rollback_hold" "$TENANT_ID"

RBAC_AUDIT_COUNT=$(echo "$RESP_BODY" | jq -r \
  --arg tenantActor "$TENANT_NEGATIVE_ACTOR_ID" \
  --arg readOnlyActor "$READONLY_NEGATIVE_ACTOR_ID" \
  '
    [
      (.data.items // [])[]
      | select(
          (((.actionName // .action_name) == "auth.realm_denied")
           or ((.actionName // .action_name) == "auth.scope_denied"))
          and (((.actorId // .actor_id) == $tenantActor)
               or ((.actorId // .actor_id) == $readOnlyActor))
        )
    ] | length
  ' 2>/dev/null || echo "0")
if [[ "$RBAC_AUDIT_COUNT" -lt 2 ]]; then
  log_fail "Expected at least 2 RBAC rejection audit rows, got ${RBAC_AUDIT_COUNT}"
  exit 1
fi
save_evidence "$SCENARIO" "audit" "rbacRejectedAttempts" "$RBAC_AUDIT_COUNT"
log_ok "RBAC rejected attempts audited: ${RBAC_AUDIT_COUNT}"

print_chain_summary
log_ok "E2E-011 complete - Platform Admin control-plane chain passed."
