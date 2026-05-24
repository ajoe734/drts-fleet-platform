#!/usr/bin/env bash
# E2E-011 — Platform admin control-plane
#
# Cross-ref:
#   docs/04-uat/platform-admin-control-plane-uat-20260519.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-011"
PLATFORM_ACTOR_ID="e2e-platform-admin-011"
TENANT_ACTOR_ID="e2e-tenant-admin-011"
FLAG_KEY="driver-app.shift"
REQUIRED_ROLE_CODES=("tenant_admin" "tenant_ops_admin")
LEGACY_SEED_TENANT_ID="10000000-0000-0000-0000-000000000201"
SEED_TENANT_ID=""

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-011 — Platform admin control-plane${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-011-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

RUN_TOKEN="$(date +%s%N 2>/dev/null | tail -c 10)"
if [[ -z "$RUN_TOKEN" || "$RUN_TOKEN" == *N ]]; then
  RUN_TOKEN="$(date +%s)"
fi

TENANT_CODE="e2e011_${RUN_TOKEN}"
TENANT_NAME="E2E 011 Tenant ${RUN_TOKEN}"
TENANT_EMAIL="admin+${RUN_TOKEN}@e2e.drts"
TENANT_ID=""

ENTRY_SLUG="e2e011-${RUN_TOKEN}"
PARTNER_CODE="partner_${RUN_TOKEN}"
PROGRAM_ID="program-${RUN_TOKEN}"

PRICING_RULE_ID=""
PRICING_VERSION="2026.05.${RUN_TOKEN}"

CREDENTIAL_KEY_ID=""
REJECTED_TENANT_CREATE_REQUEST_ID=""
REJECTED_PRICING_PUBLISH_REQUEST_ID=""
REJECTED_ROLLOUT_PROMOTE_REQUEST_ID=""

switch_platform_admin() {
  switch_actor "platform_admin" "$PLATFORM_ACTOR_ID" "${1:-}"
}

switch_seed_tenant_admin() {
  switch_actor "tenant_admin" "$TENANT_ACTOR_ID" "${1:-$SEED_TENANT_ID}"
}

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

require_non_empty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    log_fail "Missing ${label}"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

resolve_seed_tenant_id() {
  local requested_seed="${E2E_SEED_TENANT_ID:-}"
  local resolved_seed=""
  local resolved_code=""

  switch_platform_admin
  http_call GET "/platform-admin/tenants"
  assert_status "200"

  if [[ -n "$requested_seed" ]]; then
    resolved_seed=$(
      echo "$RESP_BODY" | jq -r --arg tenantId "$requested_seed" \
        '.data.items[] | select((.id // .tenantId // .tenant_id) == $tenantId) | (.id // .tenantId // .tenant_id)' \
        2>/dev/null | head -1 || true
    )
  fi

  if [[ -z "$resolved_seed" && "$requested_seed" == "$LEGACY_SEED_TENANT_ID" ]]; then
    resolved_seed=$(
      echo "$RESP_BODY" | jq -r \
        '.data.items[] | select((.id // .tenantId // .tenant_id) == "tenant-demo-001" or (.code // .tenantCode // .tenant_code) == "demo") | (.id // .tenantId // .tenant_id)' \
        2>/dev/null | head -1 || true
    )
  fi

  if [[ -z "$resolved_seed" ]]; then
    log_fail "Unable to resolve seed tenant for E2E-011"
    log_fail "Requested seed tenant: ${requested_seed:-<empty>}"
    log_fail "platform-admin/tenants response: ${RESP_BODY}"
    exit 1
  fi

  resolved_code=$(
    echo "$RESP_BODY" | jq -r --arg tenantId "$resolved_seed" \
      '.data.items[] | select((.id // .tenantId // .tenant_id) == $tenantId) | (.code // .tenantCode // .tenant_code // empty)' \
      2>/dev/null | head -1 || true
  )

  SEED_TENANT_ID="$resolved_seed"
  chain_set "seed" "tenantId" "$SEED_TENANT_ID"
  save_evidence "$SCENARIO" "seed" "tenantId" "$SEED_TENANT_ID"
  if [[ -n "$resolved_code" ]]; then
    chain_set "seed" "tenantCode" "$resolved_code"
    save_evidence "$SCENARIO" "seed" "tenantCode" "$resolved_code"
  fi

  if [[ "$requested_seed" != "$SEED_TENANT_ID" ]]; then
    log_info "Resolved seed tenant ${SEED_TENANT_ID} (requested ${requested_seed})"
  else
    log_info "Resolved seed tenant ${SEED_TENANT_ID}"
  fi
}

require_audit_jq() {
  local evidence_key="$1"
  local jq_filter="$2"

  switch_platform_admin
  http_call GET "/audit"
  assert_status "200"

  local audit_id
  audit_id=$(
    echo "$RESP_BODY" | jq -r "
      def audit_id: .auditId // .audit_id;
      def action_name: .actionName // .action_name;
      def resource_id: .resourceId // .resource_id;
      def tenant_id: .tenantId // .tenant_id;
      def new_values_summary: .newValuesSummary // .new_values_summary;
      def old_values_summary: .oldValuesSummary // .old_values_summary;
      ${jq_filter} | audit_id
    " 2>/dev/null | head -1 || true
  )
  if [[ -z "$audit_id" ]]; then
    log_fail "Missing audit evidence for ${evidence_key}"
    log_fail "Audit filter: ${jq_filter}"
    exit 1
  fi

  chain_set "audit" "$evidence_key" "$audit_id"
  save_evidence "$SCENARIO" "audit" "$evidence_key" "$audit_id"
  log_ok "Audit evidence captured for ${evidence_key}: ${audit_id}"
}

require_request_audit_jq() {
  local evidence_key="$1"
  local expected_request_id="$2"
  local jq_filter="$3"

  switch_platform_admin
  http_call GET "/audit"
  assert_status "200"

  local audit_id
  audit_id=$(
    echo "$RESP_BODY" | jq -r "
      def audit_id: .auditId // .audit_id;
      def actor_id: .actorId // .actor_id;
      def action_name: .actionName // .action_name;
      def request_id: .requestId // .request_id;
      def resource_id: .resourceId // .resource_id;
      def tenant_id: .tenantId // .tenant_id;
      def new_values_summary: .newValuesSummary // .new_values_summary;
      def old_values_summary: .oldValuesSummary // .old_values_summary;
      def summary_error_code:
        new_values_summary.errorCode //
        new_values_summary.error_code //
        old_values_summary.errorCode //
        old_values_summary.error_code //
        empty;
      def summary_reason_code:
        new_values_summary.reasonCode //
        new_values_summary.reason_code //
        old_values_summary.reasonCode //
        old_values_summary.reason_code //
        empty;
      def summary_reason:
        new_values_summary.reason //
        old_values_summary.reason //
        empty;
      def summary_outcome:
        new_values_summary.outcome //
        old_values_summary.outcome //
        empty;
      ${jq_filter} | audit_id
    " 2>/dev/null | head -1 || true
  )
  if [[ -z "$audit_id" ]]; then
    log_fail "Missing request audit evidence for ${evidence_key}"
    log_fail "Expected requestId: ${expected_request_id}"
    log_fail "Audit filter: ${jq_filter}"
    exit 1
  fi

  chain_set "audit" "$evidence_key" "$audit_id"
  save_evidence "$SCENARIO" "audit" "$evidence_key" "$audit_id"
  log_ok "Request audit evidence captured for ${evidence_key}: ${audit_id}"
}

assert_tenant_absent() {
  switch_platform_admin
  http_call GET "/platform-admin/tenants"
  assert_status "200"

  if echo "$RESP_BODY" | jq -e --arg code "$TENANT_CODE" '.data.items[] | select(.code == $code)' >/dev/null 2>&1; then
    log_fail "Tenant code ${TENANT_CODE} should not exist yet"
    exit 1
  fi
}

assert_flag_enabled() {
  local expected="$1"

  switch_platform_admin "$TENANT_ID"
  http_call GET "/admin/flags/${FLAG_KEY}/enabled"
  assert_status "200"

  local actual
  actual="$(echo "$RESP_BODY" | jq -r '.data.enabled' 2>/dev/null || true)"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "Expected flag ${FLAG_KEY} enabled=${expected}, got ${actual:-<empty>}"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi

  save_evidence "$SCENARIO" "flag" "enabled_${expected}" "$FLAG_KEY"
}

assert_pricing_rule_state() {
  local expected_status="$1"

  switch_platform_admin
  http_call GET "/platform-admin/pricing-rules"
  assert_status "200"

  local actual_status
  actual_status=$(
    echo "$RESP_BODY" | jq -r --arg ruleId "$PRICING_RULE_ID" \
      '.data.items[] | select((.ruleId // .rule_id) == $ruleId) | .status' \
      2>/dev/null | head -1 || true
  )
  if [[ "$actual_status" != "$expected_status" ]]; then
    log_fail "Expected pricing rule ${PRICING_RULE_ID} status=${expected_status}, got ${actual_status:-<empty>}"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

assert_masked_credential_listing() {
  switch_platform_admin
  http_call GET "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials"
  assert_status "200"

  if echo "$RESP_BODY" | jq -e '.data.items[] | (has("plaintextKey") or has("plaintext_key"))' >/dev/null 2>&1; then
    log_fail "Credential listing unexpectedly returned plaintextKey"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi

  if ! echo "$RESP_BODY" | jq -e --arg keyId "$CREDENTIAL_KEY_ID" '.data.items[] | select((.keyId // .key_id) == $keyId)' >/dev/null 2>&1; then
    log_fail "Credential listing did not contain keyId=${CREDENTIAL_KEY_ID}"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi

  log_ok "Partner credential list stays masked after issuance"
  save_evidence "$SCENARIO" "credential" "masked_listing" "$CREDENTIAL_KEY_ID"
}

write_tenant_create_body() {
  local path="$1"
  jq -n \
    --arg name "$TENANT_NAME" \
    --arg code "$TENANT_CODE" \
    --arg email "$TENANT_EMAIL" \
    '{
      name: $name,
      code: $code,
      integrationMode: "api_key_and_webhook",
      bootstrapAdminEmail: $email,
      sandboxBaseUrl: "https://sandbox.e2e.drts.example"
    }' > "$path"
}

write_module_settings_body() {
  local path="$1"
  jq -n '{
    enabledModules: [
      "enterprise_dispatch",
      "billing",
      "reporting",
      "webhooks"
    ]
  }' > "$path"
}

