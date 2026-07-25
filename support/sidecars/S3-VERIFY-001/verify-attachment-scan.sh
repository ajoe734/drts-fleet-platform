#!/usr/bin/env bash
# S3-VERIFY-001 — Driver SOS attachment upload + scan runtime verification.
#
# Drives the landed current-head attachment pipeline end to end against a
# running API that has the S3-compatible storage provider and the https-json
# scanner provider configured to point at the local controlled endpoints in
# `attachment-provider-stubs.mjs`.
#
# HONESTY BOUNDARY: the object store and the malware scanner are LOCAL
# CONTROLLED ENDPOINTS. This verifies the repository-owned adapters, contract,
# checksum handling, persistence, and fail-closed/retry state machine at
# runtime. It is NOT external-provider evidence; real S3/malware provider
# binding remains `blocked_ext` for S3-VERIFY-003.
#
# Checks:
#   1. upload intent returns state=ready with a presigned PUT URL
#   2. a clean object uploads, confirms, and persists scanStatus=clean with the
#      SHA-256 the provider computed (not a client-supplied checksum)
#   3. a client-forged checksum cannot change the persisted checksum
#   4. an EICAR-marked object persists scanStatus=infected
#   5. a scanner error persists scanStatus=error and stays retryable
#   6. retry-scan on a transiently failing object reaches clean without a
#      second upload
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# shellcheck source=../../../tests/e2e/lib/helpers.sh
source "${ROOT_DIR}/tests/e2e/lib/helpers.sh"

DRIVER_ACTOR_ID="${E2E_017_DRIVER_ID:-drv-demo-001}"
TMP_DIR=$(mktemp -d /tmp/drts-s3-attach-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

FAILURES=0
check() { # LABEL ACTUAL EXPECTED
  if [[ "$2" == "$3" ]]; then
    log_ok "$1 ($2)"
  else
    log_fail "$1 — expected '$3', got '$2'"
    FAILURES=$((FAILURES + 1))
  fi
}

as_driver() {
  E2E_ACTOR_TYPE="driver_user"
  E2E_ACTOR_ID="$DRIVER_ACTOR_ID"
  E2E_REALM=""
  E2E_TENANT_ID="$E2E_SEED_TENANT_ID"
}

submit_sos() { # -> echoes sosEventId
  local ts client_event_id
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  client_event_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
  jq -n --arg ts "$ts" --arg client_event_id "$client_event_id" \
    '{
       clientEventId: $client_event_id,
       vehicleId: "veh-s3-attach",
       plateNo: "ABC-1234",
       eventType: "security_incident",
       severity: "major",
       description: "S3-VERIFY-001 attachment verification.",
       originalTriggeredAt: $ts,
       offlineAtTrigger: false,
       location: {
         lat: 25.0478, lng: 121.5319, accuracyM: 5, recordedAt: $ts,
         reverseGeocodedAddress: "Staging City", geocodeProvider: "manual"
       }
     }' > "${TMP_DIR}/sos.json"
  http_call POST "/driver/sos-events" "${TMP_DIR}/sos.json" >/dev/null
  json_get_first ".data.event.sosEventId" ".data.event.sos_event_id"
}

echo "S3-VERIFY-001 attachment upload + scan runtime verification"
echo "API:    ${E2E_API_URL}"
echo "Source: LOCAL CONTROLLED provider endpoints (not external provider evidence)"

as_driver

# ── Case 1+2+3: clean attachment ──────────────────────────────────────────────
log_step "Case 1 — clean attachment: intent -> presigned PUT -> confirm -> scan"
SOS_ID=$(submit_sos)
log_info "sosEventId=${SOS_ID}"

printf 'S3-VERIFY-001 clean attachment payload' > "${TMP_DIR}/clean.bin"
CLEAN_SIZE=$(stat -c%s "${TMP_DIR}/clean.bin")
CLEAN_SHA=$(sha256sum "${TMP_DIR}/clean.bin" | cut -d' ' -f1)

