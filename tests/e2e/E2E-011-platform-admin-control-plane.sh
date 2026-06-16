#!/usr/bin/env bash
# E2E-011 — Platform Admin control plane
#
# Workflow family:
#   WF-ADM-001
#
# UAT authority:
#   docs/04-uat/platform-admin-control-plane-uat-20260519.md
#
# Surface chain:
#   Platform Admin -> tenant create/settings/onboarding/rollout
#   -> partner entry + ingress credential
#   -> adapter health / maintenance mode
#   -> pricing publish
#   -> tenant-scoped feature flag
#   -> rollback hold rejection
#   -> RBAC negative attempts
#   -> audit verification for every mutation and rejected attempt
#
# This scenario is intentionally strict: missing seed, missing audit, wrong
# rollback-hold reason, or non-admin control-plane access all fail the run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-011"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-011 — Platform Admin control plane${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-011-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

SUFFIX="$(date +%s | tail -c 7)"
TENANT_CODE="adm-e2e-${SUFFIX}"
TENANT_NAME="E2E Admin Control ${SUFFIX}"
ENTRY_SLUG="adm-e2e-entry-${SUFFIX}"
PARTNER_CODE="adm-e2e-partner-${SUFFIX}"
PARTNER_PROGRAM_ID="program-adm-e2e-${SUFFIX}"
PARTNER_PROGRAM_CODE="ADM-E2E-${SUFFIX}"
PRICING_VERSION="adm-e2e-${SUFFIX}"
FEATURE_FLAG_KEY="phase1.smoke-paths"

TENANT_ID=""
PRICING_RULE_ID=""
PRICING_VERSION_OBSERVED=""
CREDENTIAL_KEY_ID=""
AUDIT_BODY=""

declare -a EXPECTED_AUDIT=()

write_json() {
  local path="$1"
  shift
  jq -n "$@" > "$path"
}

require_nonempty() {
  local label="$1"
  local value="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    log_fail "${label} is missing"
    log_fail "Last response: ${RESP_BODY:-<empty>}"
    exit 1
  fi
}

expect_audit() {
  local action="$1"
  local resource_id="${2:-}"
  local label="${3:-$1}"
  EXPECTED_AUDIT+=("${action}|${resource_id}|${label}")
}

json_error_code() {
  echo "$RESP_BODY" | jq -r '
    .error.code
    // .error_code
    // .data.error.code
    // .data.error_code
    // .code
    // .reasonCode
    // .reason_code
    // empty
  ' 2>/dev/null || true
}