write_quota_policy_body() {
  local path="$1"
  local booking_limit="$2"
  jq -n \
    --argjson bookingCountLimit "$booking_limit" \
    '{
      period: "monthly",
      limit: {
        bookingCountLimit: $bookingCountLimit,
        amountMinorLimit: 0,
        currency: "TWD",
        enforcementMode: "hard_block"
      }
    }' > "$path"
}

write_partner_entry_body() {
  local path="$1"
  jq -n \
    --arg tenantId "$TENANT_ID" \
    --arg partnerCode "$PARTNER_CODE" \
    --arg programId "$PROGRAM_ID" \
    --arg entrySlug "$ENTRY_SLUG" \
    '{
      tenantId: $tenantId,
      partnerCode: $partnerCode,
      partnerType: "issuer",
      programId: $programId,
      entrySlug: $entrySlug,
      displayName: "E2E 011 Partner Entry",
      businessDispatchSubtype: "enterprise_dispatch",
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      entryHost: "partner.e2e.drts.example",
      entryPath: "/eligibility",
      themeAccent: "#0F172A"
    }' > "$path"
}

write_partner_entry_update_body() {
  local path="$1"
  jq -n '{
    displayName: "E2E 011 Partner Entry Updated",
    themeAccent: "#0F766E",
    brandingMetadata: {
      headline: "E2E 011 updated theme"
    }
  }' > "$path"
}