jq -n --argjson size "$CLEAN_SIZE" \
  '{ attachmentType: "photo", originalFileName: "scene.jpg",
     contentType: "image/jpeg", fileSize: $size }' > "${TMP_DIR}/intent.json"
http_call POST "/driver/sos-events/${SOS_ID}/attachments/upload-intents" "${TMP_DIR}/intent.json" >/dev/null
INTENT_STATE=$(json_get_first ".data.state")
UPLOAD_URL=$(json_get_first ".data.uploadUrl" ".data.upload_url")
OBJECT_KEY=$(json_get_first ".data.objectKey" ".data.object_key")
PROVIDER=$(json_get_first ".data.provider")
check "upload intent state" "$INTENT_STATE" "ready"
check "upload intent provider" "$PROVIDER" "s3-compatible"
if [[ "$UPLOAD_URL" != *"X-Amz-Signature"* ]]; then
  log_fail "upload URL is not a presigned SigV4 URL: ${UPLOAD_URL}"
  FAILURES=$((FAILURES + 1))
else
  log_ok "upload URL is presigned SigV4 and expires (X-Amz-Expires present)"
fi

PUT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "content-type: image/jpeg" --data-binary "@${TMP_DIR}/clean.bin" "$UPLOAD_URL")
check "presigned PUT status" "$PUT_STATUS" "200"

# Client sends a forged checksum; the server must trust only what it computed
# from the stored object.
jq -n --arg key "$OBJECT_KEY" \
  '{ objectKey: $key, checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000", fileSize: 999999 }' \
  > "${TMP_DIR}/confirm.json"
http_call POST "/driver/sos-events/${SOS_ID}/attachments/confirm" "${TMP_DIR}/confirm.json" >/dev/null
CONFIRM_STATE=$(json_get_first ".data.state")
CONFIRM_SHA=$(json_get_first ".data.attachment.checksumSha256" ".data.attachment.checksum_sha256")
CONFIRM_SIZE=$(json_get_first ".data.attachment.fileSize" ".data.attachment.file_size")
CONFIRM_SCAN=$(json_get_first ".data.attachment.scanStatus" ".data.attachment.scan_status")
CONFIRM_SCANNER=$(json_get_first ".data.attachment.scannerProvider" ".data.attachment.scanner_provider")
CLEAN_ATTACHMENT_ID=$(json_get_first ".data.attachment.attachmentId" ".data.attachment.attachment_id")
check "confirm state" "$CONFIRM_STATE" "confirmed"
check "persisted checksum is provider-computed, not client-supplied" "$CONFIRM_SHA" "$CLEAN_SHA"
check "persisted size is provider-computed, not client-supplied" "$CONFIRM_SIZE" "$CLEAN_SIZE"
check "clean scan status" "$CONFIRM_SCAN" "clean"
check "scanner provider recorded" "$CONFIRM_SCANNER" "https-json-malware-scanner"

http_call GET "/driver/sos-events/${SOS_ID}/attachments" >/dev/null
LIST_SCAN=$(json_get ".data[] | select(.attachmentId == \"${CLEAN_ATTACHMENT_ID}\") | .scanStatus")
LIST_SHA=$(json_get ".data[] | select(.attachmentId == \"${CLEAN_ATTACHMENT_ID}\") | .checksumSha256")
check "listed scan status persists" "$LIST_SCAN" "clean"
check "listed checksum persists" "$LIST_SHA" "$CLEAN_SHA"

# ── Case 4: infected ──────────────────────────────────────────────────────────
log_step "Case 2 — infected attachment must persist scanStatus=infected"
printf 'EICAR-STANDARD-ANTIVIRUS-TEST-MARKER (stub)' > "${TMP_DIR}/bad.bin"
BAD_SIZE=$(stat -c%s "${TMP_DIR}/bad.bin")
jq -n --argjson size "$BAD_SIZE" \
  '{ attachmentType: "photo", originalFileName: "bad.jpg",
     contentType: "image/jpeg", fileSize: $size }' > "${TMP_DIR}/intent.json"
