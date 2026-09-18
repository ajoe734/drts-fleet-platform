#!/usr/bin/env bash
# E2E-018 — Driver device provisioning lifecycle
#
# Surface chain: Driver App onboarding -> driver-bound bearer session ->
# refresh-token rotation -> driver self-service route -> device revoke.
#
# Verifies:
#   1. A provisionable registration code issues a driver-bound access token,
#      refresh token, and binding id.
#   2. The access token can read the driver self-service profile via the JWT
#      fast-path, not bootstrap headers.
#   3. Refresh rotates the refresh token and rejects replay of the old token.
#   4. The bound driver can revoke the binding.
#   5. Revoked access and refresh tokens are rejected after revoke.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-018"
chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-018 — Driver device provisioning lifecycle${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

TMP_DIR="$(mktemp -d /tmp/drts-e2e-018-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

REGISTRATION_CODE="${E2E_018_REGISTRATION_CODE:-driver-demo-001}"
EXPECTED_DRIVER_ID="${E2E_018_DRIVER_ID:-drv-demo-001}"
DEVICE_ID="${E2E_018_DEVICE_ID:-e2e-device-${_E2E_RUN_ID}}"
DEVICE_LABEL="${E2E_018_DEVICE_LABEL:-E2E lifecycle device ${_E2E_RUN_ID}}"

REGISTER_FIXTURE="${TMP_DIR}/register.json"
REFRESH_FIXTURE="${TMP_DIR}/refresh.json"
OLD_REFRESH_FIXTURE="${TMP_DIR}/refresh-old.json"
REVOKE_FIXTURE="${TMP_DIR}/revoke.json"

require_non_empty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    log_fail "${label} is empty"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

assert_equal() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    log_fail "${label} mismatch: expected ${expected}, got '${actual:-<empty>}'"
    exit 1
  fi
}

expect_error_code() {
  local expected="$1"
  local actual
  actual=$(json_get_first ".error.code" ".code" ".data.code")
  if [[ "$actual" != "$expected" ]]; then
    log_fail "Expected error code ${expected}, got '${actual:-<empty>}'"
    log_fail "Body: ${RESP_BODY}"
    exit 1
  fi
}

expect_error_code_one_of() {
  local actual expected
  actual=$(json_get_first ".error.code" ".code" ".data.code")
  for expected in "$@"; do
    if [[ "$actual" == "$expected" ]]; then
      return 0
    fi
  done
  log_fail "Expected error code one of [$*], got '${actual:-<empty>}'"
  log_fail "Body: ${RESP_BODY}"
  exit 1
}

http_call_with_driver_bearer() {
  local token="$1"
  local method="$2"
  local path="$3"
  local body_file="${4:-}"
  local previous_bearer="${E2E_REQUEST_BEARER_TOKEN:-}"

  E2E_REQUEST_BEARER_TOKEN="$token"
  http_call "$method" "$path" "$body_file"
  E2E_REQUEST_BEARER_TOKEN="$previous_bearer"
}

write_refresh_fixture() {
  local file="$1"
  local refresh_token="$2"

  jq -n \
    --arg refreshToken "$refresh_token" \
    --arg deviceId "$DEVICE_ID" \
    '{
      refreshToken: $refreshToken,
      deviceId: $deviceId
    }' > "$file"
}

log_surface "Driver App — device onboarding"

jq -n \
  --arg registrationCode "$REGISTRATION_CODE" \
  --arg deviceId "$DEVICE_ID" \
  --arg deviceLabel "$DEVICE_LABEL" \
  '{
    registrationCode: $registrationCode,
    deviceId: $deviceId,
    deviceLabel: $deviceLabel
  }' > "$REGISTER_FIXTURE"

log_step "1.1 — POST /auth/driver/device/register"
http_call POST "/auth/driver/device/register" "$REGISTER_FIXTURE"
assert_status "200|201"

ACCESS_TOKEN=$(json_get_first ".data.accessToken" ".data.access_token")
REFRESH_TOKEN=$(json_get_first ".data.refreshToken" ".data.refresh_token")
BINDING_ID=$(json_get_first ".data.bindingId" ".data.binding_id")
DRIVER_ID=$(json_get_first ".data.driverId" ".data.driver_id")
SESSION_DEVICE_ID=$(json_get_first ".data.deviceId" ".data.device_id")
TOKEN_TYPE=$(json_get_first ".data.tokenType" ".data.token_type")

require_non_empty "$ACCESS_TOKEN" "accessToken"
require_non_empty "$REFRESH_TOKEN" "refreshToken"
require_non_empty "$BINDING_ID" "bindingId"
assert_equal "driverId" "$EXPECTED_DRIVER_ID" "$DRIVER_ID"
assert_equal "deviceId" "$DEVICE_ID" "$SESSION_DEVICE_ID"
assert_equal "tokenType" "Bearer" "$TOKEN_TYPE"

chain_set "driver_device" "driverId" "$DRIVER_ID"
chain_set "driver_device" "deviceId" "$SESSION_DEVICE_ID"
chain_set "driver_device" "bindingId" "$BINDING_ID"
save_evidence "$SCENARIO" "driver_device" "bindingId" "$BINDING_ID"
save_evidence "$SCENARIO" "driver_device" "deviceId" "$SESSION_DEVICE_ID"
log_ok "Registered device ${DEVICE_ID} for ${DRIVER_ID}; binding=${BINDING_ID}"