write_issue_credential_body() {
  local path="$1"
  jq -n '{
    rotationReason: "initial_issue"
  }' > "$path"
}

write_revoke_credential_body() {
  local path="$1"
  jq -n '{
    revokeReason: "e2e_cleanup"
  }' > "$path"
}

write_maintenance_body() {
  local path="$1"
  local enabled="$2"
  local reason="$3"
  jq -n \
    --argjson enabled "$enabled" \
    --arg reason "$reason" \
    '{
      enabled: $enabled,
      reason: $reason
    }' > "$path"
}

write_pricing_rule_body() {
  local path="$1"
  jq -n \
    --arg tenantId "$TENANT_ID" \
    --arg version "$PRICING_VERSION" \
    '{
      ruleName: "E2E 011 Enterprise Dispatch",
      version: $version,
      serviceFeeBps: 1250,
      reimbursementMode: "mixed",
      applicableTo: $tenantId,
      notes: "Repo-local E2E publish"
    }' > "$path"
}

write_pricing_publish_body() {
  local path="$1"
  jq -n \
    --arg version "$PRICING_VERSION" \
    --arg publishedBy "$PLATFORM_ACTOR_ID" \
    '{
      version: $version,
      publishedBy: $publishedBy
    }' > "$path"
}

write_flag_override_body() {
  local path="$1"
  local enabled="$2"
  local description="$3"
  jq -n \
    --argjson enabled "$enabled" \
    --arg description "$description" \
    '{
      enabled: $enabled,
      description: $description
    }' > "$path"
}

write_onboarding_body() {
  local path="$1"
  jq -n '{
    rollout: {
      sandboxStatus: "approved",
      cutoverOwner: "Launch Manager",
      rollbackOwner: "Ops Manager",
      rollbackPrepared: true,
      notes: "E2E-011 rollout preparation"
    }
  }' > "$path"
}