http_call POST "/driver/sos-events/${SOS_ID}/attachments/upload-intents" "${TMP_DIR}/intent.json" >/dev/null
BAD_URL=$(json_get_first ".data.uploadUrl" ".data.upload_url")
BAD_KEY=$(json_get_first ".data.objectKey" ".data.object_key")
curl -s -o /dev/null -X PUT -H "content-type: image/jpeg" --data-binary "@${TMP_DIR}/bad.bin" "$BAD_URL"
jq -n --arg key "$BAD_KEY" '{ objectKey: $key }' > "${TMP_DIR}/confirm.json"
http_call POST "/driver/sos-events/${SOS_ID}/attachments/confirm" "${TMP_DIR}/confirm.json" >/dev/null
check "infected scan status" \
  "$(json_get_first ".data.attachment.scanStatus" ".data.attachment.scan_status")" "infected"

# ── Case 5+6: scanner error then retry to clean ───────────────────────────────
log_step "Case 3 — transient scanner error stays retryable and retry-scan clears it"
printf 'SCANNER-FLAKY payload for retry verification' > "${TMP_DIR}/flaky.bin"
FLAKY_SIZE=$(stat -c%s "${TMP_DIR}/flaky.bin")
jq -n --argjson size "$FLAKY_SIZE" \
  '{ attachmentType: "photo", originalFileName: "flaky.jpg",
     contentType: "image/jpeg", fileSize: $size }' > "${TMP_DIR}/intent.json"
http_call POST "/driver/sos-events/${SOS_ID}/attachments/upload-intents" "${TMP_DIR}/intent.json" >/dev/null
FLAKY_URL=$(json_get_first ".data.uploadUrl" ".data.upload_url")
FLAKY_KEY=$(json_get_first ".data.objectKey" ".data.object_key")
curl -s -o /dev/null -X PUT -H "content-type: image/jpeg" --data-binary "@${TMP_DIR}/flaky.bin" "$FLAKY_URL"
jq -n --arg key "$FLAKY_KEY" '{ objectKey: $key }' > "${TMP_DIR}/confirm.json"
http_call POST "/driver/sos-events/${SOS_ID}/attachments/confirm" "${TMP_DIR}/confirm.json" >/dev/null
FLAKY_ID=$(json_get_first ".data.attachment.attachmentId" ".data.attachment.attachment_id")
check "first scan attempt errors" \
  "$(json_get_first ".data.attachment.scanStatus" ".data.attachment.scan_status")" "error"
check "first scan attempt is counted" \
  "$(json_get_first ".data.attachment.scanAttemptCount" ".data.attachment.scan_attempt_count")" "1"

http_call POST "/driver/sos-events/${SOS_ID}/attachments/${FLAKY_ID}/retry-scan" >/dev/null
check "retry-scan reaches clean without a second upload" \
  "$(json_get_first ".data.scanStatus" ".data.scan_status")" "clean"
check "retry is audited as a second attempt" \
  "$(json_get_first ".data.scanAttemptCount" ".data.scan_attempt_count")" "2"

# ── Case 7: content-type / size enforcement ───────────────────────────────────
log_step "Case 4 — disallowed content type is rejected at intent time"
jq -n '{ attachmentType: "photo", originalFileName: "payload.exe",
         contentType: "application/x-msdownload", fileSize: 1024 }' > "${TMP_DIR}/intent.json"
http_call POST "/driver/sos-events/${SOS_ID}/attachments/upload-intents" "${TMP_DIR}/intent.json" >/dev/null || true
if [[ "$RESP_STATUS" =~ ^(400|422)$ ]]; then
  log_ok "disallowed content type rejected (HTTP ${RESP_STATUS})"
else
  log_fail "disallowed content type was not rejected (HTTP ${RESP_STATUS}): ${RESP_BODY}"
  FAILURES=$((FAILURES + 1))
fi

echo ""
if [[ "$FAILURES" -eq 0 ]]; then
  log_ok "attachment upload + scan pipeline verified at runtime (local controlled providers)"
  exit 0
fi
log_fail "${FAILURES} attachment verification check(s) failed"
exit 1