log_step "1.2 — GET /driver/profile with issued bearer"
http_call_with_driver_bearer "$ACCESS_TOKEN" GET "/driver/profile"
assert_status "200"
PROFILE_DRIVER_ID=$(json_get_first ".data.driverId" ".data.driver_id")
assert_equal "profile.driverId" "$EXPECTED_DRIVER_ID" "$PROFILE_DRIVER_ID"
log_ok "Issued access token can read driver profile via JWT bearer auth"

log_surface "Driver App — refresh rotation"

write_refresh_fixture "$REFRESH_FIXTURE" "$REFRESH_TOKEN"

log_step "2.1 — POST /auth/driver/device/refresh"
http_call POST "/auth/driver/device/refresh" "$REFRESH_FIXTURE"
assert_status "200|201"

REFRESHED_ACCESS_TOKEN=$(json_get_first ".data.accessToken" ".data.access_token")
REFRESHED_REFRESH_TOKEN=$(json_get_first ".data.refreshToken" ".data.refresh_token")
REFRESHED_BINDING_ID=$(json_get_first ".data.bindingId" ".data.binding_id")

require_non_empty "$REFRESHED_ACCESS_TOKEN" "refreshed accessToken"
require_non_empty "$REFRESHED_REFRESH_TOKEN" "refreshed refreshToken"
assert_equal "refreshed bindingId" "$BINDING_ID" "$REFRESHED_BINDING_ID"
if [[ "$REFRESHED_REFRESH_TOKEN" == "$REFRESH_TOKEN" ]]; then
  log_fail "Refresh token was not rotated."
  exit 1
fi
save_evidence "$SCENARIO" "driver_device" "refreshRotated" "true"
log_ok "Refresh token rotated for binding=${REFRESHED_BINDING_ID}"

log_step "2.2 — GET /driver/profile with refreshed bearer"
http_call_with_driver_bearer "$REFRESHED_ACCESS_TOKEN" GET "/driver/profile"
assert_status "200"
PROFILE_DRIVER_ID=$(json_get_first ".data.driverId" ".data.driver_id")
assert_equal "profile.driverId after refresh" "$EXPECTED_DRIVER_ID" "$PROFILE_DRIVER_ID"
log_ok "Refreshed access token is usable before revoke or replay compromise"

log_surface "Driver App — device revoke"

jq -n \
  --arg bindingId "$BINDING_ID" \
  --arg deviceId "$DEVICE_ID" \
  '{
    bindingId: $bindingId,
    deviceId: $deviceId
  }' > "$REVOKE_FIXTURE"

log_step "3.1 — POST /auth/driver/device/revoke with refreshed bearer"
http_call_with_driver_bearer "$REFRESHED_ACCESS_TOKEN" POST "/auth/driver/device/revoke" "$REVOKE_FIXTURE"
assert_status "200|201"
REVOKED_AT=$(json_get_first ".data.revokedAt" ".data.revoked_at")
require_non_empty "$REVOKED_AT" "revokedAt"
save_evidence "$SCENARIO" "driver_device" "revokedAt" "$REVOKED_AT"
log_ok "Device binding revoked at ${REVOKED_AT}"

log_step "3.2 — original access token must be rejected after revoke"
http_call_with_driver_bearer "$ACCESS_TOKEN" GET "/driver/profile"
assert_status "401"
expect_error_code_one_of "DRIVER_DEVICE_SESSION_INVALID" "JWT_INVALID"
log_ok "Original access token rejected after revoke"

log_step "3.3 — refreshed access token must be rejected after revoke"
http_call_with_driver_bearer "$REFRESHED_ACCESS_TOKEN" GET "/driver/profile"
assert_status "401"
expect_error_code_one_of "DRIVER_DEVICE_SESSION_INVALID" "JWT_INVALID"
log_ok "Refreshed access token rejected after revoke"

log_step "3.4 — current refresh token must be rejected after revoke"
write_refresh_fixture "$REFRESH_FIXTURE" "$REFRESHED_REFRESH_TOKEN"
http_call POST "/auth/driver/device/refresh" "$REFRESH_FIXTURE"
assert_status "401"
expect_error_code "DRIVER_DEVICE_REFRESH_INVALID"
log_ok "Refresh token rejected after revoke"

# A replay after revocation must never revive the device binding. Replay while
# active is covered by the identity-session integration test, where it also
# proves refresh-family compromise invalidates every bearer for that session.
log_step "3.5 — old refresh token cannot revive a revoked device session"
write_refresh_fixture "$OLD_REFRESH_FIXTURE" "$REFRESH_TOKEN"
http_call POST "/auth/driver/device/refresh" "$OLD_REFRESH_FIXTURE"
assert_status "401"
expect_error_code "DRIVER_DEVICE_REFRESH_INVALID"
log_ok "Old refresh token rejected after device revoke"

log_step "Chain continuity assertions"
assert_chain "driver_device" "driverId"
assert_chain "driver_device" "deviceId"
assert_chain "driver_device" "bindingId"
print_chain_summary

echo ""
log_ok "E2E-018 complete — driver device lifecycle is registerable, refreshable, revocable, and revoked sessions are blocked."
echo -e "Evidence log: ${EVIDENCE_FILE}"