write_invite_role_body() {
  local path="$1"
  local role_code="$2"
  jq -n \
    --arg roleCode "$role_code" \
    --arg inviteeEmail "${role_code}+${RUN_TOKEN}@e2e.drts" \
    '{
      roleCode: $roleCode,
      inviteeEmail: $inviteeEmail
    }' > "$path"
}

write_ack_role_body() {
  local path="$1"
  local role_code="$2"
  jq -n --arg roleCode "$role_code" '{ roleCode: $roleCode }' > "$path"
}

write_rollout_body() {
  local path="$1"
  local stage="$2"
  local notes="$3"
  jq -n \
    --arg stage "$stage" \
    --arg notes "$notes" \
    '{
      stage: $stage,
      notes: $notes
    }' > "$path"
}

TENANT_CREATE_BODY="${TMP_DIR}/tenant-create.json"
MODULES_BODY="${TMP_DIR}/tenant-modules.json"
QUOTA_BODY_INITIAL="${TMP_DIR}/quota-policy-initial.json"
QUOTA_BODY_UPDATED="${TMP_DIR}/quota-policy-updated.json"
PARTNER_CREATE_BODY="${TMP_DIR}/partner-create.json"
PARTNER_UPDATE_BODY="${TMP_DIR}/partner-update.json"
CREDENTIAL_ISSUE_BODY="${TMP_DIR}/credential-issue.json"
CREDENTIAL_REVOKE_BODY="${TMP_DIR}/credential-revoke.json"
MAINTENANCE_ENABLE_BODY="${TMP_DIR}/maintenance-enable.json"
MAINTENANCE_DISABLE_BODY="${TMP_DIR}/maintenance-disable.json"
PRICING_CREATE_BODY="${TMP_DIR}/pricing-create.json"
PRICING_PUBLISH_BODY="${TMP_DIR}/pricing-publish.json"
FLAG_ENABLE_BODY="${TMP_DIR}/flag-enable.json"
FLAG_DISABLE_BODY="${TMP_DIR}/flag-disable.json"
ONBOARDING_BODY="${TMP_DIR}/tenant-onboarding.json"
ROLLOUT_PILOT_BODY="${TMP_DIR}/rollout-pilot.json"
ROLLOUT_PRODUCTION_BODY="${TMP_DIR}/rollout-production.json"

write_tenant_create_body "$TENANT_CREATE_BODY"
write_module_settings_body "$MODULES_BODY"
write_quota_policy_body "$QUOTA_BODY_INITIAL" 1000
write_quota_policy_body "$QUOTA_BODY_UPDATED" 500
write_maintenance_body "$MAINTENANCE_ENABLE_BODY" true "e2e_011_adapter_maintenance"
write_maintenance_body "$MAINTENANCE_DISABLE_BODY" false "e2e_011_adapter_resume"
write_pricing_publish_body "$PRICING_PUBLISH_BODY"
if [[ "$(jq -r '.version // empty' "$PRICING_PUBLISH_BODY" 2>/dev/null || true)" != "$PRICING_VERSION" ]]; then
  log_fail "Expected pricing publish payload version ${PRICING_VERSION}"
  exit 1
fi
write_flag_override_body "$FLAG_ENABLE_BODY" true "Enable shift flag for E2E-011 tenant"
write_flag_override_body "$FLAG_DISABLE_BODY" false "Disable shift flag for E2E-011 tenant"
write_onboarding_body "$ONBOARDING_BODY"
write_rollout_body "$ROLLOUT_PILOT_BODY" "pilot" "E2E-011 pilot promote"
write_rollout_body "$ROLLOUT_PRODUCTION_BODY" "production" "E2E-011 production promote"

log_surface "Login — identity context"
switch_platform_admin
http_call GET "/identity/context"
assert_status "200"

if [[ "$(json_get_first '.data.actorType' '.data.actor_type')" != "platform_admin" ]]; then
  log_fail "Expected platform_admin identity context"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
if [[ "$(json_get '.data.realm')" != "platform" ]]; then
  log_fail "Expected platform realm"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

chain_set "identity" "actorId" "$(json_get_first '.data.actorId' '.data.actor_id')"
save_evidence "$SCENARIO" "identity" "realm" "$(json_get '.data.realm')"
log_ok "Platform admin identity context resolved"

log_surface "Seed tenant validation"
resolve_seed_tenant_id
log_ok "Seed tenant available for negative-path actor context"