require_error_code() {
  local expected="$1"
  local actual
  actual="$(json_error_code)"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "Expected error code ${expected}, got ${actual:-<empty>}"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

require_audit_action() {
  local action="$1"
  local resource_id="$2"
  local label="$3"
  local count

  count=$(echo "$AUDIT_BODY" | jq -r \
    --arg action "$action" \
    --arg resourceId "$resource_id" '
      [
        (.data.items // .items // [])[]
        | select((.actionName // .action_name) == $action)
        | select($resourceId == "" or (.resourceId // .resource_id // "") == $resourceId)
      ]
      | length
    ' 2>/dev/null || echo "0")

  if [[ "$count" -lt 1 ]]; then
    log_fail "Audit missing for ${label}: action=${action}${resource_id:+ resourceId=${resource_id}}"
    exit 1
  fi

  log_ok "Audit present: ${label} (${action})"
}

require_audit_error_code() {
  local label="$1"
  local error_code="$2"
  local count

  count=$(echo "$AUDIT_BODY" | jq -r \
    --arg code "$error_code" '
      [
        (.data.items // .items // [])[]
        | select(
            (.newValuesSummary.errorCode // .new_values_summary.error_code // .newValuesSummary.reasonCode // .new_values_summary.reason_code // "") == $code
          )
      ]
      | length
    ' 2>/dev/null || echo "0")

  if [[ "$count" -lt 1 ]]; then
    log_fail "Audit missing rejected-attempt reason for ${label}: ${error_code}"
    exit 1
  fi

  log_ok "Rejected-attempt audit reason present: ${label} (${error_code})"
}

assert_json_truthy() {
  local label="$1"
  shift
  if ! echo "$RESP_BODY" | jq -e "$@" >/dev/null 2>&1; then
    log_fail "${label} assertion failed"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
  log_ok "${label}"
}

require_pricing_rule_readback() {
  local expected_rule_id="$1" expected_version="$2" expected_status="$3"
  switch_actor "platform_admin" "e2e-platform-admin-001"
  http_call GET "/platform-admin/pricing-rules"
  assert_status "200"

  local row_count row_status row_version
  row_count=$(echo "$RESP_BODY" | jq -r --arg ruleId "$expected_rule_id" '
    [(.data.items // .items // [])[]? | select((.ruleId // .rule_id) == $ruleId)] | length
  ' 2>/dev/null || echo "0")
  if [[ "${row_count:-0}" -ne 1 ]]; then
    log_fail "Expected exactly one pricing rule read-back row for ${expected_rule_id}, got ${row_count}: ${RESP_BODY}"
    exit 1
  fi

  row_status=$(echo "$RESP_BODY" | jq -r --arg ruleId "$expected_rule_id" '
    first((.data.items // .items // [])[]? | select((.ruleId // .rule_id) == $ruleId))
    | (.status // empty)
  ' 2>/dev/null || true)
  row_version=$(echo "$RESP_BODY" | jq -r --arg ruleId "$expected_rule_id" '
    first((.data.items // .items // [])[]? | select((.ruleId // .rule_id) == $ruleId))
    | (.version // empty)
  ' 2>/dev/null || true)

  if [[ "$row_status" != "$expected_status" ]]; then
    log_fail "Pricing rule read-back status mismatch for ${expected_rule_id}: want ${expected_status}, got '${row_status:-<empty>}'"
    exit 1
  fi
  if [[ "$row_version" != "$expected_version" ]]; then
    log_fail "Pricing rule read-back version mismatch for ${expected_rule_id}: want ${expected_version}, got '${row_version:-<empty>}'"
    exit 1
  fi

  save_evidence "$SCENARIO" "platform_admin" "pricingReadBackStatus" "$row_status"
  save_evidence "$SCENARIO" "platform_admin" "pricingReadBackVersion" "$row_version"
  log_ok "Pricing rule read-back preserved ruleId=${expected_rule_id}, version=${row_version}, status=${row_status}"
}

require_tenant_flag_readback() {
  local expected_enabled="$1"
  switch_actor "platform_admin" "e2e-platform-admin-001" "$TENANT_ID"
  http_call GET "/admin/flags/${FEATURE_FLAG_KEY}"
  assert_status "200"

  local flag_key flag_enabled flag_tenant_id
  flag_key=$(json_get_first ".data.key" ".data.flagKey" ".data.flag_key")
  flag_enabled=$(echo "$RESP_BODY" | jq -r '
    if (.data | has("enabled")) then (.data.enabled | tostring) else empty end
  ' 2>/dev/null || true)
  flag_tenant_id=$(json_get_first ".data.tenantId" ".data.tenant_id")

  if [[ "$flag_key" != "$FEATURE_FLAG_KEY" ]]; then
    log_fail "Feature flag read-back key mismatch: want ${FEATURE_FLAG_KEY}, got '${flag_key:-<empty>}'"
    exit 1
  fi
  if [[ "$flag_enabled" != "$expected_enabled" ]]; then
    log_fail "Feature flag read-back enabled mismatch for tenant ${TENANT_ID}: want ${expected_enabled}, got '${flag_enabled:-<empty>}'"
    exit 1
  fi
  if [[ "$flag_tenant_id" != "$TENANT_ID" ]]; then
    log_fail "Feature flag read-back did not return tenant-scoped override: want tenantId=${TENANT_ID}, got '${flag_tenant_id:-<empty>}'"
    exit 1
  fi

  http_call GET "/admin/flags/${FEATURE_FLAG_KEY}/enabled"
  assert_status "200"
  local enabled_value
  enabled_value=$(echo "$RESP_BODY" | jq -r '
    if (.data | has("enabled")) then (.data.enabled | tostring) else empty end
  ' 2>/dev/null || true)
  if [[ "$enabled_value" != "$expected_enabled" ]]; then
    log_fail "Feature flag enabled probe mismatch for tenant ${TENANT_ID}: want ${expected_enabled}, got '${enabled_value:-<empty>}'"
    exit 1
  fi

  save_evidence "$SCENARIO" "platform_admin" "featureFlagTenantId" "$flag_tenant_id"
  save_evidence "$SCENARIO" "platform_admin" "featureFlagEnabled" "$enabled_value"
  log_ok "Feature flag tenant override read-back preserved key=${FEATURE_FLAG_KEY}, tenantId=${flag_tenant_id}, enabled=${enabled_value}"
}

require_tenant_rollout_readback() {
  local expected_stage="$1" expected_production_status="${2:-}"
  switch_actor "platform_admin" "e2e-platform-admin-001"
  http_call GET "/platform-admin/tenants/${TENANT_ID}"
  assert_status "200"

  local tenant_id rollout_stage production_status
  tenant_id=$(json_get_first ".data.id" ".data.tenantId" ".data.tenant_id")
  rollout_stage=$(json_get_first ".data.rollout.stage" ".data.rolloutStage" ".data.rollout_stage")
  production_status=$(json_get_first ".data.rollout.productionStatus" ".data.rollout.production_status" ".data.productionStatus" ".data.production_status")

  if [[ "$tenant_id" != "$TENANT_ID" ]]; then
    log_fail "Tenant rollout read-back returned wrong tenant: want ${TENANT_ID}, got '${tenant_id:-<empty>}'"
    exit 1
  fi
  if [[ "$rollout_stage" != "$expected_stage" ]]; then
    log_fail "Tenant rollout read-back stage mismatch for ${TENANT_ID}: want ${expected_stage}, got '${rollout_stage:-<empty>}'"
    exit 1
  fi
  if [[ -n "$expected_production_status" && "$production_status" != "$expected_production_status" ]]; then
    log_fail "Tenant rollout productionStatus mismatch for ${TENANT_ID}: want ${expected_production_status}, got '${production_status:-<empty>}'"
    exit 1
  fi

  save_evidence "$SCENARIO" "platform_admin" "rolloutReadBackStage" "$rollout_stage"
  if [[ -n "$production_status" ]]; then
    save_evidence "$SCENARIO" "platform_admin" "rolloutReadBackProductionStatus" "$production_status"
  fi
  log_ok "Tenant rollout read-back preserved tenantId=${tenant_id}, stage=${rollout_stage}${production_status:+, productionStatus=${production_status}}"
}

log_surface "Platform Admin — tenant create / modules / quotas"
switch_actor "platform_admin" "e2e-platform-admin-001"

TENANT_CREATE_FILE="${TMP_DIR}/tenant-create.json"
write_json "$TENANT_CREATE_FILE" \
  --arg code "$TENANT_CODE" \
  --arg name "$TENANT_NAME" \
  '{
    code: $code,
    name: $name,
    status: "active",
    enabledModules: ["enterprise_dispatch", "billing"],
    quotas: {
      activeDrivers: 25,
      monthlyBookings: 1000,
      monthlyApiCalls: 25000
    },
    integrationMode: "api_key_and_webhook",
    bootstrapAdminEmail: "adm-e2e-admin@example.test",
    sandboxBaseUrl: "https://sandbox.adm-e2e.example.test"
  }'

log_step "UAT-ADM-001 — POST /platform-admin/tenants"
http_call POST "/platform-admin/tenants" "$TENANT_CREATE_FILE"
assert_status "200|201"
TENANT_ID="$(json_get_first ".data.id" ".data.tenantId" ".data.tenant_id")"
require_nonempty "tenantId" "$TENANT_ID"
chain_set "platform_admin" "tenantId" "$TENANT_ID"
save_evidence "$SCENARIO" "platform_admin" "tenantId" "$TENANT_ID"
expect_audit "create_platform_tenant" "$TENANT_ID" "UAT-ADM-001 tenant create"

TENANT_SETTINGS_FILE="${TMP_DIR}/tenant-settings.json"
write_json "$TENANT_SETTINGS_FILE" \
  '{
    enabledModules: ["enterprise_dispatch", "billing", "reporting", "webhooks"],
    quotas: {
      activeDrivers: 50,
      monthlyBookings: 500,
      monthlyApiCalls: 50000
    }
  }'

log_step "UAT-ADM-002/003 — POST /platform-admin/tenants/:tenantId/settings"
http_call POST "/platform-admin/tenants/${TENANT_ID}/settings" "$TENANT_SETTINGS_FILE"
assert_status "200|201"
assert_json_truthy "enabledModules include reporting + webhooks" \
  '((.data.enabledModules // .data.enabled_modules // []) | index("reporting")) and ((.data.enabledModules // .data.enabled_modules // []) | index("webhooks"))'
assert_json_truthy "monthlyBookings quota lowered to 500" \
  '(.data.quotas.monthlyBookings // .data.quotas.monthly_bookings) == 500'
save_evidence "$SCENARIO" "platform_admin" "enabledModules" "enterprise_dispatch,billing,reporting,webhooks"
save_evidence "$SCENARIO" "platform_admin" "monthlyBookingsQuota" "500"
expect_audit "update_platform_tenant_settings" "$TENANT_ID" "UAT-ADM-002/003 module + quota settings"

log_surface "Platform Admin — partner entry and credential"

PARTNER_ENTRY_FILE="${TMP_DIR}/partner-entry.json"
write_json "$PARTNER_ENTRY_FILE" \
  --arg tenantId "$TENANT_ID" \
  --arg partnerCode "$PARTNER_CODE" \
  --arg programId "$PARTNER_PROGRAM_ID" \
  --arg programCode "$PARTNER_PROGRAM_CODE" \
  --arg entrySlug "$ENTRY_SLUG" \
  '{
    tenantId: $tenantId,
    partnerCode: $partnerCode,
    partnerType: "issuer",
    programId: $programId,
    programCode: $programCode,
    bankCode: "E2E",
    entrySlug: $entrySlug,
    displayName: "E2E Admin Partner Entry",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "reference_required",
    entryHost: "adm-e2e.example.test",
    entryPath: "/adm-e2e",
    themeAccent: "#0f766e",
    brandingMetadata: {
      logoUrl: "https://adm-e2e.example.test/logo.svg",
      supportEmail: "support@adm-e2e.example.test",
      supportPhone: "+886-2-5550-0011"
    },
    status: "active",
    activeFlag: true
  }'

log_step "UAT-ADM-004 — POST /platform-admin/partner-entries"
http_call POST "/platform-admin/partner-entries" "$PARTNER_ENTRY_FILE"
assert_status "200|201"
assert_json_truthy "partner entry identity round-trips" \
  --arg entrySlug "$ENTRY_SLUG" --arg tenantId "$TENANT_ID" \
  '(.data.entrySlug // .data.entry_slug) == $entrySlug and (.data.tenantId // .data.tenant_id) == $tenantId'
save_evidence "$SCENARIO" "platform_admin" "partnerEntrySlug" "$ENTRY_SLUG"
expect_audit "create_partner_entry" "$ENTRY_SLUG" "UAT-ADM-004 partner entry create"

PARTNER_ENTRY_UPDATE_FILE="${TMP_DIR}/partner-entry-update.json"
write_json "$PARTNER_ENTRY_UPDATE_FILE" \
  '{
    displayName: "E2E Admin Partner Entry Updated",
    themeAccent: "#155e75",
    brandingMetadata: {
      logoUrl: "https://adm-e2e.example.test/logo-v2.svg",
      supportEmail: "support-v2@adm-e2e.example.test",
      supportPhone: "+886-2-5550-0012"
    }
  }'

log_step "UAT-ADM-004 — POST /platform-admin/partner-entries/:entrySlug update branding"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}" "$PARTNER_ENTRY_UPDATE_FILE"
assert_status "200|201"
assert_json_truthy "partner entry branding update applied" \
  '(.data.themeAccent // .data.theme_accent) == "#155e75"'
expect_audit "update_partner_entry" "$ENTRY_SLUG" "UAT-ADM-004 partner entry update"

CREDENTIAL_ISSUE_FILE="${TMP_DIR}/credential-issue.json"
write_json "$CREDENTIAL_ISSUE_FILE" '{ rotationReason: "e2e-011-initial-issue" }'

log_step "UAT-ADM-005 — POST /platform-admin/partner-entries/:entrySlug/credentials/issue"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials/issue" "$CREDENTIAL_ISSUE_FILE"
assert_status "200|201"
CREDENTIAL_KEY_ID="$(json_get_first ".data.credential.keyId" ".data.credential.key_id")"
require_nonempty "credential keyId" "$CREDENTIAL_KEY_ID"
save_evidence "$SCENARIO" "platform_admin" "credentialKeyId" "$CREDENTIAL_KEY_ID"
expect_audit "issue_partner_ingress_credential" "$CREDENTIAL_KEY_ID" "UAT-ADM-005 credential issue"

CREDENTIAL_REVOKE_FILE="${TMP_DIR}/credential-revoke.json"
write_json "$CREDENTIAL_REVOKE_FILE" '{ revokeReason: "e2e-011-revoke" }'

log_step "UAT-ADM-005 — POST /platform-admin/partner-entries/:entrySlug/credentials/:keyId/revoke"
http_call POST "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials/${CREDENTIAL_KEY_ID}/revoke" "$CREDENTIAL_REVOKE_FILE"
assert_status "200|201"
assert_json_truthy "credential is revoked" \
  '(.data.revokedAt // .data.revoked_at // "") != ""'
expect_audit "revoke_partner_ingress_credential" "$CREDENTIAL_KEY_ID" "UAT-ADM-005 credential revoke"

log_step "UAT-ADM-005 — GET /platform-admin/partner-entries/:entrySlug/credentials"
http_call GET "/platform-admin/partner-entries/${ENTRY_SLUG}/credentials"
assert_status "200"

CREDENTIAL_LIST_ROW_COUNT=$(echo "$RESP_BODY" | jq -r --arg keyId "$CREDENTIAL_KEY_ID" '
  [(.data.items // .items // [])[]? | select((.keyId // .key_id) == $keyId)] | length
' 2>/dev/null || echo "0")
if [[ "${CREDENTIAL_LIST_ROW_COUNT:-0}" -ne 1 ]]; then
  log_fail "Expected exactly one credential list row for ${CREDENTIAL_KEY_ID}, got ${CREDENTIAL_LIST_ROW_COUNT}: ${RESP_BODY}"
  exit 1
fi

CREDENTIAL_LIST_ROW=$(echo "$RESP_BODY" | jq -c --arg keyId "$CREDENTIAL_KEY_ID" '
  first((.data.items // .items // [])[]? | select((.keyId // .key_id) == $keyId)) // empty
' 2>/dev/null || true)
CREDENTIAL_LIST_REVOKED_AT=$(echo "$CREDENTIAL_LIST_ROW" | jq -r '.revokedAt // .revoked_at // empty' 2>/dev/null || true)
CREDENTIAL_LIST_REVOKED_BY=$(echo "$CREDENTIAL_LIST_ROW" | jq -r '.revokedBy // .revoked_by // empty' 2>/dev/null || true)
CREDENTIAL_LIST_REVOKE_REASON=$(echo "$CREDENTIAL_LIST_ROW" | jq -r '.revokeReason // .revoke_reason // empty' 2>/dev/null || true)
CREDENTIAL_LIST_KEY_PREFIX=$(echo "$CREDENTIAL_LIST_ROW" | jq -r '.keyPrefix // .key_prefix // empty' 2>/dev/null || true)
CREDENTIAL_LIST_MASKED_SUFFIX=$(echo "$CREDENTIAL_LIST_ROW" | jq -r '.maskedSuffix // .masked_suffix // empty' 2>/dev/null || true)
CREDENTIAL_LIST_RAW_SECRET_FIELDS=$(echo "$CREDENTIAL_LIST_ROW" | jq -r '
  [
    paths(scalars) as $path
    | {
        key: ($path | map(tostring) | join(".")),
        value: getpath($path)
      }
    | select(
        (.key | test("(^|\\.)(plaintextKey|plaintext_key|plainTextKey|plain_text_key|apiKey|api_key|secret|secretValue|secret_value|token|rawKey|raw_key|keyHash|key_hash)$"; "i"))
        or (
          (.key | test("(^|\\.)(keyPrefix|key_prefix|maskedSuffix|masked_suffix)$"; "i") | not)
          and (.value | type == "string")
          and (.value | test("^(pk_|tk_)"; "i"))
        )
      )
  ] | length
' 2>/dev/null || echo "1")

if [[ -z "$CREDENTIAL_LIST_REVOKED_AT" ]]; then
  log_fail "Credential list row did not preserve revokedAt after revoke: ${CREDENTIAL_LIST_ROW:-<empty>}"
  exit 1
fi
if [[ "$CREDENTIAL_LIST_REVOKED_BY" != "platform_admin" ]]; then
  log_fail "Credential list row revokedBy mismatch: want platform_admin, got '${CREDENTIAL_LIST_REVOKED_BY:-<empty>}'"
  exit 1
fi
if [[ "$CREDENTIAL_LIST_REVOKE_REASON" != "e2e-011-revoke" ]]; then
  log_fail "Credential list row revokeReason mismatch: want e2e-011-revoke, got '${CREDENTIAL_LIST_REVOKE_REASON:-<empty>}'"
  exit 1
fi
if [[ -z "$CREDENTIAL_LIST_KEY_PREFIX" || -z "$CREDENTIAL_LIST_MASKED_SUFFIX" ]]; then
  log_fail "Credential list row is missing masked key metadata: ${CREDENTIAL_LIST_ROW:-<empty>}"
  exit 1
fi
if [[ "${CREDENTIAL_LIST_RAW_SECRET_FIELDS:-1}" -ne 0 ]]; then
  log_fail "Credential list row exposed raw secret-bearing fields: ${CREDENTIAL_LIST_ROW:-<empty>}"
  exit 1
fi

save_evidence "$SCENARIO" "platform_admin" "credentialRevokedAt" "$CREDENTIAL_LIST_REVOKED_AT"
save_evidence "$SCENARIO" "platform_admin" "credentialMaskedSuffix" "$CREDENTIAL_LIST_MASKED_SUFFIX"
log_ok "Credential listing is revoked masked metadata only"

log_surface "Platform Admin — adapter health and maintenance mode"

log_step "UAT-ADM-006 — GET /forwarder/adapters/health"
http_call GET "/forwarder/adapters/health"
assert_status "200"
save_evidence "$SCENARIO" "platform_admin" "adapterHealthReadable" "true"

MAINTENANCE_ON_FILE="${TMP_DIR}/maintenance-on.json"
write_json "$MAINTENANCE_ON_FILE" '{ enabled: true, reason: "e2e-011-adapter-maintenance" }'
log_step "UAT-ADM-006 — POST /platform-admin/maintenance-mode enabled"
http_call POST "/platform-admin/maintenance-mode" "$MAINTENANCE_ON_FILE"
assert_status "200|201"
assert_json_truthy "maintenance mode enabled" '(.data.enabled == true)'
expect_audit "enable_maintenance_mode" "platform" "UAT-ADM-006 maintenance enable"

MAINTENANCE_OFF_FILE="${TMP_DIR}/maintenance-off.json"
write_json "$MAINTENANCE_OFF_FILE" '{ enabled: false, reason: "e2e-011-adapter-maintenance-complete" }'
log_step "UAT-ADM-006 — POST /platform-admin/maintenance-mode disabled"
http_call POST "/platform-admin/maintenance-mode" "$MAINTENANCE_OFF_FILE"
assert_status "200|201"
assert_json_truthy "maintenance mode disabled" '(.data.enabled == false)'
expect_audit "disable_maintenance_mode" "platform" "UAT-ADM-006 maintenance disable"

log_surface "Platform Admin — pricing publish and feature flag"

PRICING_CREATE_FILE="${TMP_DIR}/pricing-create.json"
write_json "$PRICING_CREATE_FILE" \
  --arg version "$PRICING_VERSION" \
  '{
    ruleName: "airport-transfer-economy",
    version: $version,
    serviceFeeBps: 1200,
    reimbursementMode: "mixed",
    applicableTo: "credit_card_airport_transfer",
    notes: "E2E-011 pricing version"
  }'

log_step "UAT-ADM-007 — POST /platform-admin/pricing-rules"
http_call POST "/platform-admin/pricing-rules" "$PRICING_CREATE_FILE"
assert_status "200|201"
PRICING_RULE_ID="$(json_get_first ".data.ruleId" ".data.rule_id")"
PRICING_VERSION_OBSERVED="$(json_get_first ".data.version")"
require_nonempty "pricing ruleId" "$PRICING_RULE_ID"
require_nonempty "pricing version" "$PRICING_VERSION_OBSERVED"
expect_audit "create_platform_pricing_rule" "$PRICING_RULE_ID" "UAT-ADM-007 pricing create"

PRICING_PUBLISH_FILE="${TMP_DIR}/pricing-publish.json"
write_json "$PRICING_PUBLISH_FILE" \
  --arg publishedBy "e2e-platform-admin-001" \
  '{ publishedBy: $publishedBy }'

log_step "UAT-ADM-007 — POST /platform-admin/pricing-rules/:ruleId/publish"
http_call POST "/platform-admin/pricing-rules/${PRICING_RULE_ID}/publish" "$PRICING_PUBLISH_FILE"
assert_status "200|201"
assert_json_truthy "pricing publish preserves non-null version" \
  --arg version "$PRICING_VERSION_OBSERVED" \
  '(.data.status == "active") and (.data.version == $version) and (.data.version != "")'
save_evidence "$SCENARIO" "platform_admin" "pricingRuleId" "$PRICING_RULE_ID"
save_evidence "$SCENARIO" "platform_admin" "pricingVersion" "$PRICING_VERSION_OBSERVED"
expect_audit "publish_platform_pricing_rule" "$PRICING_RULE_ID" "UAT-ADM-007 pricing publish"
require_pricing_rule_readback "$PRICING_RULE_ID" "$PRICING_VERSION_OBSERVED" "active"

FEATURE_ON_FILE="${TMP_DIR}/feature-on.json"
write_json "$FEATURE_ON_FILE" '{ enabled: true, description: "E2E-011 tenant override on" }'
log_step "UAT-ADM-008 — POST /admin/flags/:key/tenant-overrides enabled"
http_call POST "/admin/flags/${FEATURE_FLAG_KEY}/tenant-overrides?tenantId=${TENANT_ID}" "$FEATURE_ON_FILE"
assert_status "200|201"
assert_json_truthy "tenant feature flag enabled" '(.data.enabled == true)'
expect_audit "upsert_tenant_feature_flag" "${FEATURE_FLAG_KEY}:${TENANT_ID}" "UAT-ADM-008 feature flag enable"
require_tenant_flag_readback "true"

FEATURE_OFF_FILE="${TMP_DIR}/feature-off.json"
write_json "$FEATURE_OFF_FILE" '{ enabled: false, description: "E2E-011 tenant override off" }'
log_step "UAT-ADM-008 — POST /admin/flags/:key/tenant-overrides disabled"
http_call POST "/admin/flags/${FEATURE_FLAG_KEY}/tenant-overrides?tenantId=${TENANT_ID}" "$FEATURE_OFF_FILE"
assert_status "200|201"
assert_json_truthy "tenant feature flag disabled" '(.data.enabled == false)'
expect_audit "upsert_tenant_feature_flag" "${FEATURE_FLAG_KEY}:${TENANT_ID}" "UAT-ADM-008 feature flag disable"
require_tenant_flag_readback "false"

log_surface "Platform Admin — rollout promotion and rollback hold"

ROLLOUT_SANDBOX_FILE="${TMP_DIR}/rollout-sandbox.json"
write_json "$ROLLOUT_SANDBOX_FILE" '{ stage: "sandbox", notes: "E2E-011 approve sandbox" }'
log_step "UAT-ADM-009 — POST /platform-admin/tenants/:tenantId/rollout sandbox"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLOUT_SANDBOX_FILE"
assert_status "200|201"
expect_audit "update_platform_tenant_rollout" "$TENANT_ID" "UAT-ADM-009 rollout sandbox"

ROLLOUT_PILOT_FILE="${TMP_DIR}/rollout-pilot.json"
write_json "$ROLLOUT_PILOT_FILE" '{ stage: "pilot", notes: "E2E-011 pilot promotion" }'
log_step "UAT-ADM-009 — POST /platform-admin/tenants/:tenantId/rollout pilot"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLOUT_PILOT_FILE"
assert_status "200|201"
assert_json_truthy "tenant promoted to pilot" '(.data.rollout.stage == "pilot")'
expect_audit "update_platform_tenant_rollout" "$TENANT_ID" "UAT-ADM-009 rollout pilot"
require_tenant_rollout_readback "pilot"

log_step "UAT-ADM-010 — POST /platform-admin/tenants/:tenantId/rollback-hold"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollback-hold"
assert_status "200|201"
expect_audit "set_tenant_rollback_hold" "$TENANT_ID" "UAT-ADM-010 rollback hold"
require_tenant_rollout_readback "pilot" "blocked"

ROLLOUT_PRODUCTION_FILE="${TMP_DIR}/rollout-production.json"
write_json "$ROLLOUT_PRODUCTION_FILE" '{ stage: "production", notes: "E2E-011 blocked production promotion" }'
log_step "UAT-ADM-010 — POST /platform-admin/tenants/:tenantId/rollout production blocked"
http_call POST "/platform-admin/tenants/${TENANT_ID}/rollout" "$ROLLOUT_PRODUCTION_FILE"
if [[ "$RESP_STATUS" != "409" ]]; then
  log_fail "Expected rollback-hold production promote rejection HTTP 409, got ${RESP_STATUS}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
require_error_code "TENANT_IN_ROLLBACK_HOLD"
save_evidence "$SCENARIO" "platform_admin" "rollbackHoldReasonCode" "TENANT_IN_ROLLBACK_HOLD"
expect_audit "reject_platform_tenant_rollout" "$TENANT_ID" "UAT-ADM-010 rejected production promote"
require_tenant_rollout_readback "pilot" "blocked"

log_surface "RBAC negative paths"

TENANT_CREATE_DENIED_FILE="${TMP_DIR}/tenant-create-denied.json"
write_json "$TENANT_CREATE_DENIED_FILE" \
  --arg code "${TENANT_CODE}-denied" \
  '{ code: $code, name: "Denied Tenant", status: "active" }'

switch_actor "tenant_admin" "e2e-tenant-admin-001" "$TENANT_ID"

log_step "UAT-ADM-N01 — tenant admin cannot create platform tenant"
http_call POST "/platform-admin/tenants" "$TENANT_CREATE_DENIED_FILE"
if [[ "$RESP_STATUS" != "403" ]]; then
  log_fail "Expected non-platform-admin tenant create rejection HTTP 403, got ${RESP_STATUS}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
require_error_code "AUTH_REALM_DENIED"
save_evidence "$SCENARIO" "rbac" "tenantCreateDeniedCode" "AUTH_REALM_DENIED"
expect_audit "reject_platform_tenant_create" "" "UAT-ADM-N01 tenant-create rejected attempt"

PRICING_DENIED_FILE="${TMP_DIR}/pricing-denied.json"
write_json "$PRICING_DENIED_FILE" \
  '{
    ruleName: "airport-transfer-economy",
    version: "denied-e2e-011",
    serviceFeeBps: 999,
    reimbursementMode: "mixed",
    applicableTo: "credit_card_airport_transfer"
  }'

log_step "UAT-ADM-N02 — tenant admin cannot publish/create platform pricing"
http_call POST "/platform-admin/pricing-rules" "$PRICING_DENIED_FILE"
if [[ "$RESP_STATUS" != "403" ]]; then
  log_fail "Expected non-platform-admin pricing write rejection HTTP 403, got ${RESP_STATUS}"
  log_fail "Body: ${RESP_BODY}"
  exit 1
fi
require_error_code "AUTH_REALM_DENIED"
save_evidence "$SCENARIO" "rbac" "pricingWriteDeniedCode" "AUTH_REALM_DENIED"
expect_audit "reject_platform_pricing_publish" "" "UAT-ADM-N02 pricing rejected attempt"

log_surface "Platform Admin — audit verification"
switch_actor "platform_admin" "e2e-platform-admin-001"

log_step "UAT-ADM-011 — GET /audit"
http_call GET "/audit"
assert_status "200"
AUDIT_BODY="$RESP_BODY"

for expectation in "${EXPECTED_AUDIT[@]}"; do
  IFS='|' read -r action resource_id label <<< "$expectation"
  require_audit_action "$action" "$resource_id" "$label"
done

require_audit_error_code "UAT-ADM-010 rejected production promote" "TENANT_IN_ROLLBACK_HOLD"
require_audit_error_code "UAT-ADM-N01 tenant-create rejected attempt" "AUTH_REALM_DENIED"
require_audit_error_code "UAT-ADM-N02 pricing rejected attempt" "AUTH_REALM_DENIED"

AUDIT_ENTRY_COUNT=$(echo "$AUDIT_BODY" | jq -r '(.data.items // .items // []) | length' 2>/dev/null || echo "0")
save_evidence "$SCENARIO" "platform_admin" "auditEntryCount" "$AUDIT_ENTRY_COUNT"

print_chain_summary

echo ""
log_ok "E2E-011 complete — Platform Admin control plane mutations, RBAC negatives, rollback hold, and audit chain passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