log_surface "RBAC negative — tenant create blocked"
switch_seed_tenant_admin
http_call POST "/platform-admin/tenants" "$TENANT_CREATE_BODY"
assert_status "403"
require_error_code "AUTH_REALM_DENIED"
REJECTED_TENANT_CREATE_REQUEST_ID="$LAST_REQUEST_ID"
assert_tenant_absent
save_evidence "$SCENARIO" "rbac_negative" "tenant_create_status" "$RESP_STATUS"
require_request_audit_jq \
  "reject_tenant_create" \
  "$REJECTED_TENANT_CREATE_REQUEST_ID" \
  ".data.items[] | select(request_id == \"${REJECTED_TENANT_CREATE_REQUEST_ID}\" and (summary_error_code == \"AUTH_REALM_DENIED\" or summary_reason_code == \"AUTH_REALM_DENIED\" or summary_reason == \"AUTH_REALM_DENIED\" or summary_outcome == \"rejected\"))"
log_ok "Tenant-admin actor cannot create platform tenants"

log_surface "Tenant create"
switch_platform_admin
http_call POST "/platform-admin/tenants" "$TENANT_CREATE_BODY"
assert_status "200|201"

TENANT_ID="$(json_get '.data.id')"
require_non_empty "$TENANT_ID" "tenant id"
chain_set "tenant" "tenantId" "$TENANT_ID"
chain_set "tenant" "tenantCode" "$TENANT_CODE"
save_evidence "$SCENARIO" "tenant" "tenantId" "$TENANT_ID"
require_audit_jq \
  "create_tenant" \
  ".data.items[] | select(action_name == \"create_platform_tenant\" and resource_id == \"${TENANT_ID}\")"

log_surface "Modules"
switch_platform_admin
http_call POST "/platform-admin/tenants/${TENANT_ID}/settings" "$MODULES_BODY"
assert_status "200|201"

if ! echo "$RESP_BODY" | jq -e '(.data.enabledModules // .data.enabled_modules) | index("webhooks")' >/dev/null 2>&1; then
  log_fail "Expected tenant module list to include webhooks"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

chain_set "modules" "webhooks" "enabled"
save_evidence "$SCENARIO" "modules" "tenantId" "$TENANT_ID"
require_audit_jq \
  "update_modules" \
  ".data.items[] | select(action_name == \"update_platform_tenant_settings\" and resource_id == \"${TENANT_ID}\" and ((new_values_summary.enabledModules // new_values_summary.enabled_modules) | index(\"webhooks\")))"

log_surface "Tenant quotas"
switch_platform_admin "$TENANT_ID"
http_call POST "/tenant/quotas/policies" "$QUOTA_BODY_INITIAL"
assert_status "200|201"

http_call GET "/tenant/quotas"
assert_status "200"
if [[ "$(json_get_first '.data.limit.bookingCountLimit' '.data.limit.booking_count_limit')" != "1000" ]]; then
  log_fail "Expected tenant booking quota limit 1000 after initial policy"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
require_audit_jq \
  "quota_policy_initial" \
  ".data.items[] | select(action_name == \"tenant.quota_policy.updated\" and tenant_id == \"${TENANT_ID}\" and resource_id == \"${TENANT_ID}\")"

switch_platform_admin "$TENANT_ID"
http_call POST "/tenant/quotas/policies" "$QUOTA_BODY_UPDATED"
assert_status "200|201"

http_call GET "/tenant/quotas"
assert_status "200"
if [[ "$(json_get_first '.data.limit.bookingCountLimit' '.data.limit.booking_count_limit')" != "500" ]]; then
  log_fail "Expected tenant booking quota limit 500 after update"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

chain_set "quota" "bookingCountLimit" "500"
save_evidence "$SCENARIO" "quota" "bookingCountLimit" "500"
require_audit_jq \
  "quota_policy_updated" \
  ".data.items[] | select(action_name == \"tenant.quota_policy.updated\" and tenant_id == \"${TENANT_ID}\" and resource_id == \"${TENANT_ID}\")"

log_surface "Partner entry"
write_partner_entry_body "$PARTNER_CREATE_BODY"
write_partner_entry_update_body "$PARTNER_UPDATE_BODY"

switch_platform_admin
http_call POST "/platform-admin/partner-entries" "$PARTNER_CREATE_BODY"
assert_status "200|201"

if [[ "$(json_get_first '.data.entrySlug' '.data.entry_slug')" != "$ENTRY_SLUG" ]]; then
  log_fail "Expected partner entry slug ${ENTRY_SLUG}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

chain_set "partner" "entrySlug" "$ENTRY_SLUG"
save_evidence "$SCENARIO" "partner" "entrySlug" "$ENTRY_SLUG"
require_audit_jq \
  "create_partner_entry" \
  ".data.items[] | select(action_name == \"create_partner_entry\" and resource_id == \"${ENTRY_SLUG}\")"

switch_platform_admin
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}" "$PARTNER_UPDATE_BODY"
assert_status "200|201"

if [[ "$(json_get_first '.data.themeAccent' '.data.theme_accent')" != "#0F766E" ]]; then
  log_fail "Expected updated partner theme accent"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

require_audit_jq \
  "update_partner_entry" \
  ".data.items[] | select(action_name == \"update_partner_entry\" and resource_id == \"${ENTRY_SLUG}\" and (new_values_summary.themeAccent // new_values_summary.theme_accent) == \"#0F766E\")"

log_surface "Partner credential"
write_issue_credential_body "$CREDENTIAL_ISSUE_BODY"
write_revoke_credential_body "$CREDENTIAL_REVOKE_BODY"

switch_platform_admin
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials/issue" "$CREDENTIAL_ISSUE_BODY"
assert_status "200|201"

CREDENTIAL_KEY_ID="$(json_get_first '.data.credential.keyId' '.data.credential.key_id')"
require_non_empty "$CREDENTIAL_KEY_ID" "partner credential keyId"
require_non_empty "$(json_get_first '.data.plaintextKey' '.data.plaintext_key')" "partner plaintextKey"
chain_set "credential" "keyId" "$CREDENTIAL_KEY_ID"
save_evidence "$SCENARIO" "credential" "keyId" "$CREDENTIAL_KEY_ID"
require_audit_jq \
  "issue_partner_credential" \
  ".data.items[] | select(action_name == \"issue_partner_ingress_credential\" and resource_id == \"${CREDENTIAL_KEY_ID}\")"

assert_masked_credential_listing

switch_platform_admin
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials/${CREDENTIAL_KEY_ID}/revoke" "$CREDENTIAL_REVOKE_BODY"
assert_status "200|201"
require_non_empty "$(json_get_first '.data.revokedAt' '.data.revoked_at')" "credential revokedAt"
require_audit_jq \
  "revoke_partner_credential" \
  ".data.items[] | select(action_name == \"revoke_partner_ingress_credential\" and resource_id == \"${CREDENTIAL_KEY_ID}\")"

log_surface "Adapter / switchboard"
switch_platform_admin
http_call GET "/forwarder/adapters/health"
assert_status "200"

ADAPTER_COUNT=$(echo "$RESP_BODY" | jq -r '.data.items | length' 2>/dev/null || true)
if [[ -z "$ADAPTER_COUNT" || "$ADAPTER_COUNT" == "0" ]]; then
  log_fail "Expected forwarder adapter health entries"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

chain_set "adapter" "healthCount" "$ADAPTER_COUNT"
save_evidence "$SCENARIO" "adapter" "healthCount" "$ADAPTER_COUNT"

switch_platform_admin
http_call POST "/platform-admin/maintenance-mode" "$MAINTENANCE_ENABLE_BODY"
assert_status "200|201"
if [[ "$(echo "$RESP_BODY" | jq -r '.data.enabled' 2>/dev/null || true)" != "true" ]]; then
  log_fail "Expected maintenance mode enabled"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
require_audit_jq \
  "enable_maintenance_mode" \
  ".data.items[] | select(action_name == \"enable_maintenance_mode\" and (new_values_summary.enabled // new_values_summary.enabled) == true)"

switch_platform_admin
http_call POST "/platform-admin/maintenance-mode" "$MAINTENANCE_DISABLE_BODY"
assert_status "200|201"
if [[ "$(echo "$RESP_BODY" | jq -r '.data.enabled' 2>/dev/null || true)" != "false" ]]; then
  log_fail "Expected maintenance mode disabled"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
require_audit_jq \
  "disable_maintenance_mode" \
  ".data.items[] | select(action_name == \"disable_maintenance_mode\" and (new_values_summary.enabled // new_values_summary.enabled) == false)"

log_surface "Pricing"
write_pricing_rule_body "$PRICING_CREATE_BODY"

switch_platform_admin
http_call POST "/platform-admin/pricing-rules" "$PRICING_CREATE_BODY"
assert_status "200|201"

PRICING_RULE_ID="$(json_get_first '.data.ruleId' '.data.rule_id')"
require_non_empty "$PRICING_RULE_ID" "pricing rule id"
if [[ "$(json_get '.data.version')" != "$PRICING_VERSION" ]]; then
  log_fail "Expected pricing version ${PRICING_VERSION}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

chain_set "pricing" "ruleId" "$PRICING_RULE_ID"
chain_set "pricing" "version" "$PRICING_VERSION"
save_evidence "$SCENARIO" "pricing" "ruleId" "$PRICING_RULE_ID"
require_audit_jq \
  "create_pricing_rule" \
  ".data.items[] | select(action_name == \"create_platform_pricing_rule\" and resource_id == \"${PRICING_RULE_ID}\" and (new_values_summary.version // new_values_summary.version) == \"${PRICING_VERSION}\")"

switch_seed_tenant_admin
http_call POST "/platform-admin/pricing-rules/${PRICING_RULE_ID}/publish" "$PRICING_PUBLISH_BODY"
assert_status "403"
require_error_code "AUTH_REALM_DENIED"
REJECTED_PRICING_PUBLISH_REQUEST_ID="$LAST_REQUEST_ID"
assert_pricing_rule_state "draft"
save_evidence "$SCENARIO" "rbac_negative" "pricing_publish_status" "$RESP_STATUS"
require_request_audit_jq \
  "reject_pricing_publish" \
  "$REJECTED_PRICING_PUBLISH_REQUEST_ID" \
  ".data.items[] | select(request_id == \"${REJECTED_PRICING_PUBLISH_REQUEST_ID}\" and (summary_error_code == \"AUTH_REALM_DENIED\" or summary_reason_code == \"AUTH_REALM_DENIED\" or summary_reason == \"AUTH_REALM_DENIED\" or summary_outcome == \"rejected\"))"
log_ok "Tenant-admin actor cannot publish platform pricing rules"

switch_platform_admin
http_call POST "/platform-admin/pricing-rules/${PRICING_RULE_ID}/publish" "$PRICING_PUBLISH_BODY"
assert_status "200|201"
if [[ "$(json_get '.data.status')" != "active" ]]; then
  log_fail "Expected published pricing rule to be active"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
if [[ "$(json_get '.data.version')" != "$PRICING_VERSION" ]]; then
  log_fail "Expected published pricing rule version ${PRICING_VERSION}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
require_audit_jq \
  "publish_pricing_rule" \
  ".data.items[] | select(action_name == \"publish_platform_pricing_rule\" and resource_id == \"${PRICING_RULE_ID}\" and (new_values_summary.version // new_values_summary.version) == \"${PRICING_VERSION}\")"

log_surface "Feature flag"
switch_platform_admin
http_call POST "/admin/flags/${FLAG_KEY}/tenant-overrides?tenantId=${TENANT_ID}" "$FLAG_ENABLE_BODY"
assert_status "200|201"
assert_flag_enabled "true"
require_audit_jq \
  "enable_flag_override" \
  ".data.items[] | select(action_name == \"upsert_feature_flag_tenant_override\" and resource_id == \"${FLAG_KEY}\" and tenant_id == \"${TENANT_ID}\" and (new_values_summary.enabled // new_values_summary.enabled) == true)"

switch_platform_admin
http_call POST "/admin/flags/${FLAG_KEY}/tenant-overrides?tenantId=${TENANT_ID}" "$FLAG_DISABLE_BODY"
assert_status "200|201"
assert_flag_enabled "false"
chain_set "flag" "key" "$FLAG_KEY"
save_evidence "$SCENARIO" "flag" "tenantId" "$TENANT_ID"
require_audit_jq \
  "disable_flag_override" \
  ".data.items[] | select(action_name == \"upsert_feature_flag_tenant_override\" and resource_id == \"${FLAG_KEY}\" and tenant_id == \"${TENANT_ID}\" and (new_values_summary.enabled // new_values_summary.enabled) == false)"

log_surface "Rollout"
switch_platform_admin
http_call POST "/platform-admin/tenants/${TENANT_ID}/onboarding" "$ONBOARDING_BODY"
assert_status "200|201"
require_audit_jq \
  "update_onboarding" \
  ".data.items[] | select(action_name == \"update_platform_tenant_onboarding\" and resource_id == \"${TENANT_ID}\" and ((new_values_summary.rollout.rollbackPrepared // new_values_summary.rollout.rollback_prepared)) == true)"

for role_code in "${REQUIRED_ROLE_CODES[@]}"; do
  invite_body="${TMP_DIR}/invite-${role_code}.json"
  ack_body="${TMP_DIR}/ack-${role_code}.json"
  write_invite_role_body "$invite_body" "$role_code"
  write_ack_role_body "$ack_body" "$role_code"

  switch_platform_admin
  http_call POST "/platform-admin/tenants/${TENANT_ID}/roles/invite" "$invite_body"
  assert_status "200|201"
  require_audit_jq \
    "invite_${role_code}" \
    ".data.items[] | select(action_name == \"invite_tenant_role\" and resource_id == \"${TENANT_ID}\" and (new_values_summary.roleCode // new_values_summary.role_code) == \"${role_code}\")"

  switch_platform_admin
  http_call POST "/platform-admin/tenants/${TENANT_ID}/roles/acknowledge" "$ack_body"
  assert_status "200|201"
  require_audit_jq \
    "acknowledge_${role_code}" \
    ".data.items[] | select(action_name == \"acknowledge_tenant_role\" and resource_id == \"${TENANT_ID}\" and (new_values_summary.roleCode // new_values_summary.role_code) == \"${role_code}\")"
done

switch_platform_admin
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLOUT_PILOT_BODY"
assert_status "200|201"
if [[ "$(json_get '.data.rollout.stage')" != "pilot" ]]; then
  log_fail "Expected tenant rollout stage pilot"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

chain_set "rollout" "stage" "pilot"
save_evidence "$SCENARIO" "rollout" "stage" "pilot"
require_audit_jq \
  "promote_rollout_pilot" \
  ".data.items[] | select(action_name == \"update_platform_tenant_rollout\" and resource_id == \"${TENANT_ID}\" and (new_values_summary.stage // new_values_summary.stage) == \"pilot\")"

log_surface "Rollback hold blocks production promote"
switch_platform_admin
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollback-hold"
assert_status "200|201"
if [[ "$(json_get '.data.status')" != "rollback_hold" ]]; then
  log_fail "Expected tenant rollback_hold status"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi

require_audit_jq \
  "rollback_hold" \
  ".data.items[] | select(action_name == \"set_tenant_rollback_hold\" and resource_id == \"${TENANT_ID}\")"

switch_platform_admin
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLOUT_PRODUCTION_BODY"
assert_status "409|403"
require_error_code "TENANT_IN_ROLLBACK_HOLD"
REJECTED_ROLLOUT_PROMOTE_REQUEST_ID="$LAST_REQUEST_ID"
require_request_audit_jq \
  "reject_production_promote" \
  "$REJECTED_ROLLOUT_PROMOTE_REQUEST_ID" \
  ".data.items[] | select(request_id == \"${REJECTED_ROLLOUT_PROMOTE_REQUEST_ID}\" and (summary_error_code == \"TENANT_IN_ROLLBACK_HOLD\" or summary_reason_code == \"production_rollback_hold_active\" or summary_reason == \"production_rollback_hold_active\" or summary_outcome == \"rejected\"))"

chain_set "rollback" "productionPromoteBlocked" "true"
save_evidence "$SCENARIO" "rollback" "errorCode" "TENANT_IN_ROLLBACK_HOLD"
log_ok "Rollback hold blocked production promotion as expected"

log_surface "Audit verification"
switch_platform_admin
http_call GET "/audit"
assert_status "200"

required_audit_actions=(
  "create_platform_tenant"
  "update_platform_tenant_settings"
  "tenant.quota_policy.updated"
  "create_partner_entry"
  "update_partner_entry"
  "issue_partner_ingress_credential"
  "revoke_partner_ingress_credential"
  "enable_maintenance_mode"
  "disable_maintenance_mode"
  "create_platform_pricing_rule"
  "publish_platform_pricing_rule"
  "upsert_feature_flag_tenant_override"
  "update_platform_tenant_onboarding"
  "invite_tenant_role"
  "acknowledge_tenant_role"
  "update_platform_tenant_rollout"
  "set_tenant_rollback_hold"
)

for action_name in "${required_audit_actions[@]}"; do
  if ! echo "$RESP_BODY" | jq -e --arg actionName "$action_name" '.data.items[] | select((.actionName // .action_name) == $actionName)' >/dev/null 2>&1; then
    log_fail "Audit log missing action ${action_name}"
    exit 1
  fi
done

chain_set "audit" "finalReview" "complete"
save_evidence "$SCENARIO" "audit" "finalReview" "complete"
log_ok "Audit log contains the full control-plane mutation chain"

log_step "Chain continuity assertions"
assert_chain "identity" "actorId"
assert_chain "seed" "tenantId"
assert_chain "tenant" "tenantId"
assert_chain "partner" "entrySlug"
assert_chain "credential" "keyId"
assert_chain "adapter" "healthCount"
assert_chain "pricing" "ruleId"
assert_chain "flag" "key"
assert_chain "rollout" "stage"
assert_chain "rollback" "productionPromoteBlocked"
assert_chain "audit" "reject_tenant_create"
assert_chain "audit" "reject_pricing_publish"
assert_chain "audit" "reject_production_promote"
assert_chain "audit" "finalReview"

print_chain_summary

echo ""
log_ok "E2E-011 complete — platform admin control-plane checks passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
